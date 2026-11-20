import { createHash } from 'node:crypto';
import { cp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './product-fixture';
import { createPublishedOffer, registerAndLogin } from './product-data';

async function controlled(page: Page) {
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  return page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
}

async function cachedApiUrls(page: Page) {
  return page.evaluate(async () => {
    const storage = await Promise.all((await caches.keys()).map(key => caches.open(key)));
    const cached = (await Promise.all(storage.map(cache => cache.keys()))).flat();
    return cached.map(request => new URL(request.url).pathname).filter(path => path.startsWith('/api/'));
  });
}

test('Chromium reconoce la PWA y conserva solo la interfaz al recargar sin red', async ({ page, context, product }) => {
  await registerAndLogin(context, product.origin, 'Perfil ficticio PWA');
  const appointments = product.url + 'mis-citas';
  await page.goto(appointments);
  await expect(page.getByRole('heading', { name: 'Mis citas' })).toBeVisible();
  await expect(page.getByText('No hay citas en este periodo.')).toBeVisible();
  expect(await controlled(page)).toBe(product.url);
  const devtools = await context.newCDPSession(page);
  const details = await devtools.send('Page.getAppManifest');
  expect(details.errors.filter(error => error.critical)).toEqual([]);
  expect(details.url).toBe(product.url + 'manifest.product.webmanifest');
  expect(JSON.parse(details.data!).display).toBe('standalone');
  const installability = await devtools.send('Page.getInstallabilityErrors');
  // Playwright's default test context is incognito and cannot install OS shortcuts.
  expect(installability.installabilityErrors.filter(error => error.errorId !== 'in-incognito')).toEqual([]);
  expect(await cachedApiUrls(page)).toEqual([]);

  await context.setOffline(true);
  const response = await page.reload();
  expect(response?.fromServiceWorker()).toBe(true);
  await expect(page.getByRole('heading', { name: 'No pudimos comprobar tu sesión' })).toBeVisible();
  // Some Chromium versions keep navigator.onLine true during protocol emulation.
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByText(/Estás sin conexión/)).toBeVisible();
  await expect(page.getByText('No hay citas en este periodo.')).toHaveCount(0);
  const apiOffline = await page.evaluate(async () => {
    try { return (await fetch('/api/auth/me')).status; } catch { return 0; }
  });
  expect(apiOffline).not.toBe(200);
  expect(await cachedApiUrls(page)).toEqual([]);

  await context.setOffline(false);
  await page.goto(appointments);
  await expect(page.getByRole('heading', { name: 'Mis citas' })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('link', { name: 'Iniciar sesión', exact: true })).toBeVisible();
  expect((await page.request.get(product.origin + '/api/auth/me')).status()).toBe(401);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('link', { name: 'Mis citas', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Encuentra tu próximo lugar/ })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByText(/Estás sin conexión/)).toBeVisible();
});

test('avisa de una nueva versión y solo la aplica al confirmar', async ({ page, product }, info) => {
  await page.goto(product.url);
  expect(await controlled(page)).toBe(product.url);
  // Navigate through the worker before changing assets so the current client
  // is assigned to a fully initialized version.
  expect((await page.reload())?.fromServiceWorker()).toBe(true);
  await expect(page.getByRole('heading', { name: /Encuentra tu próximo lugar/ })).toBeVisible();
  const nextDir = info.outputPath('next-product');
  await cp(product.outputDir, nextDir, { recursive: true });
  const indexPath = join(nextDir, 'index.html');
  const index = (await readFile(indexPath, 'utf8')).replace('</head>', '<meta name="goodlook-test-build" content="next"></head>');
  await writeFile(indexPath, index);
  const workerPath = join(nextDir, 'ngsw.json');
  const manifest = JSON.parse(await readFile(workerPath, 'utf8'));
  manifest.hashTable[manifest.index] = createHash('sha1').update(index).digest('hex');
  manifest.timestamp += 1;
  await writeFile(workerPath, JSON.stringify(manifest));
  product.setOutputDir(nextDir);
  try {
    const served = await page.request.get(product.url + 'ngsw.json');
    expect(await served.json()).toEqual(manifest);
    const servedIndex = await page.request.get(product.url + 'index.html');
    expect(await servedIndex.text()).toContain('goodlook-test-build');
    const update = page.getByRole('button', { name: 'Actualizar GoodLook' });
    await expect(async () => {
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(update).toBeVisible({ timeout: 2400 });
    }).toPass({ timeout: 30_000 });
    await expect(page.locator('meta[name="goodlook-test-build"]')).toHaveCount(0);
    await update.click();
    await expect(page.locator('meta[name="goodlook-test-build"]')).toHaveAttribute('content', 'next');
  } finally {
    product.setOutputDir(product.outputDir);
  }
});

test('impide confirmar una reserva cuando el navegador pierde la conexión', async ({ page, context, browser, product }) => {
  const owner = await browser.newContext();
  const professional = await browser.newContext();
  try {
    await registerAndLogin(owner, product.origin, 'Responsable PWA');
    await registerAndLogin(professional, product.origin, 'Profesional PWA');
    await registerAndLogin(context, product.origin, 'Cliente PWA');
    const offer = await createPublishedOffer({ owner, professional, origin: product.origin });
    await page.goto(product.url + 'reservar/' + offer.businessId);
    await page.getByLabel('Servicio', { exact: true }).selectOption(offer.serviceId);
    await page.getByLabel('Profesional', { exact: true }).selectOption(offer.professionalId);
    await page.getByRole('radio').first().check();
    await controlled(page);
    const confirm = page.getByRole('button', { name: 'Confirmar reserva' });
    await expect(confirm).toBeEnabled();
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.getByText(/Estás sin conexión/)).toBeVisible();
    await expect(confirm).toBeDisabled();
    await expect(page.getByText('Cita confirmada', { exact: true })).toHaveCount(0);
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(page.getByText('Cita confirmada', { exact: true })).toBeVisible();
  } finally {
    await owner.close();
    await professional.close();
  }
});

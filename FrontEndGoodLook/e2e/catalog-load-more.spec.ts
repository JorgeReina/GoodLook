import type { Page } from '@playwright/test';
import { expect, test } from './product-fixture';

function business(id: string, name: string) {
  return { id, name, timezone: 'UTC', sector: 'Estética', address: 'Calle ficticia' };
}

async function mockCatalogPages(page: Page) {
  await page.route(url => url.pathname === '/api/catalog/businesses', async route => {
    const requested = new URL(route.request().url()).searchParams.get('page') ?? '1';
    const first = requested === '1';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'X-Has-More': first ? 'true' : 'false' },
      body: JSON.stringify(first
        ? [business('loto', 'Loto Estudio'), business('nudo', 'Nudo Barber')]
        : [business('nudo', 'Nudo Barber'), business('norte', 'Barbería Norte')]),
    });
  });
}

test('abre un negocio que no está en la primera página del listado', async ({ browser, product }) => {
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 850 } });
  try {
    const page = await context.newPage();
    await mockCatalogPages(page);
    await page.route(url => url.pathname === '/api/catalog/businesses/norte', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(business('norte', 'Barbería Norte')),
      });
    });
    await page.route(url => url.pathname === '/api/catalog/businesses/norte/services', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'cut', name: 'Corte Norte', durationMinutes: 30, priceCents: 1999, currency: 'EUR', description: null }]),
      });
    });
    await page.goto(product.url);
    await expect(page.getByRole('link', { name: 'Barbería Norte' })).toHaveCount(0);
    await page.goto(product.url + 'negocios/norte');
    await expect(page.getByRole('heading', { name: 'Barbería Norte' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Corte Norte' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Reservar Corte Norte' })).toBeVisible();
  } finally {
    await context.close();
  }
});

test('carga más negocios cuando el catálogo indica X-Has-More', async ({ browser, product }) => {
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 850 } });
  try {
    const page = await context.newPage();
    await mockCatalogPages(page);
    await page.goto(product.url);
    await expect(page.getByRole('link', { name: 'Loto Estudio' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Barbería Norte' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Cargar más' }).click();
    await expect(page.getByRole('link', { name: 'Barbería Norte' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Nudo Barber' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Cargar más' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Barbería Norte' })).toBeFocused();
  } finally {
    await context.close();
  }
});

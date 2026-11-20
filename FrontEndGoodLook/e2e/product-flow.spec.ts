import { createHash } from 'node:crypto';
import type { Page, Response } from '@playwright/test';
import { expect, test } from './product-fixture';
import { allDayHours, syntheticCredentials, write } from './product-data';

function responseTo(page: Page, path: string, method: string) {
  return page.waitForResponse(response =>
    new URL(response.url()).pathname === path && response.request().method() === method,
  );
}

async function successfulJson<T>(response: Response, status: number): Promise<T> {
  expect(response.status(), new URL(response.url()).pathname).toBe(status);
  return response.json() as Promise<T>;
}

async function submitRegistration(page: Page, displayName: string) {
  const credentials = syntheticCredentials();
  await page.getByLabel('Nombre', { exact: true }).fill(displayName);
  await page.getByLabel('Correo electrónico').fill(credentials.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(credentials.password);
  const login = responseTo(page, '/api/auth/login', 'POST');
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  expect((await login).status()).toBe(200);
}

test('recorre Gestión, invitación, reserva y consulta de las citas', async ({ browser, product }) => {
  const options = { serviceWorkers: 'block' as const, viewport: { width: 390, height: 850 } };
  const owner = await browser.newContext(options);
  const professional = await browser.newContext(options);
  const customer = await browser.newContext(options);
  try {
    const manager = await owner.newPage();
    await test.step('crear una oferta privada', async () => {
      await manager.goto(product.url + 'acceso?modo=registro');
      await submitRegistration(manager, 'Responsable');
      await manager.getByRole('link', { name: 'Registrar negocio' }).click();
      await manager.getByLabel('Nombre', { exact: true }).fill('Estudio de aceptación');
      await manager.getByLabel('Sector', { exact: true }).fill('Belleza');
      await manager.getByLabel('Dirección', { exact: true }).fill('Calle ficticia');
      await manager.getByLabel('Zona horaria IANA').fill('UTC');
    });

    const created = responseTo(manager, '/api/manage/businesses', 'POST');
    await manager.getByRole('button', { name: 'Crear ficha privada' }).click();
    const business = await successfulJson<{ id: string; isPublic: boolean }>(await created, 201);
    expect(business.isPublic).toBe(false);
    const management = '/api/manage/businesses/' + business.id;
    await manager.getByLabel('Nombre del servicio').fill('Corte de aceptación');
    await manager.getByLabel('Precio', { exact: true }).fill('19,99');
    const serviceCreated = responseTo(manager, management + '/services', 'POST');
    await manager.getByRole('button', { name: 'Guardar servicio' }).click();
    const service = await successfulJson<{ id: string; priceCents: number }>(await serviceCreated, 201);
    expect(service.priceCents).toBe(1999);

    await manager.getByLabel('Nombre público del profesional').fill('Profesional de prueba');
    const staffCreated = responseTo(manager, management + '/staff', 'POST');
    await manager.getByRole('button', { name: 'Añadir profesional' }).click();
    const staff = await successfulJson<{ id: string }>(await staffCreated, 201);
    const staffPath = management + '/staff/' + staff.id;
    await manager.getByRole('button', { name: 'Generar invitación' }).click();
    const invitation = manager.getByRole('textbox', { name: 'Enlace de un solo uso' });
    const employee = await professional.newPage();

    await test.step('vincular una cuenta profesional y publicar la ficha', async () => {
      await employee.goto(await invitation.inputValue());
      await employee.getByRole('main').getByRole('link', { name: 'Iniciar sesión' }).click();
      await employee.getByRole('link', { name: 'Crea una cuenta' }).click();
      await submitRegistration(employee, 'Profesional de prueba');
      await employee.getByRole('button', { name: 'Aceptar invitación' }).click();
      await expect(employee.getByText('Tu perfil profesional está vinculado.')).toBeVisible();
      expect(new URL(employee.url()).hash).toBe('');
      expect((await write(owner, product.origin, staffPath + '/hours', 'PUT', { hours: allDayHours() })).status()).toBe(204);
      await manager.reload();
      await manager.getByRole('checkbox', { name: 'Corte de aceptación' }).check();
      const assignments = responseTo(manager, staffPath + '/services', 'PUT');
      await manager.getByRole('button', { name: 'Guardar asignaciones' }).click();
      expect((await assignments).status()).toBe(204);
      const published = responseTo(manager, management + '/visibility', 'PUT');
      await manager.getByRole('button', { name: 'Publicar ficha' }).click();
      expect((await published).status()).toBe(204);
    });

    const client = await customer.newPage();
    await client.goto(product.url + 'acceso?modo=registro');
    await submitRegistration(client, 'Cliente de prueba');
    await client.getByRole('link', { name: 'Estudio de aceptación' }).click();
    await client.getByRole('link', { name: /Reservar/ }).click();
    await client.getByLabel('Profesional', { exact: true }).selectOption(staff.id);
    await client.getByRole('radio').first().check();

    await test.step('revisar la nueva oferta y recuperar una confirmación incierta', async () => {
      const changed = await write(owner, product.origin, management + '/services/' + service.id, 'PATCH', { priceCents: 2499 });
      expect(changed.status()).toBe(204);
      const quoteChanged = responseTo(client, '/api/bookings', 'POST');
      await client.getByRole('button', { name: 'Confirmar reserva' }).click();
      expect((await quoteChanged).status()).toBe(409);
      await expect(client.getByText(/La oferta ha cambiado/)).toBeVisible();
      await expect(client.getByText(/24,99/).last()).toBeVisible();

      const calls: { key?: string; digest: string; status: number }[] = [];
      await customer.route('**/api/bookings', async route => {
        const request = route.request();
        const real = await route.fetch({ maxRetries: 0 });
        calls.push({
          key: request.headers()['idempotency-key'],
          digest: createHash('sha256').update(request.postData() ?? '').digest('hex'),
          status: real.status(),
        });
        if (calls.length === 1) await route.abort('failed');
        else await route.fulfill({ response: real });
      });
      await client.getByRole('button', { name: 'Confirmar reserva' }).click();
      await expect(client.getByRole('heading', { name: 'Confirmación pendiente' })).toBeVisible();
      await client.getByRole('button', { name: 'Reintentar confirmación' }).click();
      await expect(client.getByText('Cita confirmada', { exact: true })).toBeVisible();
      expect(calls.map(call => call.status)).toEqual([201, 200]);
      expect(Boolean(calls[0].key && calls[0].key === calls[1].key)).toBe(true);
      expect(calls[0].digest).toBe(calls[1].digest);
    });

    await test.step('releer la cita y comprobar el alcance por rol', async () => {
      await client.getByRole('link', { name: 'Consultar Mis citas' }).click();
      await expect(client.getByRole('heading', { name: 'Corte de aceptación' })).toHaveCount(1);
      await client.reload();
      await expect(client.getByRole('heading', { name: 'Corte de aceptación' })).toHaveCount(1);
      await expect(client.getByText(/Confirmada.*24,99/)).toBeVisible();
      await employee.getByRole('link', { name: 'Abrir mi agenda' }).click();
      const appointment = employee.getByText('Corte de aceptación · Cliente de prueba', { exact: true });
      await expect(employee.getByRole('heading', { name: 'Mi agenda' })).toBeVisible();
      // The first available slot may be next Monday when the current week is ending.
      const next = employee.getByRole('button', { name: 'Semana siguiente' });
      await expect(appointment.or(employee.getByText('No hay citas esta semana.', { exact: true }))).toBeVisible();
      if (!(await appointment.isVisible())) await next.click();
      await expect(appointment).toBeVisible();

      await client.goto(product.url + 'gestion?negocio=' + business.id);
      await expect(client.getByRole('heading', { name: 'Acceso restringido' })).toBeVisible();
      expect((await customer.request.get(product.origin + management)).status()).toBe(403);
    });
  } finally {
    await Promise.all([owner.close(), professional.close(), customer.close()]);
  }
});

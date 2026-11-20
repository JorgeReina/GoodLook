import { randomUUID } from 'node:crypto';
import type { APIResponse, BrowserContext } from '@playwright/test';
import { expect } from '@playwright/test';

export function syntheticCredentials() {
  return { email: `${randomUUID()}@example.test`, password: `GoodLook-${randomUUID()}` };
}

export function write(
  context: BrowserContext, origin: string, path: string, method: string, data?: object, headers?: Record<string, string>,
) {
  return context.request.fetch(new URL(path, origin).href, { method, data, headers: { ...headers, Origin: origin } });
}

export async function jsonOn<T>(response: APIResponse, status: number): Promise<T> {
  expect(response.status(), new URL(response.url()).pathname).toBe(status);
  return response.json() as Promise<T>;
}

export async function registerAndLogin(context: BrowserContext, origin: string, name: string) {
  const credentials = syntheticCredentials();
  const registration = await write(context, origin, '/api/auth/register', 'POST', { ...credentials, displayName: name });
  expect(registration.status()).toBe(201);
  const session = await write(context, origin, '/api/auth/login', 'POST', credentials);
  expect(session.status()).toBe(200);
}

export function allDayHours() {
  return Array.from({ length: 7 }, (_, index) => ({ weekday: index + 1, startTime: '00:00', endTime: '24:00' }));
}

export async function createPublishedOffer({ owner, professional, origin }: {
  owner: BrowserContext; professional: BrowserContext; origin: string;
}) {
  const { id: businessId } = await jsonOn<{ id: string }>(await write(owner, origin, '/api/manage/businesses', 'POST', {
    name: 'Estudio PWA', sector: 'Belleza', address: 'Dirección ficticia', timezone: 'UTC',
  }), 201);
  const manage = '/api/manage/businesses/' + businessId;
  const { id: serviceId } = await jsonOn<{ id: string }>(await write(owner, origin, manage + '/services', 'POST', {
    name: 'Corte PWA', priceCents: 1999, currency: 'EUR', durationMinutes: 30,
  }), 201);
  const { id: professionalId } = await jsonOn<{ id: string }>(await write(owner, origin, manage + '/staff', 'POST', {
    displayName: 'Profesional PWA',
  }), 201);
  const { token } = await jsonOn<{ token: string }>(await write(owner, origin, '/api/invitations', 'POST', {
    businessId, professionalId,
  }), 201);
  expect((await write(professional, origin, '/api/invitations/accept', 'POST', { token })).status()).toBe(204);
  const member = manage + '/staff/' + professionalId;
  expect((await write(owner, origin, member + '/services', 'PUT', { serviceIds: [serviceId] })).status()).toBe(204);
  expect((await write(owner, origin, member + '/hours', 'PUT', { hours: allDayHours() })).status()).toBe(204);
  expect((await write(owner, origin, manage + '/visibility', 'PUT', { isPublic: true })).status()).toBe(204);
  return { businessId, professionalId, serviceId };
}

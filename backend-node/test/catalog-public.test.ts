import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { publicCatalogRoutes } from '../src/catalog/public.js';
import type { AuthStore, User } from '../src/auth/store.js';
import { PUBLIC_CATALOG_CACHE } from '../src/http/cache-control.js';

const business = '231c2e85-cba6-44e3-a803-fac58a3f7ff4';
const service = 'd5502df6-1f29-47b8-8af4-d2101326580f';
const professional = 'b1ca7e0e-b0b4-49ac-a311-fe23403cfc43';
const user: User = { id: '4c95e891-d8b5-40cb-93c9-b1429db9a71d', email: 'a@example.test', displayName: 'A', passwordHash: 'x' };
const auth: AuthStore = {
  async createUser() { return false; },
  async findUserByEmail() { return null; },
  async createSession() {},
  async findUserBySession() { return user; },
  async deleteSession() {},
};

const queries: { sql: string; params: unknown }[] = [];
const pool = {
  async execute(sql: string, params: unknown = []) {
    queries.push({ sql, params });
    if (sql.includes('SELECT id FROM businesses')) return [[{ id: business }], []];
    if (sql.includes('SELECT id,name,sector,address,timezone')) {
      return [[{ id: business, name: 'One', sector: null, address: null, timezone: 'UTC' }], []];
    }
    if (sql.includes('duration_minutes')) {
      return [[{ id: service, businessId: business, name: 'Cut', description: null, durationMinutes: 30, priceCents: 1500, currency: 'EUR' }], []];
    }
    return [[{ id: professional, displayName: 'Pro', serviceId: service }], []];
  },
};

const server = createApp({ store: auth, allowedOrigin: 'https://app.example.test', publicCatalog: publicCatalogRoutes(pool as never) }).listen(0, '127.0.0.1');
let base = '';
before(async () => {
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));

test('public catalog lists are bounded, cacheable, and keep the array contract', async () => {
  queries.length = 0;
  const listed = await fetch(`${base}/api/catalog/businesses`);
  assert.equal(listed.status, 200);
  assert.equal(listed.headers.get('cache-control'), PUBLIC_CATALOG_CACHE);
  assert.deepEqual(await listed.json(), [{ id: business, name: 'One', sector: null, address: null, timezone: 'UTC' }]);
  assert.match(queries[0].sql, /LIMIT\s+\?\s+OFFSET\s+\?/i);
  assert.deepEqual(queries[0].params, [50, 0]);

  queries.length = 0;
  const paged = await fetch(`${base}/api/catalog/businesses?page=2&limit=10`);
  assert.equal(paged.status, 200);
  assert.deepEqual(queries[0].params, [10, 10]);

  queries.length = 0;
  const services = await fetch(`${base}/api/catalog/businesses/${business}/services?limit=5`);
  assert.equal(services.status, 200);
  assert.equal(services.headers.get('cache-control'), PUBLIC_CATALOG_CACHE);
  assert.deepEqual(await services.json(), [{ id: service, businessId: business, name: 'Cut', description: null, durationMinutes: 30, priceCents: 1500, currency: 'EUR', active: true }]);
  assert.match(queries.at(-1)!.sql, /LIMIT\s+\?\s+OFFSET\s+\?/i);

  queries.length = 0;
  const staff = await fetch(`${base}/api/catalog/businesses/${business}/professionals?serviceId=${service}&page=1&limit=2`);
  assert.equal(staff.status, 200);
  assert.equal(staff.headers.get('cache-control'), PUBLIC_CATALOG_CACHE);
  assert.deepEqual(await staff.json(), [{ id: professional, displayName: 'Pro', active: true, linked: true, serviceIds: [service] }]);
  assert.match(queries.at(-1)!.sql, /LIMIT\s+\?\s+OFFSET\s+\?/i);
  assert.deepEqual(queries.at(-1)!.params, [business, service, 2, 0, business]);
});

test('public catalog rejects invalid pagination with the centralized error body', async () => {
  for (const url of [
    '/api/catalog/businesses?limit=0',
    '/api/catalog/businesses?limit=101',
    '/api/catalog/businesses?page=0',
    '/api/catalog/businesses?page=abc',
    `/api/catalog/businesses/${business}/services?limit=-1`,
    `/api/catalog/businesses/${business}/professionals?serviceId=${service}&limit=1.5`,
  ]) {
    const response = await fetch(base + url);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { code: 'invalid_input' });
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});

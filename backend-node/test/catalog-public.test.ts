import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { publicCatalogRoutes } from '../src/catalog/public.js';
import type { AuthStore, User } from '../src/auth/store.js';
import { PUBLIC_CATALOG_CACHE } from '../src/http/cache-control.js';
import { PAGE_EXPOSE_HEADERS } from '../src/http/page-headers.js';

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
const businesses = Array.from({ length: 5 }, (_, index) => ({
  id: `231c2e85-cba6-44e3-a803-fac58a3f7ff${index}`,
  name: `Biz ${index}`,
  sector: null,
  address: null,
  timezone: 'UTC',
}));

const pool = {
  async execute(sql: string, params: unknown = []) {
    queries.push({ sql, params });
    if (sql.includes('SELECT id FROM businesses')) return [[{ id: business }], []];
    if (sql.includes('SELECT id,name,sector,address,timezone')) {
      const [limit, offset] = params as [number, number];
      return [businesses.slice(offset, offset + limit), []];
    }
    if (sql.includes('duration_minutes')) {
      const [, limit, offset] = params as [string, number, number];
      const rows = [{ id: service, businessId: business, name: 'Cut', description: null, durationMinutes: 30, priceCents: 1500, currency: 'EUR' }];
      return [rows.slice(offset, offset + limit), []];
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
  assert.equal(listed.headers.get('access-control-expose-headers'), PAGE_EXPOSE_HEADERS);
  assert.equal(Array.isArray(await listed.json()), true);
  assert.match(queries[0].sql, /LIMIT\s+\?\s+OFFSET\s+\?/i);
  assert.deepEqual(queries[0].params, [51, 0]);

  queries.length = 0;
  const paged = await fetch(`${base}/api/catalog/businesses?page=2&limit=10`);
  assert.equal(paged.status, 200);
  assert.deepEqual(queries[0].params, [11, 10]);

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
  assert.deepEqual(queries.at(-1)!.params, [business, service, 3, 0, business]);
});

test('public catalog page hints: last page, middle page, and exactly limit rows', async () => {
  queries.length = 0;
  const last = await fetch(`${base}/api/catalog/businesses?page=3&limit=2`);
  assert.equal(last.status, 200);
  const lastBody = await last.json() as { name: string }[];
  assert.equal(lastBody.length, 1);
  assert.equal(lastBody[0].name, 'Biz 4');
  assert.equal(last.headers.get('x-has-more'), 'false');
  assert.equal(last.headers.get('link'), null);
  assert.deepEqual(queries[0].params, [3, 4]);

  queries.length = 0;
  const middle = await fetch(`${base}/api/catalog/businesses?page=2&limit=2`);
  assert.equal(middle.status, 200);
  const middleBody = await middle.json() as { name: string }[];
  assert.deepEqual(middleBody.map(item => item.name), ['Biz 2', 'Biz 3']);
  assert.equal(middle.headers.get('x-has-more'), 'true');
  assert.equal(middle.headers.get('link'), '</api/catalog/businesses?page=3&limit=2>; rel="next"');
  assert.equal(middle.headers.get('access-control-expose-headers'), PAGE_EXPOSE_HEADERS);
  assert.deepEqual(queries[0].params, [3, 2]);

  queries.length = 0;
  const exact = await fetch(`${base}/api/catalog/businesses?page=1&limit=5`);
  assert.equal(exact.status, 200);
  assert.equal((await exact.json() as unknown[]).length, 5);
  assert.equal(exact.headers.get('x-has-more'), 'false');
  assert.equal(exact.headers.get('link'), null);
  assert.deepEqual(queries[0].params, [6, 0]);
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

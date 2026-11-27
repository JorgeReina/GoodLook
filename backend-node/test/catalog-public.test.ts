import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { publicCatalogRoutes } from '../src/catalog/public.js';
import type { AuthStore, User } from '../src/auth/store.js';
import { PUBLIC_CATALOG_CACHE } from '../src/http/cache-control.js';
import { PAGE_EXPOSE_HEADERS } from '../src/http/page-headers.js';

const business = '231c2e85-cba6-44e3-a803-fac58a3f7ff4';
const unpublished = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const missing = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const service = 'd5502df6-1f29-47b8-8af4-d2101326580f';
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
const professionals = Array.from({ length: 5 }, (_, index) => ({
  id: `b1ca7e0e-b0b4-49ac-a311-fe23403cfc4${index}`,
  displayName: `Pro ${index}`,
  serviceId: service,
}));

const pool = {
  async execute(sql: string, params: unknown = []) {
    queries.push({ sql, params });
    if (sql.includes('SELECT id FROM businesses')) return [[{ id: business }], []];
    if (sql.includes('SELECT id,name,sector,address,timezone')) {
      if (sql.includes('WHERE id=?')) {
        const [id] = params as [string];
        const publishedOnly = /is_public\s*=\s*(?:TRUE|1)/i.test(sql);
        if (id === unpublished) {
          return [publishedOnly ? [] : [{ id: unpublished, name: 'Hidden', sector: null, address: null, timezone: 'UTC' }], []];
        }
        const found = businesses.find(item => item.id === id);
        return [found ? [{ ...found, is_public: 1, ownerEmail: 'secret@example.test', passwordHash: 'x' }] : [], []];
      }
      const [limit, offset] = params as [number, number];
      return [businesses.slice(offset, offset + limit), []];
    }
    if (sql.includes('duration_minutes')) {
      const [, limit, offset] = params as [string, number, number];
      const rows = [{ id: service, businessId: business, name: 'Cut', description: null, durationMinutes: 30, priceCents: 1500, currency: 'EUR' }];
      return [rows.slice(offset, offset + limit), []];
    }
    const [, , limit, offset] = params as [string, string, number, number];
    return [professionals.slice(offset, offset + limit), []];
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
  const staffBody = await staff.json() as { id: string }[];
  assert.equal(staffBody.length, 2);
  assert.equal(staffBody[0].id, professionals[0].id);
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

test('an empty page beyond the last row is 200 with no continuation headers', async () => {
  const empty = await fetch(`${base}/api/catalog/businesses?page=10&limit=2`);
  assert.equal(empty.status, 200);
  assert.deepEqual(await empty.json(), []);
  assert.equal(empty.headers.get('x-has-more'), 'false');
  assert.equal(empty.headers.get('link'), null);
});

test('Link rel=next keeps serviceId and other filters on a relative path', async () => {
  const staff = await fetch(`${base}/api/catalog/businesses/${business}/professionals?serviceId=${service}&page=1&limit=2`);
  assert.equal(staff.status, 200);
  assert.equal(staff.headers.get('x-has-more'), 'true');
  assert.equal(
    staff.headers.get('link'),
    `</api/catalog/businesses/${business}/professionals?serviceId=${service}&page=2&limit=2>; rel="next"`,
  );
});

test('forged Host and X-Forwarded-Host do not appear in Link', async () => {
  const address = server.address() as AddressInfo;
  const response = await new Promise<{ status: number; link: string | undefined }>((resolve, reject) => {
    const req = httpRequest({
      hostname: '127.0.0.1',
      port: address.port,
      path: '/api/catalog/businesses?page=1&limit=2',
      headers: { Host: 'evil.example', 'X-Forwarded-Host': 'also.evil.example' },
    }, res => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode ?? 0, link: res.headers.link }));
    });
    req.on('error', reject);
    req.end();
  });
  assert.equal(response.status, 200);
  assert.equal(response.link, '</api/catalog/businesses?page=2&limit=2>; rel="next"');
  assert.doesNotMatch(response.link ?? '', /evil\.example|https?:\/\//i);
});

test('GET /api/catalog/businesses/:id returns a published PublicBusiness and cache headers', async () => {
  queries.length = 0;
  const response = await fetch(`${base}/api/catalog/businesses/${business.toUpperCase()}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), PUBLIC_CATALOG_CACHE);
  const body = await response.json() as Record<string, unknown>;
  assert.deepEqual(body, businesses.find(item => item.id === business));
  assert.deepEqual(Object.keys(body).sort(), ['address', 'id', 'name', 'sector', 'timezone']);
  assert.equal('ownerEmail' in body || 'passwordHash' in body || 'is_public' in body, false);
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /is_public\s*=\s*(?:TRUE|1)/i);
  assert.match(queries[0].sql, /WHERE\s+id\s*=\s*\?/i);
  assert.deepEqual(queries[0].params, [business]);
});

test('GET /api/catalog/businesses/:id is 404 for unpublished or missing and 400 for a bad id', async () => {
  queries.length = 0;
  const hidden = await fetch(`${base}/api/catalog/businesses/${unpublished}`);
  assert.equal(hidden.status, 404);
  assert.deepEqual(await hidden.json(), { code: 'not_found' });
  assert.equal(hidden.headers.get('cache-control'), 'no-store');
  assert.match(queries[0].sql, /is_public\s*=\s*(?:TRUE|1)/i);
  assert.deepEqual(queries[0].params, [unpublished]);

  queries.length = 0;
  const absent = await fetch(`${base}/api/catalog/businesses/${missing}`);
  assert.equal(absent.status, 404);
  assert.deepEqual(await absent.json(), { code: 'not_found' });
  assert.equal(absent.headers.get('cache-control'), 'no-store');

  queries.length = 0;
  for (const id of ['0', '-1', '1.5', 'not-a-uuid', '999999999999999999999999', '1e3']) {
    const invalid = await fetch(`${base}/api/catalog/businesses/${id}`);
    assert.equal(invalid.status, 400, id);
    assert.deepEqual(await invalid.json(), { code: 'invalid_input' });
    assert.equal(invalid.headers.get('cache-control'), 'no-store');
  }
  assert.equal(queries.length, 0);
});

test('GET /api/catalog/businesses/:id/services is unchanged after the by-id route', async () => {
  queries.length = 0;
  const services = await fetch(`${base}/api/catalog/businesses/${business}/services?limit=5`);
  assert.equal(services.status, 200);
  assert.equal(services.headers.get('cache-control'), PUBLIC_CATALOG_CACHE);
  assert.deepEqual(await services.json(), [{
    id: service, businessId: business, name: 'Cut', description: null,
    durationMinutes: 30, priceCents: 1500, currency: 'EUR', active: true,
  }]);
  assert.match(queries.at(-1)!.sql, /duration_minutes/i);
  assert.match(queries.at(-1)!.sql, /LIMIT\s+\?\s+OFFSET\s+\?/i);

  const staff = await fetch(`${base}/api/catalog/businesses/${business}/professionals?serviceId=${service}&page=1&limit=2`);
  assert.equal(staff.status, 200);
  assert.equal((await staff.json() as unknown[]).length, 2);
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

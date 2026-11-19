import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import type { AuthStore, User } from '../src/auth/store.js';
import { ManagementError, ManagementService } from '../src/product/management-service.js';
import { MysqlManagementStore } from '../src/product/management-store.js';

const user: User = {
  id: '4c95e891-d8b5-40cb-93c9-b1429db9a71d', email: 'owner@example.test', displayName: 'Owner', passwordHash: 'unused',
};
const business = '231c2e85-cba6-44e3-a803-fac58a3f7ff4';
const professional = 'b1ca7e0e-b0b4-49ac-a311-fe23403cfc43';
const token = 'a'.repeat(64);
const origin = 'https://app.example.test';
const auth: AuthStore = {
  async createUser() { return false; },
  async findUserByEmail() { return null; },
  async createSession() {},
  async findUserBySession(hash) { return hash === createHash('sha256').update(token).digest('hex') ? user : null; },
  async deleteSession() {},
};

test('management routes reject anonymous reads and cross-origin writes, and use the session actor', async t => {
  const profile = { id: business, name: 'Local', timezone: 'Europe/Madrid', isPublic: false, sector: null, address: null };
  const hours = [{ weekday: 1, startTime: '09:00', endTime: '12:00' }];
  const management = {
    async get(actor: string, id: string) {
      assert.equal(actor, user.id);
      assert.equal(id, business);
      return { business: profile, services: [], staff: [] };
    },
    async setHours(actor: string, businessId: string, professionalId: string, body: unknown, confirmation: string) {
      assert.equal(actor, user.id);
      assert.equal(businessId, business);
      assert.equal(professionalId, professional);
      assert.deepEqual(body, { hours, actorId: 'ignored' });
      assert.equal(confirmation, 'opaque-token');
    },
  };
  const server = createApp({ store: auth, allowedOrigin: origin, management: management as never }).listen(0, '127.0.0.1');
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/manage/businesses/${business}`;
  const cookie = `goodlook_session=${token}`;
  const anonymous = await fetch(url);
  assert.equal(anonymous.status, 401);
  assert.deepEqual(await anonymous.json(), { code: 'unauthenticated' });
  const response = await fetch(url, { headers: { cookie } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { business: profile, services: [], staff: [] });
  const mutation = (source: string) => fetch(`${url}/staff/${professional}/hours`, {
    method: 'PUT',
    headers: { cookie, origin: source, 'content-type': 'application/json', 'x-goodlook-impact': 'opaque-token' },
    body: JSON.stringify({ hours, actorId: 'ignored' }),
  });
  assert.equal((await mutation('https://untrusted.example.test')).status, 403);
  assert.equal((await mutation(origin)).status, 204);
});

const serviceId = 'd5502df6-1f29-47b8-8af4-d2101326580f';
const initialProfile = {
  id: business, name: 'Private business', timezone: 'UTC', sector: 'Beauty', address: 'Fixture', is_public: 0, first_published_at: null,
};

function fixture(role: string | undefined = 'owner') {
  const log: string[] = [];
  const writes: unknown[][] = [];
  const state = { profile: { ...initialProfile }, offer: false, appointments: ['first'] };
  const connection = {
    async beginTransaction() { log.push('begin'); },
    async commit() { log.push('commit'); },
    async rollback() { log.push('rollback'); },
    release() { log.push('release'); },
    async query(sql: string) {
      log.push(sql);
      return [[{ id: business }]];
    },
    async execute(sql: string, parameters: unknown[]) {
      log.push(sql);
      if (sql.startsWith('SELECT role FROM memberships')) return [role ? [{ role }] : []];
      if (sql.startsWith('SELECT id,name,timezone')) return [[state.profile]];
      if (sql.startsWith('SELECT p.id')) return [state.offer ? [{ id: professional }] : []];
      if (sql.includes("status='booked'")) return [state.appointments.map(id => ({ id }))];
      if (sql.startsWith('SELECT id,business_id AS businessId')) return [[{
        id: serviceId, businessId: business, name: 'Cut', description: null, durationMinutes: 30, priceCents: 1500, currency: 'EUR', active: 1,
      }]];
      if (sql.startsWith('UPDATE ')) {
        writes.push(parameters);
        return [{ affectedRows: 1 }];
      }
      throw new Error('Unexpected test query: ' + sql);
    },
  };
  const store = new MysqlManagementStore({ async getConnection() { return connection; } } as never, 'test-secret-only');
  return { store, state, log, writes };
}

test('first publication requires a configured owner offer; admins can manage services but cannot publish', async () => {
  for (const role of ['admin', 'professional', 'foreign']) {
    const { store, writes } = fixture(role);
    await assert.rejects(store.setVisibility(user.id, business, true), { code: 'forbidden' });
    if (role === 'admin') await store.patchService(user.id, business, serviceId, { priceCents: 2600 });
    assert.equal(writes.length, role === 'admin' ? 1 : 0);
  }
  const owner = fixture();
  await assert.rejects(owner.store.setVisibility(user.id, business, true), { code: 'publication_incomplete' });
  owner.state.offer = true;
  await owner.store.setVisibility(user.id, business, true);
  assert.equal(owner.writes.length, 1);
  assert.ok(owner.log.indexOf('SELECT id FROM businesses WHERE id=? FOR UPDATE') < owner.log.findIndex(sql => sql.startsWith('SELECT role FROM memberships')));
});

test('changing a timezone with future confirmed appointments is rejected before changing the business', async () => {
  const { store, writes, log } = fixture();
  await assert.rejects(store.patchProfile(user.id, business, { timezone: 'Europe/Madrid' }), { code: 'timezone_has_bookings' });
  assert.deepEqual(writes, []);
  assert.ok(log.includes('rollback'));
});

test('a changed set of booked appointments invalidates the signed impact and keeps historical appointments intact', async () => {
  const { store, writes, state, log } = fixture();
  const management = new ManagementService(store);
  async function challenge(token?: string) {
    try {
      await management.patchService(user.id, business, serviceId, { active: false }, token);
      assert.fail('Expected impact confirmation');
    } catch (error) {
      assert.ok(error instanceof ManagementError);
      assert.equal(error.code, 'impact_confirmation_required');
      assert.ok(error.impact);
      return error.impact;
    }
  }
  const first = await challenge();
  assert.equal(first.affectedCount, 1);
  state.appointments.push('racing-booking');
  const changed = await challenge(first.impactToken);
  assert.equal(changed.affectedCount, 2);
  assert.notEqual(changed.impactToken, first.impactToken);
  assert.equal(writes.length, 0);
  await management.patchService(user.id, business, serviceId, { active: false }, changed.impactToken);
  assert.equal(writes.length, 1);
  assert.equal(log.filter(sql => sql.startsWith('UPDATE appointments')).length, 0);
});

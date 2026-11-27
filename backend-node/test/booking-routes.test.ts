import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { createBooking, type AppointmentPool, type SqlConnection } from '../src/appointments/service.js';
import type { AuthStore, User } from '../src/auth/store.js';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const user: User = { id: uuid(3), email: 'a@example.com', displayName: 'A', passwordHash: 'unused' };
const store: AuthStore = {
  async createUser() { return false; }, async findUserByEmail() { return null; }, async createSession() {},
  async findUserBySession(hash) { return hash === 'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb' ? user : null; },
  async deleteSession() {},
};

class Connection implements SqlConnection {
  calls: {sql: string; params: readonly unknown[]}[] = [];
  committed = 0; rolledBack = 0; released = 0;
  requestHash: unknown;
  async beginTransaction() {}
  async commit() { this.committed++; }
  async rollback() { this.rolledBack++; }
  release() { this.released++; }
  async query(sql: string, params: readonly unknown[] = []): Promise<[unknown, unknown]> {
    this.calls.push({ sql, params });
    if (sql.includes('INSERT INTO appointment_requests')) { this.requestHash = params[2]; return [{ affectedRows: 1 }, []]; }
    if (sql.includes('FROM appointment_requests')) return [[{ body_hash: this.requestHash, appointment_id: null }], []];
    if (sql.includes('FROM professionals p') && sql.includes('FOR UPDATE')) return [[{ user_id: uuid(3), active: true }], []];
    if (sql.includes('FROM services s')) return [[{ duration_minutes: 30, price_cents: 1500, currency: 'EUR', timezone: 'Europe/Madrid' }], []];
    if (sql.includes('FROM professional_closures')) return [[], []];
    if (sql.includes('FROM working_hours')) return [[{ start_seconds: 9 * 3600, end_seconds: 18 * 3600 }], []];
    if (sql.includes('FROM appointments') && sql.includes('FOR UPDATE')) return [[], []];
    if (sql.includes('FROM professionals')) return [[{ user_id: uuid(3) }], []];
    return [{ affectedRows: 1 }, []];
  }
}

const origin = 'https://app.example.test';
const cookie = `goodlook_session=${'a'.repeat(64)}`;
const quote = { priceCents: 1500, currency: 'EUR', durationMinutes: 30 };
const body = (startAt: string) => ({
  businessId: uuid(1), professionalId: uuid(2), serviceId: uuid(4), startAt, quote,
});
const clock = () => Date.parse('2030-01-01T00:00:00.000Z');

const latest = { db: new Connection() };
const pool = (connection: Connection): AppointmentPool => ({ getConnection: async () => connection });
const appointments = {
  async book(input: Parameters<typeof createBooking>[1]) {
    latest.db = new Connection();
    return createBooking(pool(latest.db), input, { now: clock, createId: () => uuid(5) });
  },
  async create() { return {}; },
  async agenda() { return []; },
};
const server = createApp({ store, allowedOrigin: origin, appointments }).listen(0, '127.0.0.1');
let base = '';
before(async () => {
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())));

function book(startAt: string) {
  return fetch(base + '/api/bookings', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
      cookie,
      'Idempotency-Key': uuid(9),
    },
    body: JSON.stringify(body(startAt)),
  });
}

test('booking API accepts a start aligned to the 15-minute UTC grid', async () => {
  const response = await book('2030-01-07T10:00:00.000Z');
  assert.equal(response.status, 201);
  const appointment = await response.json() as { startAt: string };
  assert.equal(appointment.startAt, '2030-01-07T10:00:00.000Z');
  assert.equal(latest.db.committed, 1);
});

test('booking API rejects a start offset by minutes from the 15-minute grid', async () => {
  const response = await book('2030-01-07T10:07:00.000Z');
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { code: 'invalid_input' });
  assert.equal(latest.db.calls.length, 0);
});

test('booking API rejects a start offset by seconds from the 15-minute grid', async () => {
  const response = await book('2030-01-07T10:00:01.000Z');
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { code: 'invalid_input' });
  assert.equal(latest.db.calls.length, 0);
});

test('booking API rejects a start offset by milliseconds from the 15-minute grid', async () => {
  const response = await book('2030-01-07T10:00:00.001Z');
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { code: 'invalid_input' });
  assert.equal(latest.db.calls.length, 0);
});

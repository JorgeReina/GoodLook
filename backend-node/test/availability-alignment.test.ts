import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { publicAvailability, type AvailabilityPool } from '../src/appointments/public-availability.js';
import type { AuthStore } from '../src/auth/store.js';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
class Connection {
  released = 0;
  async beginTransaction() {}
  async commit() {}
  async rollback() {}
  release() { this.released++; }
  async query(sql: string): Promise<[unknown, unknown]> {
    if (sql.includes('FROM services s')) return [[{ duration_minutes: 30, timezone: 'UTC', user_id: null }], []];
    if (sql.includes('FROM working_hours')) return [[{ weekday: 1, start_seconds: 0, end_seconds: 86400 }], []];
    if (sql.includes('FROM appointments')) return [[], []];
    throw new Error('Unexpected query');
  }
}
const pool: AvailabilityPool = { getConnection: async () => new Connection() };
const store: AuthStore = {
  async createUser() { return false; },
  async findUserByEmail() { return null; },
  async createSession() {},
  async findUserBySession() { return null; },
  async deleteSession() {},
};
const limiter = { async check() { return { allowed: true, retryAfter: 1 }; } };
const clock = () => Date.parse('2030-01-01T00:00:00.000Z');
const server = createApp({
  store,
  allowedOrigin: 'https://app.example.test',
  availabilityLimiter: limiter,
  appointments: {
    create: async () => ({}),
    agenda: async () => [],
    availability: input => publicAvailability(pool, input, clock),
  },
}).listen(0, '127.0.0.1');
let base = '';
before(async () => {
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));

test('GET /api/appointments/availability only returns UTC 15-minute grid starts', async () => {
  const range = new URLSearchParams({
    businessId: id(1), professionalId: id(2), serviceId: id(3),
    from: '2030-01-07T09:07:03.123Z', to: '2030-01-07T10:00:00.000Z',
  });
  const response = await fetch(`${base}/api/appointments/availability?${range}`);
  assert.equal(response.status, 200);
  const body = await response.json() as { slots: { startAt: string; endAt: string }[] };
  assert.ok(body.slots.length > 0);
  for (const slot of body.slots) {
    assert.equal(Date.parse(slot.startAt) % 900_000, 0, slot.startAt);
    assert.match(slot.startAt, /T\d\d:(00|15|30|45):00\.000Z$/);
  }
});

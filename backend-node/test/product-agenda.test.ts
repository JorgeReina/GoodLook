import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import { agendaRoutes } from '../src/product/agenda-routes.js';
import { MysqlAgendaStore, type AgendaStore } from '../src/product/agenda-store.js';
import type { AuthStore } from '../src/auth/store.js';
import type { Pool } from 'mysql2/promise';

const actorId = '00000000-0000-4000-8000-000000000001';
const businessId = '00000000-0000-4000-8000-000000000002';
const professionalId = '00000000-0000-4000-8000-000000000003';
const appointmentId = '00000000-0000-4000-8000-000000000004';
const serviceId = '00000000-0000-4000-8000-000000000005';
const march = '2026-03-23';
const october = '2026-10-19';
const from = '2026-03-22T23:00:00.000Z';
const to = '2026-03-29T22:00:00.000Z';
const fromSql = '2026-03-22 23:00:00.000';
const toSql = '2026-03-29 22:00:00.000';
const customerBooking = {
  id: appointmentId, businessId, businessName: 'Local de prueba', timezone: 'Europe/Madrid',
  professionalId, professionalName: 'Profesional', serviceId, serviceName: 'Corte',
  startAt: '2026-03-25 11:00:00.000', endAt: '2026-03-25 11:45:00.000',
  status: 'booked', priceCents: 2500, currency: 'EUR',
};
const agendaBooking = {
  id: appointmentId, serviceId, serviceName: 'Corte', customerName: 'Cliente',
  startAt: customerBooking.startAt, endAt: customerBooking.endAt,
  status: 'booked', notes: 'Nota', email: 'stray@example.test', phone: 'unexpected',
};

function fixture(results: unknown[][]) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const events: string[] = [];
  const execute = async (sql: string, params: unknown[]) => {
    queries.push({ sql, params });
    return [results.shift() ?? [], []];
  };
  const connection = {
    execute, query: async (sql: string) => { events.push(sql); },
    beginTransaction: async () => { events.push('begin'); },
    commit: async () => { events.push('commit'); },
    rollback: async () => { events.push('rollback'); },
    release: () => { events.push('release'); },
  };
  const pool = { execute, getConnection: async () => connection } as unknown as Pool;
  return { store: new MysqlAgendaStore(pool), queries, events };
}

test('agenda projects public names and notes on a 167-hour local week', async () => {
  const hours = [{ weekday: 3, startTime: '10:00:00', endTime: '12:00:00' }];
  const closures = [{ id: appointmentId, startAt: customerBooking.startAt, endAt: customerBooking.endAt }];
  const { store, queries, events } = fixture([[{ timezone: 'Europe/Madrid' }], hours, closures, [agendaBooking]]);
  const result = await store.week(actorId, businessId, professionalId, march);
  assert.equal(result?.from, from);
  assert.equal(result?.to, to);
  assert.deepEqual(result?.hours, [{ weekday: 3, startTime: '10:00', endTime: '12:00' }]);
  assert.equal(result?.closures[0].startAt, '2026-03-25T11:00:00.000Z');
  assert.deepEqual(result?.appointments, [{
    id: appointmentId, serviceId, serviceName: 'Corte', customerName: 'Cliente', notes: 'Nota',
    status: 'booked', startAt: '2026-03-25T11:00:00.000Z', endAt: '2026-03-25T11:45:00.000Z',
  }]);
  assert.match(queries[0].sql, /m\.status = 'active'/);
  assert.match(queries[0].sql, /p\.user_id = m\.user_id AND p\.active = TRUE/);
  assert.match(queries[0].sql, /m\.role IN \('owner', 'admin'\)/);
  assert.deepEqual(queries[0].params, [actorId, businessId, professionalId]);
  assert.deepEqual(queries[3].params, [businessId, professionalId, toSql, fromSql]);
  assert.deepEqual(events.slice(-2), ['commit', 'release']);
});

test('access denied reads no business agenda and autumn week spans 169 hours', async () => {
  const denied = fixture([[]]);
  assert.equal(await denied.store.week(actorId, businessId, professionalId, march), null);
  assert.equal(denied.queries.length, 1);
  const allowed = fixture([[{ timezone: 'Europe/Madrid' }], [], [], []]);
  const result = await allowed.store.week(actorId, businessId, professionalId, october);
  assert.equal(result?.from, '2026-10-18T22:00:00.000Z');
  assert.equal(result?.to, '2026-10-25T23:00:00.000Z');
});

test('customer history uses stored price, duration and a stable scoped cursor', async () => {
  const { store, queries } = fixture([Array.from({ length: 101 }, (_, i) => ({
    ...customerBooking,
    id: '00000000-0000-4000-8000-' + String(i + 10).padStart(12, '0'),
  })), [customerBooking]]);
  const first = await store.bookings(actorId, Date.parse(from), Date.parse(to));
  assert.equal(first.items.length, 100);
  assert.equal(first.items[0].durationMinutes, 45);
  assert.equal(first.items[0].priceCents, 2500);
  assert.equal(first.items[0].currency, 'EUR');
  assert.ok(first.nextCursor);
  const next = await store.bookings(actorId, Date.parse(from), Date.parse(to), first.nextCursor);
  assert.equal(next.nextCursor, null);
  assert.deepEqual(queries[0].params, [actorId, fromSql, toSql]);
  assert.deepEqual(queries[1].params.slice(3), [customerBooking.startAt, customerBooking.startAt, first.items[99].id]);
  assert.match(queries[1].sql, /a\.customer_user_id = \?/);
  await assert.rejects(store.bookings(actorId, Date.parse(from), Date.parse(to), 'invalid'), { code: 'invalid_input' });
});

test('private routes validate query and derive actor from session with no-store', async () => {
  const auth: AuthStore = {
    createUser: async () => false, findUserByEmail: async () => null,
    createSession: async () => {}, deleteSession: async () => {},
    findUserBySession: async () => ({ id: actorId, displayName: 'A', email: 'actor@example.test', passwordHash: 'disabled' }),
  };
  const calls: unknown[][] = [];
  const store: AgendaStore = {
    week: async (...args) => { calls.push(args); return null; },
    bookings: async (...args) => { calls.push(args); return { items: [], nextCursor: null }; },
  };
  const server = express().use('/api', agendaRoutes(auth, store)).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('Missing address');
    const base = 'http://127.0.0.1:' + addr.port + '/api';
    const headers = { cookie: 'goodlook_session=' + 'a'.repeat(64) };
    const query = '?businessId=' + businessId + '&professionalId=' + professionalId;
    let response = await fetch(base + '/agenda' + query + '&weekStart=' + march);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    response = await fetch(base + '/agenda' + query + '&weekStart=2026-03-24', { headers });
    assert.equal(response.status, 400);
    response = await fetch(base + '/agenda' + query + '&weekStart=' + march + '&actorId=' + businessId, { headers });
    assert.equal(response.status, 403);
    assert.deepEqual(calls[0], [actorId, businessId, professionalId, march]);
    response = await fetch(base + '/me/bookings?from=' + from + '&to=2026-05-01T00:00:00.000Z', { headers });
    assert.equal(response.status, 400);
    response = await fetch(base + '/me/bookings?from=' + from + '&to=' + to + '&actorId=' + professionalId, { headers });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { items: [], nextCursor: null });
    assert.equal(calls[1][0], actorId);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

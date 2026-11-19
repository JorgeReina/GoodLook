import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import express from 'express';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { MysqlAuthStore } from '../../src/auth/mysql-store.js';
import { invitationRevocationRoute, invitationRoutes } from '../../src/invitations/routes.js';
import { InvitationService } from '../../src/invitations/service.js';
import { MysqlInvitationStore } from '../../src/invitations/mysql-store.js';
import { agendaRoutes } from '../../src/product/agenda-routes.js';
import { MysqlAgendaStore } from '../../src/product/agenda-store.js';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

export async function verifyAgendaAndInvitations(pool: Pool) {
  const auth = new MysqlAuthStore(pool);
  const manager = randomUUID(), otherManager = randomUUID();
  const staff = [randomUUID(), randomUUID()];
  const customer = randomUUID();
  const firstBusiness = randomUUID(), secondBusiness = randomUUID();
  const firstProfile = randomUUID(), otherProfile = randomUUID(), secondProfile = randomUUID();
  const service = randomUUID(), appointment = randomUUID(), closure = randomUUID();

  const people: [string, string][] = [
    [manager, 'Responsable'], [otherManager, 'Responsable ajeno'],
    [staff[0], 'Profesional A'], [staff[1], 'Profesional B'], [customer, 'Cliente Agenda'],
  ];
  const cookies = new Map<string, string>();
  for (const [id, name] of people) {
    await pool.execute('INSERT INTO users(id,email,password_hash,display_name) VALUES (?,?,?,?)',
      [id, id + '@example.test', 'disabled', name]);
    const token = randomBytes(32).toString('hex');
    await auth.createSession(digest(token), id, new Date(Date.now() + 300_000));
    cookies.set(id, 'goodlook_session=' + token);
  }
  await pool.execute('INSERT INTO businesses(id,name,timezone) VALUES (?,?,?),(?,?,?)',
    [firstBusiness, 'Local Madrid', 'Europe/Madrid', secondBusiness, 'Otro local', 'UTC']);
  await pool.execute("INSERT INTO memberships(business_id,user_id,role) VALUES (?,?,'owner'),(?,?,'admin'),(?,?,'owner')",
    [firstBusiness, manager, secondBusiness, manager, secondBusiness, otherManager]);
  for (const [id, business] of [[firstProfile, firstBusiness], [otherProfile, firstBusiness], [secondProfile, secondBusiness]]) {
    await pool.execute('INSERT INTO professionals(id,business_id,display_name) VALUES (?,?,?)', [id, business, 'Profesional Agenda']);
  }
  const app = express();
  const origin = 'https://app.example.test';
  const invitations = new InvitationService(new MysqlInvitationStore(pool));
  app.use(express.json());
  app.use('/api/invitations', invitationRoutes(auth, origin, invitations));
  app.delete('/api/manage/businesses/:id/staff/:professionalId/invitation', invitationRevocationRoute(auth, origin, invitations));
  app.use('/api', agendaRoutes(auth, new MysqlAgendaStore(pool)));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('Missing address');
    const base = 'http://127.0.0.1:' + addr.port + '/api';
    const fetchAs = (actor: string, path: string, method = 'GET', body?: unknown) => fetch(base + path, {
      method, headers: { origin, 'content-type': 'application/json', cookie: cookies.get(actor)! },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    async function issue(businessId: string, professionalId: string): Promise<string> {
      const response = await fetchAs(manager, '/invitations', 'POST', { businessId, professionalId });
      assert.equal(response.status, 201);
      const data = await response.json() as { token: string; expiresInSeconds: number };
      assert.equal(data.expiresInSeconds, 604800);
      return data.token;
    }
    const accept = (actor: string, token: string) => fetchAs(actor, '/invitations/accept', 'POST', { token });
    const revoke = (actor: string) => fetchAs(actor,
      '/manage/businesses/' + firstBusiness + '/staff/' + firstProfile + '/invitation', 'DELETE');

    const old = await issue(firstBusiness, firstProfile);
    const renewed = await issue(firstBusiness, firstProfile);
    assert.equal((await accept(staff[0], old)).status, 403);
    assert.equal((await revoke(otherManager)).status, 403);
    assert.equal((await revoke(manager)).status, 204);
    assert.equal((await accept(staff[0], renewed)).status, 403);
    const expired = await issue(firstBusiness, firstProfile);
    await pool.execute("UPDATE professional_invitations SET expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 DAY) WHERE token_hash = ?", [digest(expired)]);
    assert.equal((await accept(staff[0], expired)).status, 403);

    const token = await issue(firstBusiness, firstProfile);
    const replies = await Promise.all(staff.map(actor => accept(actor, token)));
    assert.deepEqual(replies.map(response => response.status).sort(), [204, 403]);
    const linked = staff[replies[0].status === 204 ? 0 : 1];
    const unlinked = staff.find(actor => actor !== linked)!;
    assert.equal((await accept(linked, await issue(firstBusiness, otherProfile))).status, 403);
    await pool.execute("INSERT INTO memberships(business_id,user_id,role) VALUES (?,?,'admin')", [secondBusiness, linked]);
    assert.equal((await accept(linked, await issue(secondBusiness, secondProfile))).status, 204);
    const [[member]] = await pool.execute<RowDataPacket[]>('SELECT role FROM memberships WHERE business_id = ? AND user_id = ?', [secondBusiness, linked]);
    assert.equal(member.role, 'admin');

    await pool.execute('INSERT INTO services(id,business_id,name,duration_minutes,price_cents,currency) VALUES (?,?,?,?,?,?)',
      [service, firstBusiness, 'Corte Agenda', 60, 9000, 'USD']);
    await pool.execute('INSERT INTO professional_services(business_id,professional_id,service_id) VALUES (?,?,?)',
      [firstBusiness, firstProfile, service]);
    await pool.execute('INSERT INTO working_hours(id,business_id,professional_id,weekday,start_time,end_time) VALUES (?,?,?,?,?,?)',
      [randomUUID(), firstBusiness, firstProfile, 3, '09:00:00', '18:00:00']);
    await pool.execute('INSERT INTO professional_closures(id,business_id,professional_id,start_at,end_at) VALUES (?,?,?,?,?)',
      [closure, firstBusiness, firstProfile, '2026-03-25 09:00:00', '2026-03-25 10:00:00']);
    await pool.execute('INSERT INTO appointments(id,business_id,professional_id,service_id,customer_user_id,start_at,end_at,notes,price_cents,currency) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [appointment, firstBusiness, firstProfile, service, customer, '2026-03-25 11:00:00', '2026-03-25 11:45:00', 'Nota de prueba', 2500, 'EUR']);

    const agenda = (profile: string) => '/agenda?businessId=' + firstBusiness + '&professionalId=' + profile + '&weekStart=2026-03-23';
    assert.equal((await fetchAs(otherManager, agenda(firstProfile))).status, 403);
    assert.equal((await fetchAs(linked, agenda(otherProfile))).status, 403);
    assert.equal((await fetchAs(unlinked, agenda(firstProfile))).status, 403);
    assert.equal((await fetchAs(linked, agenda(firstProfile))).status, 200);
    await pool.execute('UPDATE professionals SET active = FALSE WHERE business_id = ? AND id = ?', [firstBusiness, firstProfile]);
    assert.equal((await fetchAs(linked, agenda(firstProfile))).status, 403);
    const managed = await fetchAs(manager, agenda(firstProfile));
    assert.equal(managed.status, 200);
    assert.equal(managed.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await managed.json(), {
      timezone: 'Europe/Madrid', from: '2026-03-22T23:00:00.000Z', to: '2026-03-29T22:00:00.000Z',
      hours: [{ weekday: 3, startTime: '09:00', endTime: '18:00' }],
      closures: [{ id: closure, startAt: '2026-03-25T09:00:00.000Z', endAt: '2026-03-25T10:00:00.000Z' }],
      appointments: [{
        id: appointment, serviceId: service, serviceName: 'Corte Agenda', customerName: 'Cliente Agenda',
        notes: 'Nota de prueba', status: 'booked', startAt: '2026-03-25T11:00:00.000Z', endAt: '2026-03-25T11:45:00.000Z',
      }],
    });
    const history = '/me/bookings?from=2026-03-24T00:00:00.000Z&to=2026-03-26T00:00:00.000Z';
    const own = await fetchAs(customer, history);
    assert.equal(own.status, 200);
    assert.deepEqual(await own.json(), { items: [{
      id: appointment, businessId: firstBusiness, businessName: 'Local Madrid', timezone: 'Europe/Madrid',
      professionalId: firstProfile, professionalName: 'Profesional Agenda', serviceId: service, serviceName: 'Corte Agenda',
      startAt: '2026-03-25T11:00:00.000Z', endAt: '2026-03-25T11:45:00.000Z',
      status: 'booked', priceCents: 2500, currency: 'EUR', durationMinutes: 45,
    }], nextCursor: null });
    const unrelated = await fetchAs(otherManager, history + '&actorId=' + customer);
    assert.equal(unrelated.status, 200);
    assert.deepEqual(await unrelated.json(), { items: [], nextCursor: null });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

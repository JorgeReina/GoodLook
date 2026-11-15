import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAppointment, listProfessionalAgenda, type AppointmentPool, type SqlConnection } from '../src/appointments/service.js';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
class Connection implements SqlConnection {
  calls: {sql: string; params: readonly unknown[]}[] = [];
  committed = 0; rolledBack = 0; released = 0; begun = 0;
  conflict = false; membership: string | null = 'admin'; professionalUserId = id(3); duration = 30; hours = true; active = true; publicBusiness = true;
  async beginTransaction() { this.begun++; }
  async commit() { this.committed++; }
  async rollback() { this.rolledBack++; }
  release() { this.released++; }
  async query(sql: string, params: readonly unknown[] = []): Promise<[unknown, unknown]> {
    this.calls.push({ sql, params });
    if (sql.includes('FROM professionals p') && sql.includes('FOR UPDATE')) return [[...(this.active ? [{ user_id: this.professionalUserId }] : [])], []];
    if (sql.includes('FROM services s')) return [[...(this.publicBusiness ? [{ duration_minutes: this.duration, price_cents: 1500, currency: 'EUR', timezone: 'Europe/Madrid' }] : [])], []];
    if (sql.includes('FROM working_hours')) return [[...(this.hours ? [{ start_seconds: 9 * 3600, end_seconds: 18 * 3600 }] : [])], []];
    if (sql.includes('FROM appointments') && sql.includes('FOR UPDATE')) return [[...(this.conflict ? [{ id: id(8) }] : [])], []];
    if (sql.includes('FROM memberships')) return [[...(this.membership ? [{ role: this.membership }] : [])], []];
    if (sql.includes('FROM professionals') && !sql.includes('FOR UPDATE')) return [[{ user_id: this.professionalUserId }], []];
    if (sql.includes('FROM appointments')) return [[{ id: id(8) }], []];
    return [{ affectedRows: 1 }, []];
  }
}
const pool = (db: Connection): AppointmentPool => ({getConnection: async () => db});
const details = { businessId:id(1), professionalId:id(2), serviceId:id(4), actorId:id(3), startAt:'2030-01-07T10:00:00.000Z', notes:'Prueba' };
const clock = () => Date.parse('2030-01-01T00:00:00.000Z');

test('creates own booking using server-side service duration and price inside transaction', async () => {
  const db = new Connection();
  const result = await createAppointment(pool(db), details, { now: clock, createId: () => id(5) });
  assert.equal(result.id, id(5)); assert.equal(result.customerUserId, details.actorId);
  assert.equal(result.endAt, '2030-01-07T10:30:00.000Z'); assert.equal(result.priceCents, 1500);
  assert.equal(db.committed, 1); assert.equal(db.rolledBack, 0); assert.equal(db.released, 1);
  const lock = db.calls.findIndex(c => c.sql.includes('FROM professionals p') && c.sql.includes('FOR UPDATE'));
  const overlaps = db.calls.findIndex(c => c.sql.includes('FROM appointments') && c.sql.includes('FOR UPDATE'));
  const insert = db.calls.findIndex(c => c.sql.includes('INSERT INTO appointments'));
  assert.ok(lock >= 0 && lock < overlaps && overlaps < insert);
  assert.deepEqual(db.calls[overlaps].params.slice(0,2), [details.businessId, details.professionalId]);
});

test('overlap, unavailable professional or outside hours rolls back without insert', async () => {
  for (const change of [(db:Connection)=>db.conflict=true, (db:Connection)=>db.active=false, (db:Connection)=>db.hours=false]) {
    const db = new Connection(); change(db);
    await assert.rejects(createAppointment(pool(db), details, {now:clock}), /unavailable|conflict/i);
    assert.equal(db.committed, 0); assert.equal(db.rolledBack, 1); assert.equal(db.released, 1);
    assert.equal(db.calls.some(c => c.sql.includes('INSERT INTO appointments')), false);
  }
});

test('rejects invalid dates, past dates, and notes longer than 500 before database access', async () => {
  for (const change of [{startAt:'2030-01-07T10:00:00'}, {startAt:'2020-01-01T00:00:00.000Z'}, {notes:'x'.repeat(501)}]) {
    const db = new Connection();
    await assert.rejects(createAppointment(pool(db), {...details, ...change}, {now:clock}));
    assert.equal(db.calls.length, 0);
  }
});

test('agenda permits owner, admin, or the assigned professional only within same business', async () => {
  for (const role of ['owner','admin','professional']) {
    const db = new Connection(); db.membership=role;
    await listProfessionalAgenda(pool(db), { actorId: id(3), businessId: id(1), professionalId: id(2), from:'2030-01-07T00:00:00.000Z', to:'2030-01-14T00:00:00.000Z' });
    const membership = db.calls.find(c => c.sql.includes('FROM memberships'))!;
    assert.deepEqual(membership.params, [id(1), id(3)]);
    const agenda = db.calls.find(c => c.sql.includes('FROM appointments'))!;
    assert.deepEqual(agenda.params.slice(0,2), [id(1), id(2)]);
    assert.equal(db.released, 1);
  }
  for (const role of [null,'professional']) {
    const db = new Connection(); db.membership=role; db.professionalUserId=id(9);
    await assert.rejects(listProfessionalAgenda(pool(db), {actorId:id(3), businessId:id(1), professionalId:id(2), from:'2030-01-07T00:00:00.000Z',to:'2030-01-14T00:00:00.000Z'}), /forbidden/i);
    assert.equal(db.calls.some(c => c.sql.includes('FROM appointments')), false);
  }
});

test('database failure during insert rolls back and releases connection', async () => {
  const db = new Connection();
  const query = db.query.bind(db);
  db.query = async (sql, params) => { if (sql.includes('INSERT INTO appointments')) throw new Error('database failed'); return query(sql, params); };
  await assert.rejects(createAppointment(pool(db), details, {now:clock}), /database failed/);
  assert.equal(db.committed, 0); assert.equal(db.rolledBack, 1); assert.equal(db.released, 1);
});

test('refuses a booking spanning a daylight-saving offset change', async () => {
  const db = new Connection(); db.duration = 120;
  await assert.rejects(createAppointment(pool(db), {...details,startAt:'2030-03-31T00:30:00.000Z'}, {now:clock}), /unavailable/i);
  assert.equal(db.committed, 0); assert.equal(db.rolledBack, 1);
  assert.equal(db.calls.some(c => c.sql.includes('INSERT INTO appointments')), false);
});

test('allows a booking ending exactly at midnight when the schedule ends at 24:00', async () => {
  const db = new Connection();
  const query = db.query.bind(db);
  db.query = async (sql, params) => sql.includes('FROM working_hours') ? [[{start_seconds: 21 * 3600, end_seconds: 24 * 3600}], []] : query(sql, params);
  const result = await createAppointment(pool(db), {...details, startAt:'2030-01-07T22:30:00.000Z'}, {now:clock});
  assert.equal(result.endAt, '2030-01-07T23:00:00.000Z');
  assert.equal(db.committed, 1);
});

test('rejects midnight booking if working hours close earlier and rejects crossing midnight', async () => {
  const db = new Connection();
  const query = db.query.bind(db);
  db.query = async (sql, params) => sql.includes('FROM working_hours') ? [[{start_seconds: 21 * 3600, end_seconds: 23 * 3600 + 59 * 60}], []] : query(sql, params);
  await assert.rejects(createAppointment(pool(db), {...details, startAt:'2030-01-07T22:30:00.000Z'}, {now:clock}), /unavailable/i);
  assert.equal(db.rolledBack, 1);
  const cross = new Connection();
  await assert.rejects(createAppointment(pool(cross), {...details, startAt:'2030-01-07T22:45:00.000Z'}, {now:clock}), /unavailable/i);
});

test('customer appointment list scopes query to authenticated actor, interval and bounded output', async () => {
  const {listCustomerAppointments} = await import('../src/appointments/service.js');
  const db = new Connection();
  const from = '2030-01-01T00:00:00.000Z', to = '2030-02-01T00:00:00.000Z';
  const query = db.query.bind(db);
  db.query = async (sql, params) => {
    if (sql.includes('FROM appointments')) {
      db.calls.push({sql,params:params ?? []});
      return [[{id:id(8),business_id:id(1),professional_id:id(2),service_id:id(4),start_at:'2030-01-07 10:00:00.000',end_at:'2030-01-07 10:30:00.000',status:'booked',price_cents:1500,currency:'EUR'}], []];
    }
    return query(sql, params);
  };
  const result = await listCustomerAppointments(pool(db), {actorId:id(3),from,to});
  const call=db.calls.find(c=>c.sql.includes('FROM appointments'))!;
  assert.match(call.sql,/customer_user_id\s*=\s*\?/i);
  assert.match(call.sql,/LIMIT\s+100/i);
  assert.deepEqual(call.params,[id(3),'2030-01-01 00:00:00.000','2030-02-01 00:00:00.000']);
  assert.equal(result[0].startAt,'2030-01-07T10:00:00.000Z');
  assert.equal(result[0].priceCents,1500);
  assert.equal(db.released,1);
});

test('customer appointment list rejects invalid or excessive ranges before database access', async () => {
  const {listCustomerAppointments} = await import('../src/appointments/service.js');
  const db=new Connection();
  for (const values of [
    {actorId:'bad',from:'2030-01-01T00:00:00.000Z',to:'2030-01-02T00:00:00.000Z'},
    {actorId:id(3),from:'2030-01-01T00:00:00.000Z',to:'2030-03-01T00:00:00.000Z'},
    {actorId:id(3),from:'2030-01-01T00:00:00',to:'2030-01-02T00:00:00.000Z'},
  ]) await assert.rejects(listCustomerAppointments(pool(db),values),/invalid/i);
  assert.equal(db.calls.length,0);
});

test('appointment service only queries publicly visible businesses',async()=>{const db=new Connection();db.publicBusiness=false;await assert.rejects(createAppointment(pool(db),details,{now:clock}),/unavailable/i);const query=db.calls.find(c=>c.sql.includes('FROM services s'));assert.match(query!.sql,/b\.is_public\s*=\s*(?:TRUE|1)/i);assert.equal(db.calls.some(c=>c.sql.includes('INSERT INTO appointments')),false);});

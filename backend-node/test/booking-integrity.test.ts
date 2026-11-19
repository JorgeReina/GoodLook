import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as bookings from '../src/appointments/service.js';

test('a confirmed request replays the same appointment before checking current time or offer', async () => {
  const uuid = '00000000-0000-4000-8000-000000000001';
  const input = { actorId:uuid, businessId:uuid, professionalId:uuid, serviceId:uuid, startAt:'2020-01-01T09:00:00.000Z', notes:null, requestKey:uuid, quote:{priceCents:100,currency:'EUR',durationMinutes:30} };
  const queries:string[] = [];
  let hash:unknown;
  const c = {async beginTransaction(){},async commit(){},async rollback(){},release(){},async query(sql:string, params:readonly unknown[]=[]):Promise<[unknown,unknown]>{
    queries.push(sql);
    if(sql.includes('INSERT INTO appointment_requests')) hash=params[2];
    if(sql.includes('FROM appointment_requests')) return [[{body_hash:hash,appointment_id:uuid}],[]];
    if(sql.includes('FROM appointments')) return [[{id:uuid,business_id:uuid,professional_id:uuid,service_id:uuid,customer_user_id:uuid,start_at:'2020-01-01 09:00:00.000',end_at:'2020-01-01 09:30:00.000',price_cents:100,currency:'EUR',status:'booked'}],[]];
    return [[],[]];
  }};
  const result = await bookings.createBooking({getConnection:async()=>c},input);
  assert.equal(result.replayed,true);
  assert.equal(result.appointment.id,uuid);
  assert.ok(!queries.some(sql=>sql.includes('FROM businesses')));
});

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { lockBusiness, lockProfessionalProfiles, lockProfessionalUsers } from '../../src/appointments/booking-locks.js';
import { publicAvailability } from '../../src/appointments/public-availability.js';
import { AppointmentError, createAppointment, createBooking, type AppointmentPool } from '../../src/appointments/service.js';

type Fixture = Parameters<typeof createAppointment>[1];
const code = (expected: string) => (error: unknown) => error instanceof AppointmentError && error.code === expected;
const plus = (time: string, minutes: number) => new Date(Date.parse(time) + minutes * 60_000).toISOString();
const sqlTime = (time: string) => time.replace('T',' ').replace('Z','');
const quoted = (appointment: Fixture) => ({
  ...appointment, requestKey: randomUUID(), quote:{priceCents:1500,currency:'EUR',durationMinutes:30},
});

function intercept(pool: Pool, query: (sql: string, send: () => Promise<[unknown, unknown]>) => Promise<[unknown, unknown]>): AppointmentPool {
  return { async getConnection() {
    const connection = await pool.getConnection();
    return {
      beginTransaction: () => connection.beginTransaction(),
      commit: () => connection.commit(),
      rollback: () => connection.rollback(),
      release: () => connection.release(),
      query: (sql, params) => query(sql, () => connection.query(sql, params)),
    };
  }};
}

/** The first two transactions reach the same lock acquisition point before either proceeds. */
export function concurrentAt(pool: Pool, queryPrefix: string): AppointmentPool {
  const twoArrived = Promise.withResolvers<void>();
  let arrivals = 0;
  let timeout: ReturnType<typeof setTimeout>;
  return intercept(pool, async (sql, send) => {
    if (sql.startsWith(queryPrefix) && arrivals < 2) {
      arrivals++;
      if (arrivals === 1) timeout = setTimeout(() => twoArrived.reject(new Error(`Second connection didn't reach ${queryPrefix}`)), 5000);
      else {
        clearTimeout(timeout);
        twoArrived.resolve();
      }
      await twoArrived.promise;
    }
    return send();
  });
}

async function whileChanging(pool: Pool, booking: ReturnType<typeof quoted>, update: (c: PoolConnection) => Promise<unknown>, staff?: string) {
  const change = await pool.getConnection();
  const pending = Promise.withResolvers<void>();
  try {
    await change.beginTransaction();
    await lockBusiness(change, booking.businessId);
    if (staff) {
      await lockProfessionalUsers(change,[staff]);
      await lockProfessionalProfiles(change,booking.businessId,[booking.professionalId]);
    }
    const target = intercept(pool, (sql, send) => {
      const result = send();
      if (sql.startsWith('SELECT id FROM businesses')) pending.resolve();
      return result;
    });
    const result = createBooking(target, booking);
    // Attach a rejection handler before waiting on the other connection.
    const outcome = result.then(value => ({ value }), error => ({ error }));
    await Promise.race([pending.promise, outcome]);
    await update(change);
    await change.commit();
    return await outcome;
  } finally {
    await change.rollback();
    change.release();
  }
}

export async function verifyBookingIntegrity(pool: Pool, first: Fixture, business: string, service: string, staff: string) {
  const professional = randomUUID();
  await pool.execute("INSERT INTO memberships(business_id,user_id,role) VALUES (?,?,'professional')", [business,staff]);
  await pool.execute('INSERT INTO professionals(id,business_id,user_id,display_name) VALUES (?,?,?,?)',[professional,business,staff,'Second profile']);
  await pool.execute('UPDATE businesses SET is_public=TRUE WHERE id=?',[business]);
  await pool.execute('INSERT INTO professional_services(business_id,professional_id,service_id) VALUES (?,?,?)',[business,professional,service]);
  for(let day=1;day<=7;day++) await pool.execute("INSERT INTO working_hours(id,business_id,professional_id,weekday,start_time,end_time) VALUES (?,?,?,?,'00:00','24:00')",[randomUUID(),business,professional,day]);
  const second = {...first,businessId:business,serviceId:service,professionalId:professional};
  // Historical appointments on inactive profiles still occupy their account.
  await pool.execute('UPDATE professionals SET active=FALSE WHERE id=?',[first.professionalId]);
  await assert.rejects(createAppointment(pool,second), code('conflict'));
  const range = {...second, from:second.startAt,to:plus(second.startAt,60)};
  const availability = await publicAvailability(pool,range);
  assert.deepEqual(availability,{timezone:'UTC',slots:[{startAt:plus(second.startAt,30),endAt:plus(second.startAt,60)}]});
  await pool.execute('UPDATE professionals SET active=TRUE WHERE id=?',[first.professionalId]);

  const startAt=plus(first.startAt,60);
  const crossLocation = concurrentAt(pool, 'SELECT id FROM users');
  const outcomes = await Promise.allSettled([
    createBooking(crossLocation,quoted({...first,startAt})),
    createBooking(crossLocation,quoted({...second,startAt})),
  ]);
  assert.equal(outcomes.filter(result=>result.status==='fulfilled').length,1);
  const conflict = outcomes.find(result=>result.status==='rejected');
  assert.ok(conflict?.status==='rejected' && code('slot_unavailable')(conflict.reason));
  const adjacent = await createBooking(pool,quoted({...second,startAt:plus(startAt,30)}));
  assert.equal(adjacent.appointment.startAt,plus(startAt,30));

  const repeat = quoted({...second,startAt:plus(first.startAt,180)});
  const sameKey = concurrentAt(pool,'INSERT INTO appointment_requests');
  const copies = await Promise.all([createBooking(sameKey,repeat),createBooking(sameKey,repeat)]);
  assert.deepEqual(copies.map(result=>result.replayed).sort(),[false,true]);
  assert.deepEqual(copies[0].appointment,copies[1].appointment);
  await assert.rejects(createBooking(pool,{...repeat,notes:'different'}),code('idempotency_conflict'));

  const price = quoted({...second,startAt:plus(first.startAt,240)});
  const changed = await whileChanging(pool,price,c=>c.execute('UPDATE services SET price_cents=1800 WHERE business_id=? AND id=?',[business,service]));
  assert.ok('error' in changed && code('offer_changed')(changed.error));
  const freshQuote = (changed.error as AppointmentError).quote!;
  assert.deepEqual(freshQuote,{...price.quote,priceCents:1800});
  const accepted = await createBooking(pool,{...price,quote:freshQuote});
  assert.equal(accepted.replayed,false);
  assert.equal(accepted.appointment.priceCents,1800);
  assert.equal((await createBooking(pool,repeat)).appointment.priceCents,1500);

  const blocked = {...quoted({...second,startAt:plus(first.startAt,300)}),quote:freshQuote};
  const closure = randomUUID();
  const closed = await whileChanging(pool,blocked,c=>c.execute(
    'INSERT INTO professional_closures(id,business_id,professional_id,start_at,end_at) VALUES (?,?,?,?,?)',
    [closure,business,professional,sqlTime(blocked.startAt),sqlTime(plus(blocked.startAt,30))],
  ),staff);
  assert.ok('error' in closed && code('slot_unavailable')(closed.error));
  assert.deepEqual((await publicAvailability(pool,{...blocked,from:blocked.startAt,to:plus(blocked.startAt,30)})).slots,[]);
  const [rolledBack] = await pool.execute<RowDataPacket[]>('SELECT appointment_id FROM appointment_requests WHERE customer_user_id=? AND request_key=?',[blocked.actorId,blocked.requestKey]);
  assert.deepEqual(rolledBack,[]);
  await pool.execute('DELETE FROM professional_closures WHERE id=?',[closure]);
  assert.equal((await createBooking(pool,blocked)).replayed,false);

  const outsideHours = {...quoted({...second,startAt:plus(first.startAt,360)}),quote:freshQuote};
  const weekday = (new Date(outsideHours.startAt).getUTCDay()+6)%7+1;
  const changedHours = await whileChanging(pool,outsideHours,async c=>{
    await c.execute('DELETE FROM working_hours WHERE business_id=? AND professional_id=? AND weekday=?',[business,professional,weekday]);
    await c.execute("INSERT INTO working_hours(id,business_id,professional_id,weekday,start_time,end_time) VALUES (?,?,?,?,'09:00','17:00'),(?,?,?,?,'19:00','21:00')",
      [randomUUID(),business,professional,weekday,randomUUID(),business,professional,weekday]);
  },staff);
  assert.ok('error' in changedHours && code('slot_unavailable')(changedHours.error));
  const evening = {...outsideHours,startAt:plus(outsideHours.startAt,60)};
  assert.equal((await createBooking(pool,evening)).appointment.startAt,evening.startAt);

  const hidden = {...quoted({...second,startAt:plus(first.startAt,480)}),quote:freshQuote};
  const changedVisibility = await whileChanging(pool,hidden,c=>c.execute('UPDATE businesses SET is_public=FALSE WHERE id=?',[business]));
  assert.ok('error' in changedVisibility && code('slot_unavailable')(changedVisibility.error));

  const pilotProfile = randomUUID();
  await pool.execute('INSERT INTO professionals(id,business_id,display_name) VALUES (?,?,?)',[pilotProfile,first.businessId,'Historical pilot profile']);
  await pool.execute("INSERT INTO working_hours(id,business_id,professional_id,weekday,start_time,end_time) VALUES (?,?,?,?,'00:00','24:00')",
    [randomUUID(),first.businessId,pilotProfile,weekday]);
  await pool.execute('INSERT INTO professional_services(business_id,professional_id,service_id) VALUES (?,?,?)',[first.businessId,pilotProfile,first.serviceId]);
  const pilot = {...first,professionalId:pilotProfile};
  await assert.rejects(createBooking(pool,quoted(pilot)),code('slot_unavailable'));
  const pilotRange = {...pilot,from:pilot.startAt,to:plus(pilot.startAt,30)};
  assert.equal((await publicAvailability(pool,pilotRange)).slots.length,1);
  assert.equal((await createAppointment(pool,pilot)).professionalId,pilotProfile);
  assert.equal((await publicAvailability(pool,pilotRange)).slots.length,0);
  await assert.rejects(createAppointment(pool,pilot),code('conflict'));
}

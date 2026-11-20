import { lockBusiness, lockProfessionalUsers, lockProfessionalProfiles } from './booking-locks.js';
import { createHash, randomUUID } from 'node:crypto';

/** Structural subset of a mysql2/promise connection. */
export interface SqlConnection {
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
  query(sql: string, params?: (string | number | boolean | null)[]): Promise<[unknown, unknown]>;
}
export interface AppointmentPool { getConnection(): Promise<SqlConnection>; }

export class AppointmentError extends Error {
  constructor(public readonly code: 'invalid' | 'unavailable' | 'conflict' | 'forbidden' | 'offer_changed' | 'idempotency_conflict' | 'slot_unavailable', message: string, public readonly quote?: Quote) { super(message); }
}

interface CreateInput {
  /** Must come from authenticated session, never directly from the request body. */
  actorId: string;
  businessId: string;
  professionalId: string;
  serviceId: string;
  /** Strict UTC ISO 8601 timestamp with milliseconds. */
  startAt: string;
  notes?: string | null;
}
export interface Quote {priceCents:number; currency:string; durationMinutes:number}
export interface BookingInput extends CreateInput {requestKey:string; quote:Quote}
interface Dependencies { now?: () => number; createId?: () => string; }
interface AgendaInput { actorId: string; businessId: string; professionalId: string; from: string; to: string; }
interface ServiceRow { duration_minutes: number; price_cents: number; currency: string; timezone: string; }
interface HoursRow { start_seconds: number; end_seconds: number; }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function requireId(value: string): void {
  if (typeof value !== 'string' || !UUID.test(value)) throw new AppointmentError('invalid', 'Invalid identifier');
}
function parseUtc(value: string): number {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) throw new AppointmentError('invalid', 'Invalid timestamp');
  const number = Date.parse(value);
  if (!Number.isFinite(number) || new Date(number).toISOString() !== value) throw new AppointmentError('invalid', 'Invalid timestamp');
  return number;
}
function dbTime(value: number): string { return new Date(value).toISOString().replace('T', ' ').replace('Z', ''); }
function rows<T>(result: [unknown, unknown]): T[] {
  if (!Array.isArray(result[0])) throw new Error('Expected database rows');
  return result[0] as T[];
}
async function transaction<T>(pool: AppointmentPool, action: (connection: SqlConnection) => Promise<T>, readCommitted=false): Promise<T> {
  const c = await pool.getConnection();
  let begun = false;
  try {
    if(readCommitted) await c.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await c.beginTransaction(); begun = true;
    const result = await action(c);
    await c.commit(); begun = false;
    return result;
  } catch (error) {
    if (begun) { try { await c.rollback(); } catch { /* preserve original error */ } }
    throw error;
  } finally { c.release(); }
}
function localParts(ms: number, timezone: string): { day: string; weekday: number; seconds: number; offset: string } {
  const date = new Date(ms);
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year:'numeric', month:'2-digit', day:'2-digit', weekday:'short', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23', timeZoneName:'longOffset' });
  const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
  const weekday = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(parts.weekday) + 1;
  if (!weekday || !parts.timeZoneName) throw new AppointmentError('unavailable', 'Schedule unavailable');
  return {day:`${parts.year}-${parts.month}-${parts.day}`, weekday, seconds: Number(parts.hour)*3600+Number(parts.minute)*60+Number(parts.second)+date.getUTCMilliseconds()/1000, offset:parts.timeZoneName};
}

/** Creates a booking for the authenticated user. Do not expose without authentication and rate limiting. */
export async function createAppointment(pool: AppointmentPool, input: CreateInput, deps: Dependencies = {}) {
  const {appointment} = await reserve(pool,input,deps);
  return appointment;
}

export async function createBooking(pool:AppointmentPool,input:BookingInput,deps:Dependencies={}) {
  for (const id of [input.requestKey,input.businessId,input.professionalId,input.serviceId]) requireId(id);
  const q=input.quote;
  if (!q || !Number.isSafeInteger(q.priceCents) || q.priceCents<0 || !Number.isSafeInteger(q.durationMinutes) || q.durationMinutes<=0 || typeof q.currency!=='string' || !/^[A-Z]{3}$/.test(q.currency)) throw new AppointmentError('invalid','Invalid quote');
  const normalized = {
    ...input,
    businessId: input.businessId.toLowerCase(),
    professionalId: input.professionalId.toLowerCase(),
    serviceId: input.serviceId.toLowerCase(),
    startAt: new Date(parseUtc(input.startAt)).toISOString(),
    notes: input.notes ?? null,
  };
  const hash=createHash('sha256').update(JSON.stringify([
    normalized.businessId,normalized.professionalId,normalized.serviceId,normalized.startAt,normalized.notes,
    q.priceCents,q.currency,q.durationMinutes,
  ])).digest('hex');
  try {
    return await reserve(pool,normalized,deps,{key:input.requestKey.toLowerCase(),hash,quote:q});
  } catch(error) {
    if(error instanceof AppointmentError && (error.code==='unavailable'||error.code==='conflict')) throw new AppointmentError('slot_unavailable','Slot unavailable');
    throw error;
  }
}

async function reserve(pool:AppointmentPool,input:CreateInput,deps:Dependencies,request?:{key:string;hash:string;quote:Quote}) {
  for (const id of [input.actorId,input.businessId,input.professionalId,input.serviceId]) requireId(id);
  const start = parseUtc(input.startAt);
  const now = (deps.now ?? Date.now)();
  if (!Number.isFinite(now) || (!request && start <= now)) throw new AppointmentError('invalid', 'Appointment must be in the future');
  if (input.notes != null && (typeof input.notes !== 'string' || Array.from(input.notes).length > 500)) throw new AppointmentError('invalid', 'Invalid notes');
  const id = (deps.createId ?? randomUUID)(); requireId(id);

  for (let attempt=0;;attempt++) {
    try { return await transaction(pool, async c => {
    if(request) {
      await c.query('INSERT INTO appointment_requests (customer_user_id,request_key,body_hash) VALUES (?,?,?) ON DUPLICATE KEY UPDATE request_key=request_key',[input.actorId,request.key,request.hash]);
      const [record]=rows<{body_hash:string;appointment_id:string|null}>(await c.query('SELECT body_hash,appointment_id FROM appointment_requests WHERE customer_user_id=? AND request_key=? FOR UPDATE',[input.actorId,request.key]));
      if(record.body_hash!==request.hash) throw new AppointmentError('idempotency_conflict','Request already used');
      if(record.appointment_id) {
        const [a]=rows<CustomerAppointmentRow>(await c.query('SELECT id,business_id,professional_id,service_id,start_at,end_at,price_cents,currency,status FROM appointments WHERE id=? AND customer_user_id=?',[record.appointment_id,input.actorId]));
        return {replayed:true,appointment:{id:a.id,businessId:a.business_id,professionalId:a.professional_id,serviceId:a.service_id,customerUserId:input.actorId,startAt:utcFromDatabase(a.start_at),endAt:utcFromDatabase(a.end_at),priceCents:a.price_cents,currency:a.currency,status:a.status}};
      }
    }
    await lockBusiness(c,input.businessId);
    const [candidate]=rows<{user_id:string|null}>(await c.query('SELECT user_id FROM professionals WHERE business_id=? AND id=?',[input.businessId,input.professionalId]));
    if (!candidate || (request && !candidate.user_id)) throw new AppointmentError('unavailable','Professional unavailable');
    if (candidate.user_id) await lockProfessionalUsers(c,[candidate.user_id]);
    const professional=(await lockProfessionalProfiles(c,input.businessId,[input.professionalId])).get(input.professionalId);
    if (!professional?.active || professional.user_id!==candidate.user_id) throw new AppointmentError('unavailable','Professional unavailable');
    const services = rows<ServiceRow>(await c.query(`SELECT s.duration_minutes, s.price_cents, s.currency, b.timezone
      FROM services s JOIN professional_services ps ON ps.business_id = s.business_id AND ps.service_id = s.id
      JOIN businesses b ON b.id = s.business_id
      WHERE ps.business_id = ? AND ps.professional_id = ? AND s.id = ? AND ps.active = TRUE AND s.active = TRUE AND b.is_public = TRUE
        AND (? IS NULL OR EXISTS (SELECT 1 FROM memberships m WHERE m.business_id = b.id AND m.user_id = ? AND m.status = 'active'))
      FOR UPDATE`, [input.businessId,input.professionalId,input.serviceId,candidate.user_id,candidate.user_id]));
    const service = services[0];
    if (!service || !Number.isSafeInteger(service.duration_minutes) || service.duration_minutes <= 0 || !Number.isSafeInteger(service.price_cents) || service.price_cents < 0) throw new AppointmentError('unavailable','Service unavailable');
    const quote={priceCents:service.price_cents,currency:service.currency,durationMinutes:service.duration_minutes};
    if(request && (quote.priceCents!==request.quote.priceCents||quote.currency!==request.quote.currency||quote.durationMinutes!==request.quote.durationMinutes)) throw new AppointmentError('offer_changed','Offer changed',quote);
    if(start <= (deps.now??Date.now)()) throw new AppointmentError('unavailable','Slot unavailable');
    const end = start + service.duration_minutes * 60_000;
    if (!Number.isSafeInteger(end)) throw new AppointmentError('invalid','Invalid duration');
    let localStart, localEnd;
    try { localStart = localParts(start, service.timezone); localEnd = localParts(end, service.timezone); }
    catch { throw new AppointmentError('unavailable','Schedule unavailable'); }
    // Accept an exact local midnight as 24:00 on the starting day. Other
    // cross-day and offset-changing bookings remain unsupported for now.
    const nextDay = new Date(Date.parse(`${localStart.day}T00:00:00.000Z`) + 86_400_000).toISOString().slice(0, 10);
    const isMidnightEnd = localEnd.day === nextDay && localEnd.seconds === 0;
    const endSeconds = isMidnightEnd ? 86_400 : localEnd.seconds;
    if ((!isMidnightEnd && (localStart.day !== localEnd.day || localStart.weekday !== localEnd.weekday)) || localStart.offset !== localEnd.offset || endSeconds <= localStart.seconds) throw new AppointmentError('unavailable','Schedule unavailable');
    const hours = rows<HoursRow>(await c.query('SELECT TIME_TO_SEC(start_time) AS start_seconds, TIME_TO_SEC(end_time) AS end_seconds FROM working_hours WHERE business_id = ? AND professional_id = ? AND weekday = ? FOR UPDATE', [input.businessId,input.professionalId,localStart.weekday]));
    if (!hours.some(h => Number(h.start_seconds) <= localStart.seconds && Number(h.end_seconds) >= endSeconds)) throw new AppointmentError('unavailable','Schedule unavailable');
    const closures=rows(await c.query('SELECT id FROM professional_closures WHERE business_id=? AND professional_id=? AND start_at < ? AND end_at > ? LIMIT 1 FOR UPDATE',[input.businessId,input.professionalId,dbTime(end),dbTime(start)]));
    if(closures.length) throw new AppointmentError('conflict','Appointment conflict');
    const occupied = rows<{id:string}>(await c.query(`SELECT id FROM appointments
      WHERE (professional_id = ? OR professional_id IN (SELECT id FROM professionals WHERE user_id = ?))
        AND status IN ('booked','completed','no_show') AND start_at < ? AND end_at > ? LIMIT 1 FOR UPDATE`,
      [input.professionalId,candidate.user_id,dbTime(end),dbTime(start)]));
    if (occupied.length) throw new AppointmentError('conflict','Appointment conflict');
    await c.query("INSERT INTO appointments (id,business_id,professional_id,service_id,customer_user_id,start_at,end_at,status,notes,price_cents,currency) VALUES (?,?,?,?,?,?,?,'booked',?,?,?)", [id,input.businessId,input.professionalId,input.serviceId,input.actorId,dbTime(start),dbTime(end),input.notes ?? null,service.price_cents,service.currency]);
    if(request) await c.query('UPDATE appointment_requests SET appointment_id=? WHERE customer_user_id=? AND request_key=?',[id,input.actorId,request.key]);
    return {replayed:false,appointment:{id,businessId:input.businessId,professionalId:input.professionalId,serviceId:input.serviceId,customerUserId:input.actorId,startAt:new Date(start).toISOString(),endAt:new Date(end).toISOString(),priceCents:service.price_cents,currency:service.currency,status:'booked' as const}};
    },true); } catch(error) {
      if(attempt>=2 || !(error instanceof Error) || !('code' in error) || error.code!=='ER_LOCK_DEADLOCK') throw error;
    }
  }
}

/** Reads a professional agenda only for an active owner/admin or that professional. */
export async function listProfessionalAgenda(pool: AppointmentPool, input: AgendaInput) {
  for (const id of [input.actorId,input.businessId,input.professionalId]) requireId(id);
  const from = parseUtc(input.from), to = parseUtc(input.to);
  if (from >= to || to - from > 31 * 86_400_000) throw new AppointmentError('invalid', 'Invalid agenda range');
  return transaction(pool, async c => {
    const membership = rows<{role:string}>(await c.query("SELECT role FROM memberships WHERE business_id = ? AND user_id = ? AND status = 'active' LOCK IN SHARE MODE", [input.businessId,input.actorId]));
    if (!membership.length || !['owner','admin','professional'].includes(membership[0].role)) throw new AppointmentError('forbidden','Forbidden');
    const professional = rows<{user_id:string|null}>(await c.query('SELECT user_id FROM professionals WHERE business_id = ? AND id = ? LOCK IN SHARE MODE', [input.businessId,input.professionalId]));
    if (!professional.length || (membership[0].role === 'professional' && professional[0].user_id !== input.actorId)) throw new AppointmentError('forbidden','Forbidden');
    return rows<Record<string,unknown>>(await c.query('SELECT id, service_id, customer_user_id, start_at, end_at, status, notes FROM appointments WHERE business_id = ? AND professional_id = ? AND start_at < ? AND end_at > ? ORDER BY start_at, id', [input.businessId,input.professionalId,dbTime(to),dbTime(from)]));
  });
}

interface CustomerAgendaInput { actorId: string; from: string; to: string; }
interface CustomerAppointmentRow {
  id: string; business_id: string; professional_id: string; service_id: string;
  start_at: Date | string; end_at: Date | string; status: string; price_cents: number; currency: string;
}
function utcFromDatabase(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value.replace(' ', 'T') + 'Z');
  if (!Number.isFinite(date.valueOf())) throw new Error('Invalid database timestamp');
  return date.toISOString();
}

/** Lists only the authenticated customer's appointments; timestamps are UTC. */
export async function listCustomerAppointments(pool: AppointmentPool, input: CustomerAgendaInput) {
  requireId(input.actorId);
  const from = parseUtc(input.from), to = parseUtc(input.to);
  if (from >= to || to - from > 31 * 86_400_000) throw new AppointmentError('invalid', 'Invalid appointment range');
  return transaction(pool, async c => {
    const appointments = rows<CustomerAppointmentRow>(await c.query(
      'SELECT id, business_id, professional_id, service_id, start_at, end_at, status, price_cents, currency FROM appointments WHERE customer_user_id = ? AND start_at >= ? AND start_at < ? ORDER BY start_at, id LIMIT 100',
      [input.actorId, dbTime(from), dbTime(to)],
    ));
    return appointments.map(a => ({
      id: a.id, businessId: a.business_id, professionalId: a.professional_id, serviceId: a.service_id,
      startAt: utcFromDatabase(a.start_at), endAt: utcFromDatabase(a.end_at), status: a.status,
      priceCents: a.price_cents, currency: a.currency,
    }));
  });
}

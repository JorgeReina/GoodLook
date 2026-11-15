import { randomUUID } from 'node:crypto';

/** Structural subset of a mysql2/promise connection. */
export interface SqlConnection {
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
  query(sql: string, params?: readonly unknown[]): Promise<[unknown, unknown]>;
}
export interface AppointmentPool { getConnection(): Promise<SqlConnection>; }

export class AppointmentError extends Error {
  constructor(public readonly code: 'invalid' | 'unavailable' | 'conflict' | 'forbidden', message: string) { super(message); }
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
async function transaction<T>(pool: AppointmentPool, action: (connection: SqlConnection) => Promise<T>): Promise<T> {
  const c = await pool.getConnection();
  let begun = false;
  try {
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
  for (const id of [input.actorId,input.businessId,input.professionalId,input.serviceId]) requireId(id);
  const start = parseUtc(input.startAt);
  const now = (deps.now ?? Date.now)();
  if (!Number.isFinite(now) || start <= now) throw new AppointmentError('invalid', 'Appointment must be in the future');
  if (input.notes != null && (typeof input.notes !== 'string' || Array.from(input.notes).length > 500)) throw new AppointmentError('invalid', 'Invalid notes');
  const id = (deps.createId ?? randomUUID)(); requireId(id);

  return transaction(pool, async c => {
    const professional = rows<{user_id:string|null}>(await c.query('SELECT p.user_id FROM professionals p WHERE p.business_id = ? AND p.id = ? AND p.active = TRUE FOR UPDATE', [input.businessId,input.professionalId]));
    if (!professional.length) throw new AppointmentError('unavailable','Professional unavailable');
    const services = rows<ServiceRow>(await c.query(`SELECT s.duration_minutes, s.price_cents, s.currency, b.timezone FROM services s JOIN professional_services ps ON ps.business_id = s.business_id AND ps.service_id = s.id JOIN businesses b ON b.id = s.business_id WHERE ps.business_id = ? AND ps.professional_id = ? AND s.id = ? AND s.active = TRUE AND b.is_public = TRUE FOR UPDATE`, [input.businessId,input.professionalId,input.serviceId]));
    const service = services[0];
    if (!service || !Number.isSafeInteger(service.duration_minutes) || service.duration_minutes <= 0 || !Number.isSafeInteger(service.price_cents) || service.price_cents < 0) throw new AppointmentError('unavailable','Service unavailable');
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
    const occupied = rows<{id:string}>(await c.query("SELECT id FROM appointments WHERE business_id = ? AND professional_id = ? AND status IN ('booked','completed','no_show') AND start_at < ? AND end_at > ? LIMIT 1 FOR UPDATE", [input.businessId,input.professionalId,dbTime(end),dbTime(start)]));
    if (occupied.length) throw new AppointmentError('conflict','Appointment conflict');
    await c.query("INSERT INTO appointments (id,business_id,professional_id,service_id,customer_user_id,start_at,end_at,status,notes,price_cents,currency) VALUES (?,?,?,?,?,?,?,'booked',?,?,?)", [id,input.businessId,input.professionalId,input.serviceId,input.actorId,dbTime(start),dbTime(end),input.notes ?? null,service.price_cents,service.currency]);
    return {id,businessId:input.businessId,professionalId:input.professionalId,serviceId:input.serviceId,customerUserId:input.actorId,startAt:new Date(start).toISOString(),endAt:new Date(end).toISOString(),priceCents:service.price_cents,currency:service.currency,status:'booked' as const};
  });
}

/** Reads a professional agenda only for an active owner/admin or that professional. */
export async function listProfessionalAgenda(pool: AppointmentPool, input: AgendaInput) {
  for (const id of [input.actorId,input.businessId,input.professionalId]) requireId(id);
  const from = parseUtc(input.from), to = parseUtc(input.to);
  if (from >= to || to - from > 31 * 86_400_000) throw new AppointmentError('invalid', 'Invalid agenda range');
  return transaction(pool, async c => {
    const membership = rows<{role:string}>(await c.query("SELECT role FROM memberships WHERE business_id = ? AND user_id = ? AND status = 'active' FOR SHARE", [input.businessId,input.actorId]));
    if (!membership.length || !['owner','admin','professional'].includes(membership[0].role)) throw new AppointmentError('forbidden','Forbidden');
    const professional = rows<{user_id:string|null}>(await c.query('SELECT user_id FROM professionals WHERE business_id = ? AND id = ? FOR SHARE', [input.businessId,input.professionalId]));
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

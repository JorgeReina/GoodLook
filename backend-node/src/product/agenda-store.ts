import type { Pool, RowDataPacket } from 'mysql2/promise';

const day = 86_400_000;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const date = /^[1-9]\d{3}-\d{2}-\d{2}$/;
const timestamp = /^[1-9]\d{3}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export class AgendaInputError extends Error {
  readonly code = 'invalid_input';
}

export function agendaId(value: unknown): string {
  if (typeof value !== 'string' || !uuid.test(value)) throw new AgendaInputError();
  return value.toLowerCase();
}

export function agendaMonday(value: unknown): string {
  if (typeof value !== 'string' || !date.test(value)) throw new AgendaInputError();
  const parsed = new Date(value + 'T00:00:00.000Z');
  if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== value ||
      parsed.getUTCDay() !== 1 || !date.test(new Date(parsed.valueOf() + 7 * day).toISOString().slice(0, 10))) {
    throw new AgendaInputError();
  }
  return value;
}

export function agendaTimestamp(value: unknown): number {
  if (typeof value !== 'string' || !timestamp.test(value)) throw new AgendaInputError();
  const milliseconds = Date.parse(value);
  const canonical = value.length === 20 ? value.replace('Z', '.000Z') : value;
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== canonical) throw new AgendaInputError();
  return milliseconds;
}

interface WorkPeriod { weekday: number; startTime: string; endTime: string }
interface Interval { id: string; startAt: string; endAt: string }
interface AgendaItem extends Interval { serviceId: string; serviceName: string; customerName: string; status: string; notes: string | null }
interface CustomerAppointment extends Interval {
  businessId: string;
  businessName: string;
  timezone: string;
  professionalId: string;
  professionalName: string;
  serviceId: string;
  serviceName: string;
  status: string;
  priceCents: number;
  currency: string;
  durationMinutes: number;
}
interface AgendaWeek {
  timezone: string;
  from: string;
  to: string;
  hours: WorkPeriod[];
  closures: Interval[];
  appointments: AgendaItem[];
}
interface BookingPage { items: CustomerAppointment[]; nextCursor: string | null }

export interface AgendaStore {
  week(actorId: string, businessId: string, professionalId: string, monday: string): Promise<AgendaWeek | null>;
  bookings(actorId: string, from: number, to: number, cursor?: string | null): Promise<BookingPage>;
}

function sqlTime(value: number): string { return new Date(value).toISOString().replace('T', ' ').slice(0, -1); }
function utc(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value.replace(' ', 'T') + 'Z')).toISOString();
}

function localWeek(monday: string, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const local = (instant: number) => {
    const parts = Object.fromEntries(formatter.formatToParts(instant).map(part => [part.type, part.value]));
    return Date.parse(parts.year.padStart(4, '0') + '-' + parts.month + '-' + parts.day +
      'T' + parts.hour + ':' + parts.minute + ':' + parts.second + 'Z');
  };
  function startOfDay(target: number) {
    // Try offsets on both sides of midnight. If midnight repeats, take its first occurrence.
    const offsets = new Set([-36, -12, 0, 12, 36].map(hours => {
      const instant = target + hours * 3_600_000;
      return local(instant) - instant;
    }));
    const exact = [...offsets].map(offset => target - offset).filter(instant => local(instant) === target);
    if (exact.length) return Math.min(...exact);
    // A clock jump can skip midnight. Find the first representable instant of the day.
    let low = Math.floor((target - 36 * 3_600_000) / 1000);
    let high = Math.floor((target + 36 * 3_600_000) / 1000);
    while (low + 1 < high) {
      const middle = Math.floor((low + high) / 2);
      if (local(middle * 1000) >= target) high = middle;
      else low = middle;
    }
    return high * 1000;
  }

  const first = Date.parse(monday + 'T00:00:00.000Z');
  return { from: startOfDay(first), to: startOfDay(first + 7 * day) };
}

type DatabaseTimes = { startAt: Date | string; endAt: Date | string };
type AppointmentRow = RowDataPacket & Omit<CustomerAppointment, keyof DatabaseTimes | 'durationMinutes'> & DatabaseTimes;
type AgendaRow = RowDataPacket & Omit<AgendaItem, keyof DatabaseTimes> & DatabaseTimes;

function decodeCursor(cursor: string, from: number, to: number): { at: string; id: string } {
  if (cursor.length > 120 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new AgendaInputError();
  const raw = Buffer.from(cursor, 'base64url');
  if (raw.toString('base64url') !== cursor) throw new AgendaInputError();
  const [value, id, extra] = raw.toString('utf8').split('|');
  const at = agendaTimestamp(value);
  if (at < from || at >= to || extra !== undefined) throw new AgendaInputError();
  return { at: sqlTime(at), id: agendaId(id) };
}

export class MysqlAgendaStore implements AgendaStore {
  constructor(private readonly pool: Pick<Pool, 'getConnection' | 'execute'>) {}

  async week(actorId: string, businessId: string, professionalId: string, monday: string): Promise<AgendaWeek | null> {
    const connection = await this.pool.getConnection();
    try {
      await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await connection.beginTransaction();
      // The authorization and all projected data share a single snapshot.
      const [[scope]] = await connection.execute<(RowDataPacket & { timezone: string })[]>(`SELECT b.timezone
        FROM memberships m JOIN businesses b ON b.id = m.business_id
        JOIN professionals p ON p.business_id = b.id
        WHERE m.user_id = ? AND b.id = ? AND p.id = ? AND m.status = 'active'
          AND (m.role IN ('owner', 'admin') OR (m.role = 'professional' AND p.user_id = m.user_id AND p.active = TRUE))`,
      [actorId, businessId, professionalId]);
      if (!scope) {
        await connection.commit();
        return null;
      }
      const { timezone } = scope;
      const { from, to } = localWeek(monday, timezone);
      const profile = [businessId, professionalId];
      const bounds = [...profile, sqlTime(to), sqlTime(from)];
      const [hours] = await connection.execute<(RowDataPacket & WorkPeriod)[]>(`SELECT weekday,
        TIME_FORMAT(start_time,'%H:%i') AS startTime, TIME_FORMAT(end_time,'%H:%i') AS endTime
        FROM working_hours WHERE business_id = ? AND professional_id = ? ORDER BY weekday,start_time,id`, profile);
      const [closures] = await connection.execute<(RowDataPacket & DatabaseTimes & {id: string})[]>(`SELECT id,start_at AS startAt,end_at AS endAt
        FROM professional_closures WHERE business_id = ? AND professional_id = ? AND start_at < ? AND end_at > ?
        ORDER BY start_at,id`, bounds);
      const [appointments] = await connection.execute<AgendaRow[]>(`SELECT a.id,a.service_id AS serviceId,s.name AS serviceName,
        u.display_name AS customerName,a.start_at AS startAt,a.end_at AS endAt,a.status,a.notes
        FROM appointments a JOIN services s ON s.business_id = a.business_id AND s.id = a.service_id
        JOIN users u ON u.id = a.customer_user_id
        WHERE a.business_id = ? AND a.professional_id = ? AND a.start_at < ? AND a.end_at > ? ORDER BY a.start_at,a.id`, bounds);
      const result: AgendaWeek = {
        timezone, from: new Date(from).toISOString(), to: new Date(to).toISOString(),
        hours: hours.map(({ weekday, startTime, endTime }) => ({ weekday, startTime: startTime.slice(0, 5), endTime: endTime.slice(0, 5) })),
        closures: closures.map(({ id, startAt, endAt }) => ({ id, startAt: utc(startAt), endAt: utc(endAt) })),
        appointments: appointments.map(({ id, serviceId, serviceName, customerName, startAt, endAt, status, notes }) =>
          ({ id, serviceId, serviceName, customerName, startAt: utc(startAt), endAt: utc(endAt), status, notes })),
      };
      await connection.commit();
      return result;
    } catch (error) {
      try { await connection.rollback(); } catch { /* Keep the original error. */ }
      throw error;
    } finally {
      connection.release();
    }
  }

  async bookings(actorId: string, from: number, to: number, cursor?: string | null): Promise<BookingPage> {
    const after = cursor == null ? null : decodeCursor(cursor, from, to);
    const params = [actorId, sqlTime(from), sqlTime(to)];
    if (after) params.push(after.at, after.at, after.id);
    const [rows] = await this.pool.execute<AppointmentRow[]>(`SELECT a.id,a.business_id AS businessId,b.name AS businessName,b.timezone,
        a.professional_id AS professionalId,p.display_name AS professionalName,a.service_id AS serviceId,s.name AS serviceName,
        a.start_at AS startAt,a.end_at AS endAt,a.status,a.price_cents AS priceCents,a.currency
      FROM appointments a
      JOIN businesses b ON b.id = a.business_id
      JOIN professionals p ON p.business_id = a.business_id AND p.id = a.professional_id
      JOIN services s ON s.business_id = a.business_id AND s.id = a.service_id
      WHERE a.customer_user_id = ? AND a.start_at >= ? AND a.start_at < ?
      ${after ? 'AND (a.start_at > ? OR (a.start_at = ? AND a.id > ?))' : ''}
      ORDER BY a.start_at,a.id LIMIT 101`, params);
    const items = rows.slice(0, 100).map(row => {
      const { id, businessId, businessName, timezone, professionalId, professionalName, serviceId, serviceName, status, priceCents, currency } = row;
      const startAt = utc(row.startAt);
      const endAt = utc(row.endAt);
      return {
        id, businessId, businessName, timezone, professionalId, professionalName, serviceId, serviceName,
        status, priceCents, currency, startAt, endAt, durationMinutes: (Date.parse(endAt) - Date.parse(startAt)) / 60_000,
      };
    });
    const last = items[items.length - 1];
    const nextCursor = rows.length > 100 ? Buffer.from(last.startAt + '|' + last.id).toString('base64url') : null;
    return { items, nextCursor };
  }
}

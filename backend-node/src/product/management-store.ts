import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { lockBusiness, lockProfessionalProfiles, lockProfessionalUsers } from '../appointments/booking-locks.js';
import type { WorkPeriod } from '../catalog/service.js';
import {
  ManagementError, type BusinessProfile, type Closure, type ManagedService, type ManagedStaff,
  type ManagementStore, type ProfileData, type ServiceData, type ServicePatch, type StaffPatch,
} from './management-service.js';

interface BusinessRow extends RowDataPacket, ProfileData {
  id: string;
  is_public: number;
  first_published_at: Date | null;
}
interface ServiceRow extends RowDataPacket, Omit<ManagedService, 'active'> { active: number }
interface StaffRow extends RowDataPacket { id: string; display_name: string; active: number; user_id: string | null }
interface AssignmentRow extends RowDataPacket { professional_id: string; service_id: string }
interface ClosureRow extends RowDataPacket { id: string; professional_id: string; start_at: Date; end_at: Date }
interface AppointmentRow extends RowDataPacket { id: string; service_id: string; start_at: Date; end_at: Date }
interface HoursRow extends RowDataPacket, WorkPeriod {}
interface RoleRow extends RowDataPacket { role: string }
interface IdRow extends RowDataPacket { id: string }

function profile(row: BusinessRow): BusinessProfile {
  return { id: row.id, name: row.name, timezone: row.timezone, sector: row.sector, address: row.address, isPublic: Boolean(row.is_public) };
}

function service(row: ServiceRow): ManagedService {
  const { id, businessId, name, description, durationMinutes, priceCents, currency, active } = row;
  return { id, businessId, name, description, durationMinutes, priceCents, currency, active: Boolean(active) };
}

function staff(row: StaffRow, serviceIds: string[]): ManagedStaff {
  return { id: row.id, displayName: row.display_name, active: Boolean(row.active), linked: row.user_id !== null, serviceIds };
}

function coversHours(appointment: AppointmentRow, hours: WorkPeriod[], format: Intl.DateTimeFormat) {
  const local = (value: Date) => {
    const p = Object.fromEntries(format.formatToParts(value).map(part => [part.type, part.value]));
    const day = `${p.year}-${p.month}-${p.day}`;
    const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday) + 1;
    const seconds = Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second) + value.getUTCMilliseconds() / 1000;
    return { day, weekday, seconds, offset: p.timeZoneName };
  };
  const start = local(appointment.start_at);
  const end = local(appointment.end_at);
  const nextDay = new Date(Date.parse(start.day + 'T00:00:00.000Z') + 86_400_000).toISOString().slice(0, 10);
  const midnight = end.seconds === 0 && end.day === nextDay;
  const endSeconds = midnight ? 86_400 : end.seconds;
  if ((!midnight && start.day !== end.day) || start.offset !== end.offset || start.seconds >= endSeconds) return false;
  const secondsAt = (value: string) => Number(value.slice(0, 2)) * 3600 + Number(value.slice(3)) * 60;
  return hours.some(hour => hour.weekday === start.weekday && secondsAt(hour.startTime) <= start.seconds && secondsAt(hour.endTime) >= endSeconds);
}

export class MysqlManagementStore implements ManagementStore {
  constructor(private readonly pool: Pool, private readonly secret: string) {}

  private async transaction<T>(action: (connection: PoolConnection) => Promise<T>): Promise<T> {
    const connection = await this.pool.getConnection();
    let begun = false;
    try {
      await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
      await connection.beginTransaction();
      begun = true;
      const result = await action(connection);
      await connection.commit();
      begun = false;
      return result;
    } catch (error) {
      if (begun) {
        try { await connection.rollback(); } catch { /* preserve original error */ }
      }
      throw error;
    } finally {
      connection.release();
    }
  }

  private manage<T>(actor: string, business: string, action: (connection: PoolConnection) => Promise<T>, ownerOnly = false) {
    return this.transaction(async connection => {
      // Match the booking protocol before reading configuration or affected appointments.
      await lockBusiness(connection, business);
      const [[membership]] = await connection.execute<RoleRow[]>(
        "SELECT role FROM memberships WHERE business_id=? AND user_id=? AND status='active' FOR UPDATE", [business, actor],
      );
      if (!membership || (membership.role !== 'owner' && (ownerOnly || membership.role !== 'admin'))) throw new ManagementError('forbidden');
      return action(connection);
    });
  }

  private async business(c: PoolConnection, id: string): Promise<BusinessRow> {
    const [[row]] = await c.execute<BusinessRow[]>(
      'SELECT id,name,timezone,sector,address,is_public,first_published_at FROM businesses WHERE id=?', [id],
    );
    if (!row) throw new ManagementError('not_found');
    return row;
  }

  private async professional(c: PoolConnection, business: string, id: string): Promise<StaffRow> {
    const [[row]] = await c.execute<StaffRow[]>(
      'SELECT id,display_name,active,user_id FROM professionals WHERE business_id=? AND id=?', [business, id],
    );
    if (!row) throw new ManagementError('not_found');
    return row;
  }

  private async lockStaff(c: PoolConnection, business: string, id: string) {
    const candidate = await this.professional(c, business, id);
    if (candidate.user_id) await lockProfessionalUsers(c, [candidate.user_id]);
    const locked = (await lockProfessionalProfiles(c, business, [id])).get(id);
    if (!locked || locked.user_id !== candidate.user_id) throw new ManagementError('not_found');
    return candidate;
  }

  private async future(c: PoolConnection, business: string, filter: { staff?: string; service?: string } = {}) {
    const [rows] = await c.execute<AppointmentRow[]>(
      `SELECT id,service_id,start_at,end_at FROM appointments
       WHERE business_id=? AND status='booked' AND start_at>UTC_TIMESTAMP(3)
       ${filter.staff ? 'AND professional_id=?' : ''} ${filter.service ? 'AND service_id=?' : ''} ORDER BY id`,
      [business, ...(filter.staff ? [filter.staff] : []), ...(filter.service ? [filter.service] : [])],
    );
    return rows;
  }

  private confirm(actor: string, business: string, action: unknown, affected: AppointmentRow[], supplied?: string) {
    if (!affected.length && supplied === undefined) return;
    const impactToken = createHmac('sha256', this.secret)
      .update(JSON.stringify(['goodlook-management-impact-v1', actor, business, action, affected.map(row => row.id).sort()]))
      .digest('hex');
    if (typeof supplied === 'string' && /^[0-9a-f]{64}$/.test(supplied) &&
        timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(impactToken, 'hex'))) return;
    throw new ManagementError('impact_confirmation_required', { affectedCount: affected.length, impactToken });
  }

  async createBusiness(actor: string, data: ProfileData): Promise<BusinessProfile> {
    return this.transaction(async c => {
      const id = randomUUID();
      await c.execute('INSERT INTO businesses (id,name,timezone,sector,address,is_public,created_at) VALUES (?,?,?,?,?,FALSE,UTC_TIMESTAMP(3))',
        [id, data.name, data.timezone, data.sector, data.address]);
      await c.execute("INSERT INTO memberships (business_id,user_id,role,status,created_at) VALUES (?,?,'owner','active',UTC_TIMESTAMP(3))", [id, actor]);
      return { id, ...data, isPublic: false };
    });
  }

  get(actor: string, business: string) {
    return this.manage(actor, business, async c => {
      const [services] = await c.execute<ServiceRow[]>(
        `SELECT id,business_id AS businessId,name,description,duration_minutes AS durationMinutes,
                price_cents AS priceCents,currency,active FROM services WHERE business_id=? ORDER BY name,id`, [business],
      );
      const [staffRows] = await c.execute<StaffRow[]>('SELECT id,display_name,active,user_id FROM professionals WHERE business_id=? ORDER BY display_name,id', [business]);
      const [assignments] = await c.execute<AssignmentRow[]>(
        'SELECT professional_id,service_id FROM professional_services WHERE business_id=? AND active=TRUE ORDER BY service_id', [business],
      );
      const byProfile = new Map<string, string[]>();
      for (const { professional_id, service_id } of assignments) {
        const ids = byProfile.get(professional_id) ?? [];
        ids.push(service_id);
        byProfile.set(professional_id, ids);
      }
      return { business: profile(await this.business(c, business)), services: services.map(service), staff: staffRows.map(row => staff(row, byProfile.get(row.id) ?? [])) };
    });
  }

  patchProfile(actor: string, business: string, patch: Partial<ProfileData>) {
    return this.manage(actor, business, async c => {
      const original = await this.business(c, business);
      if (patch.timezone !== undefined && patch.timezone !== original.timezone) {
        const [future] = await c.execute<IdRow[]>(
          "SELECT id FROM appointments WHERE business_id=? AND status='booked' AND start_at>UTC_TIMESTAMP(3) LIMIT 1", [business],
        );
        if (future.length) throw new ManagementError('timezone_has_bookings');
      }
      const next = { ...profile(original), ...patch };
      await c.execute('UPDATE businesses SET name=?,sector=?,address=?,timezone=? WHERE id=?',
        [next.name, next.sector, next.address, next.timezone, business]);
    }, true);
  }

  setVisibility(actor: string, business: string, published: boolean) {
    return this.manage(actor, business, async c => {
      const row = await this.business(c, business);
      if (published && !row.is_public && !row.first_published_at) {
        const [offers] = await c.execute<IdRow[]>(`SELECT p.id
          FROM professionals p JOIN memberships m ON m.business_id=p.business_id AND m.user_id=p.user_id AND m.status='active'
          JOIN professional_services ps ON ps.business_id=p.business_id AND ps.professional_id=p.id AND ps.active=TRUE
          JOIN services s ON s.business_id=ps.business_id AND s.id=ps.service_id AND s.active=TRUE
          WHERE p.business_id=? AND p.active=TRUE
          AND EXISTS (SELECT 1 FROM working_hours h WHERE h.business_id=p.business_id AND h.professional_id=p.id) LIMIT 1`, [business]);
        if (!row.name.trim() || !row.sector?.trim() || !row.address?.trim() || !offers.length) throw new ManagementError('publication_incomplete');
      }
      await c.execute(`UPDATE businesses SET first_published_at=CASE WHEN is_public OR ? THEN COALESCE(first_published_at,UTC_TIMESTAMP(3)) ELSE first_published_at END,
         is_public=? WHERE id=?`, [published, published, business]);
    }, true);
  }

  createService(actor: string, business: string, data: ServiceData): Promise<ManagedService> {
    return this.manage(actor, business, async c => {
      const id = randomUUID();
      await c.execute('INSERT INTO services (id,business_id,name,description,duration_minutes,price_cents,currency) VALUES (?,?,?,?,?,?,?)',
        [id, business, data.name, data.description, data.durationMinutes, data.priceCents, data.currency]);
      return { id, businessId: business, ...data, active: true };
    });
  }

  patchService(actor: string, business: string, id: string, patch: ServicePatch, token?: string) {
    return this.manage(actor, business, async c => {
      const [[row]] = await c.execute<ServiceRow[]>(
        `SELECT id,business_id AS businessId,name,description,duration_minutes AS durationMinutes,
                price_cents AS priceCents,currency,active FROM services WHERE business_id=? AND id=?`, [business, id],
      );
      if (!row) throw new ManagementError('not_found');
      if (patch.active === false && (row.active || token !== undefined)) {
        this.confirm(actor, business, ['service', id, patch], row.active ? await this.future(c, business, { service: id }) : [], token);
      }
      const next = { ...service(row), ...patch };
      await c.execute('UPDATE services SET name=?,description=?,duration_minutes=?,price_cents=?,currency=?,active=? WHERE business_id=? AND id=?',
        [next.name, next.description, next.durationMinutes, next.priceCents, next.currency, next.active, business, id]);
    });
  }

  createStaff(actor: string, business: string, displayName: string): Promise<ManagedStaff> {
    return this.manage(actor, business, async c => {
      const id = randomUUID();
      await c.execute('INSERT INTO professionals (id,business_id,display_name) VALUES (?,?,?)', [id, business, displayName]);
      return { id, displayName, active: true, linked: false, serviceIds: [] };
    });
  }

  patchStaff(actor: string, business: string, id: string, patch: StaffPatch, token?: string) {
    return this.manage(actor, business, async c => {
      const row = await this.lockStaff(c, business, id);
      if (patch.active === false && (row.active || token !== undefined)) {
        this.confirm(actor, business, ['staff', id, patch], row.active ? await this.future(c, business, { staff: id }) : [], token);
      }
      await c.execute('UPDATE professionals SET display_name=?,active=? WHERE business_id=? AND id=?',
        [patch.displayName ?? row.display_name, patch.active ?? Boolean(row.active), business, id]);
    });
  }

  setAssignments(actor: string, business: string, id: string, services: string[], token?: string) {
    return this.manage(actor, business, async c => {
      await this.lockStaff(c, business, id);
      const [previous] = await c.execute<AssignmentRow[]>(
        'SELECT service_id FROM professional_services WHERE business_id=? AND professional_id=? AND active=TRUE', [business, id],
      );
      const present = new Set(previous.map(row => row.service_id));
      const requested = new Set(services);
      const additions = services.filter(serviceId => !present.has(serviceId));
      if (additions.length) {
        const [valid] = await c.execute<IdRow[]>(
          `SELECT id FROM services WHERE business_id=? AND active=TRUE AND id IN (${additions.map(() => '?').join(',')})`, [business, ...additions],
        );
        if (valid.length !== additions.length) throw new ManagementError('not_found');
      }
      const removals = [...present].filter(serviceId => !requested.has(serviceId));
      const removed = new Set(removals);
      const affected = removals.length ? (await this.future(c, business, { staff: id })).filter(row => removed.has(row.service_id)) : [];
      this.confirm(actor, business, ['assignments', id, services], affected, token);
      if (removals.length) await c.execute(
        `UPDATE professional_services SET active=FALSE WHERE business_id=? AND professional_id=? AND service_id IN (${removals.map(() => '?').join(',')})`,
        [business, id, ...removals],
      );
      for (const serviceId of additions) await c.execute(
        'INSERT INTO professional_services (business_id,professional_id,service_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE active=TRUE',
        [business, id, serviceId],
      );
    });
  }

  getHours(actor: string, business: string, id: string) {
    return this.manage(actor, business, async c => {
      await this.professional(c, business, id);
      const [rows] = await c.execute<HoursRow[]>(`SELECT weekday,TIME_FORMAT(start_time,'%H:%i') AS startTime,
        TIME_FORMAT(end_time,'%H:%i') AS endTime FROM working_hours WHERE business_id=? AND professional_id=? ORDER BY weekday,start_time`, [business, id]);
      return rows.map(({ weekday, startTime, endTime }) => ({ weekday, startTime, endTime }));
    });
  }

  setHours(actor: string, business: string, id: string, hours: WorkPeriod[], token?: string) {
    return this.manage(actor, business, async c => {
      await this.lockStaff(c, business, id);
      const format = new Intl.DateTimeFormat('en-GB', {
        timeZone: (await this.business(c, business)).timezone, year: 'numeric', month: '2-digit', day: '2-digit',
        weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset',
      });
      const affected = (await this.future(c, business, { staff: id })).filter(row => !coversHours(row, hours, format));
      this.confirm(actor, business, ['hours', id, hours], affected, token);
      await c.execute('DELETE FROM working_hours WHERE business_id=? AND professional_id=?', [business, id]);
      for (const hour of hours) await c.execute(
        'INSERT INTO working_hours (id,business_id,professional_id,weekday,start_time,end_time) VALUES (?,?,?,?,?,?)',
        [randomUUID(), business, id, hour.weekday, hour.startTime, hour.endTime],
      );
    });
  }

  getClosures(actor: string, business: string, id: string): Promise<Closure[]> {
    return this.manage(actor, business, async c => {
      await this.professional(c, business, id);
      const [rows] = await c.execute<ClosureRow[]>(
        'SELECT id,professional_id,start_at,end_at FROM professional_closures WHERE business_id=? AND professional_id=? ORDER BY start_at,id',
        [business, id],
      );
      return rows.map(row => ({ id: row.id, professionalId: row.professional_id, startAt: row.start_at.toISOString(), endAt: row.end_at.toISOString() }));
    });
  }

  createClosure(actor: string, business: string, professionalId: string, startAt: string, endAt: string, token?: string): Promise<Closure> {
    return this.manage(actor, business, async c => {
      await this.lockStaff(c, business, professionalId);
      const start = new Date(startAt), end = new Date(endAt);
      const affected = (await this.future(c, business, { staff: professionalId })).filter(row => row.start_at < end && row.end_at > start);
      this.confirm(actor, business, ['closure', professionalId, startAt, endAt], affected, token);
      const id = randomUUID();
      await c.execute('INSERT INTO professional_closures (id,business_id,professional_id,start_at,end_at) VALUES (?,?,?,?,?)',
        [id, business, professionalId, start, end]);
      return { id, professionalId, startAt, endAt };
    });
  }

  deleteClosure(actor: string, business: string, id: string, closure: string) {
    return this.manage(actor, business, async c => {
      await this.lockStaff(c, business, id);
      const [{ affectedRows }] = await c.execute<ResultSetHeader>(
        'DELETE FROM professional_closures WHERE id=? AND business_id=? AND professional_id=?', [closure, business, id],
      );
      if (!affectedRows) throw new ManagementError('not_found');
    });
  }
}

import { CatalogError, validateWorkPeriods, type CatalogItem, type WorkPeriod } from '../catalog/service.js';

export interface BusinessProfile {
  id: string;
  name: string;
  timezone: string;
  sector: string | null;
  address: string | null;
  isPublic: boolean;
}

export interface ManagedService extends CatalogItem {
  description: string | null;
  active: boolean;
}

export interface ManagedStaff {
  id: string;
  displayName: string;
  active: boolean;
  linked: boolean;
  serviceIds: string[];
}

export interface Closure {
  id: string;
  professionalId: string;
  startAt: string;
  endAt: string;
}

export type ProfileData = Omit<BusinessProfile, 'id' | 'isPublic'>;
export type ServiceData = Omit<ManagedService, 'id' | 'businessId' | 'active'>;
export type ServicePatch = Partial<Omit<ManagedService, 'id' | 'businessId'>>;
export type StaffPatch = Partial<Pick<ManagedStaff, 'displayName' | 'active'>>;

export interface ManagementStore {
  createBusiness(actor: string, profile: ProfileData): Promise<BusinessProfile>;
  get(actor: string, business: string): Promise<{ business: BusinessProfile; services: ManagedService[]; staff: ManagedStaff[] }>;
  patchProfile(actor: string, business: string, patch: Partial<ProfileData>): Promise<void>;
  setVisibility(actor: string, business: string, published: boolean): Promise<void>;
  createService(actor: string, business: string, service: ServiceData): Promise<ManagedService>;
  patchService(actor: string, business: string, service: string, patch: ServicePatch, token?: string): Promise<void>;
  createStaff(actor: string, business: string, displayName: string): Promise<ManagedStaff>;
  patchStaff(actor: string, business: string, staff: string, patch: StaffPatch, token?: string): Promise<void>;
  setAssignments(actor: string, business: string, staff: string, services: string[], token?: string): Promise<void>;
  getHours(actor: string, business: string, staff: string): Promise<WorkPeriod[]>;
  setHours(actor: string, business: string, staff: string, hours: WorkPeriod[], token?: string): Promise<void>;
  getClosures(actor: string, business: string, staff: string): Promise<Closure[]>;
  createClosure(actor: string, business: string, staff: string, startAt: string, endAt: string, token?: string): Promise<Closure>;
  deleteClosure(actor: string, business: string, staff: string, closure: string): Promise<void>;
}

type Code = 'invalid_input' | 'forbidden' | 'not_found' | 'publication_incomplete' | 'timezone_has_bookings' | 'impact_confirmation_required';
export class ManagementError extends Error {
  constructor(public readonly code: Code, public readonly impact?: { affectedCount: number; impactToken: string }) {
    super(code);
  }
}

function invalid(): never { throw new ManagementError('invalid_input'); }

function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return invalid();
  return value.toLowerCase();
}

function input(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}

function text(value: unknown, max: number, allowEmpty = false): string {
  if (typeof value !== 'string') return invalid();
  const trimmed = value.trim();
  if ((!allowEmpty && !trimmed) || [...trimmed].length > max) return invalid();
  return trimmed;
}

function optionalText(value: unknown, max: number): string | null {
  return value == null ? null : text(value, max, true) || null;
}

function zone(value: unknown): string {
  if (typeof value !== 'string' || value.length > 64 || !/^[A-Za-z0-9_+/-]+$/.test(value)) return invalid();
  try { new Intl.DateTimeFormat('en', { timeZone: value }); } catch { return invalid(); }
  return value;
}

function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') return invalid();
  return value;
}

function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) return invalid();
  return value;
}

function currency(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z]{3}$/i.test(value)) return invalid();
  return value.toUpperCase();
}

function utc(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return invalid();
  const instant = Date.parse(value);
  if (!Number.isFinite(instant) || new Date(instant).toISOString() !== value || Number(value.slice(0, 4)) < 1000) return invalid();
  return value;
}

export class ManagementService {
  constructor(private readonly store: ManagementStore) {}

  createBusiness(actor: string, body: unknown) {
    const { name, timezone, sector, address } = input(body);
    return this.store.createBusiness(actor, { name: text(name, 160), timezone: zone(timezone), sector: optionalText(sector, 80), address: optionalText(address, 250) });
  }

  get(actor: string, business: unknown) {
    return this.store.get(actor, identifier(business));
  }

  patchProfile(actor: string, business: unknown, body: unknown) {
    const data = input(body);
    const patch: Partial<ProfileData> = {};
    if ('name' in data) patch.name = text(data.name, 160);
    if ('sector' in data) patch.sector = optionalText(data.sector, 80);
    if ('address' in data) patch.address = optionalText(data.address, 250);
    if ('timezone' in data) patch.timezone = zone(data.timezone);
    if (Object.keys(patch).length === 0) return invalid();
    return this.store.patchProfile(actor, identifier(business), patch);
  }

  setVisibility(actor: string, business: unknown, body: unknown) {
    return this.store.setVisibility(actor, identifier(business), bool(input(body).isPublic));
  }

  createService(actor: string, business: unknown, body: unknown) {
    const data = input(body);
    return this.store.createService(actor, identifier(business), {
      name: text(data.name, 160),
      description: optionalText(data.description, 500),
      durationMinutes: integer(data.durationMinutes, 1, 65535),
      priceCents: integer(data.priceCents, 0, 4294967295),
      currency: currency(data.currency),
    });
  }

  patchService(actor: string, business: unknown, service: unknown, body: unknown, token?: string) {
    const data = input(body);
    const patch: ServicePatch = {};
    if ('name' in data) patch.name = text(data.name, 160);
    if ('description' in data) patch.description = optionalText(data.description, 500);
    if ('durationMinutes' in data) patch.durationMinutes = integer(data.durationMinutes, 1, 65535);
    if ('priceCents' in data) patch.priceCents = integer(data.priceCents, 0, 4294967295);
    if ('currency' in data) patch.currency = currency(data.currency);
    if ('active' in data) patch.active = bool(data.active);
    if (Object.keys(patch).length === 0) return invalid();
    return this.store.patchService(actor, identifier(business), identifier(service), patch, token);
  }

  createStaff(actor: string, business: unknown, body: unknown) {
    return this.store.createStaff(actor, identifier(business), text(input(body).displayName, 120));
  }

  patchStaff(actor: string, business: unknown, staff: unknown, body: unknown, token?: string) {
    const data = input(body);
    const patch: StaffPatch = {};
    if ('displayName' in data) patch.displayName = text(data.displayName, 120);
    if ('active' in data) patch.active = bool(data.active);
    if (Object.keys(patch).length === 0) return invalid();
    return this.store.patchStaff(actor, identifier(business), identifier(staff), patch, token);
  }

  setAssignments(actor: string, business: unknown, staff: unknown, body: unknown, token?: string) {
    const ids = input(body).serviceIds;
    if (!Array.isArray(ids) || ids.length > 200) return invalid();
    return this.store.setAssignments(actor, identifier(business), identifier(staff), [...new Set(ids.map(identifier))].sort(), token);
  }

  async getHours(actor: string, business: unknown, staff: unknown) {
    return { hours: await this.store.getHours(actor, identifier(business), identifier(staff)) };
  }

  setHours(actor: string, business: unknown, staff: unknown, body: unknown, token?: string) {
    try {
      return this.store.setHours(actor, identifier(business), identifier(staff), validateWorkPeriods(input(body).hours), token);
    } catch (error) {
      if (error instanceof CatalogError) return invalid();
      throw error;
    }
  }

  async getClosures(actor: string, business: unknown, staff: unknown) {
    return { closures: await this.store.getClosures(actor, identifier(business), identifier(staff)) };
  }

  createClosure(actor: string, business: unknown, staff: unknown, body: unknown, token?: string) {
    const data = input(body);
    const start = utc(data.startAt);
    const end = utc(data.endAt);
    if (end <= start) return invalid();
    return this.store.createClosure(actor, identifier(business), identifier(staff), start, end, token);
  }

  deleteClosure(actor: string, business: unknown, staff: unknown, closure: unknown) {
    return this.store.deleteClosure(actor, identifier(business), identifier(staff), identifier(closure));
  }
}

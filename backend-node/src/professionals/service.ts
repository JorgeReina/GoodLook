export interface Professional { id: string; businessId: string; displayName: string }
export interface ProfessionalsStore {
  listActive(businessId: string): Promise<Professional[]>;
  create(actorId: string, businessId: string, displayName: string): Promise<Professional | null>;
}
export class ProfessionalError extends Error {
  constructor(public readonly code: 'invalid_input' | 'forbidden') { super(code); }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function id(value: unknown): string {
  if (typeof value !== 'string' || !uuid.test(value)) throw new ProfessionalError('invalid_input');
  return value.toLowerCase();
}
export class ProfessionalService {
  constructor(private readonly store: ProfessionalsStore) {}
  async listActive(businessId: unknown): Promise<Professional[]> { return this.store.listActive(id(businessId)); }
  async create(actorId: unknown, businessId: unknown, displayName: unknown): Promise<Professional> {
    const actor = id(actorId);
    const business = id(businessId);
    if (typeof displayName !== 'string') throw new ProfessionalError('invalid_input');
    const name = displayName.trim();
    if (!name || Array.from(name).length > 120) throw new ProfessionalError('invalid_input');
    const professional = await this.store.create(actor, business, name);
    if (!professional) throw new ProfessionalError('forbidden');
    return professional;
  }
}

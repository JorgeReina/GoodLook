import type { SqlConnection } from './service.js';

type Connection = Pick<SqlConnection,'query'>;

export async function lockBusiness(c: Connection, businessId: string) {
  await c.query('SELECT id FROM businesses WHERE id=? FOR UPDATE',[businessId]);
}
export async function lockProfessionalUsers(c: Connection, userIds: readonly string[]) {
  for (const id of [...new Set(userIds)].sort()) {
    await c.query('SELECT id FROM users WHERE id=? FOR UPDATE',[id]);
  }
}
export async function lockProfessionalProfiles(c: Connection, businessId: string, professionalIds: readonly string[]) {
  const profiles = new Map<string, { user_id: string | null; active: number | boolean }>();
  for (const id of [...new Set(professionalIds)].sort()) {
    const [rows] = await c.query('SELECT p.user_id, p.active FROM professionals p WHERE p.business_id = ? AND p.id = ? FOR UPDATE',[businessId,id]);
    if (Array.isArray(rows) && rows.length) profiles.set(id,rows[0]);
  }
  return profiles;
}

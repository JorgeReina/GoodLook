import { randomUUID } from 'node:crypto';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { Professional, ProfessionalsStore } from './service.js';

interface ProfessionalRow extends RowDataPacket { id: string; businessId: string; displayName: string }
interface MembershipRow extends RowDataPacket { role: string }

export class MysqlProfessionalsStore implements ProfessionalsStore {
  constructor(private readonly pool: Pool) {}
  async listActive(businessId: string): Promise<Professional[]> {
    const [rows] = await this.pool.execute<ProfessionalRow[]>(
      'SELECT id, business_id AS businessId, display_name AS displayName FROM professionals WHERE business_id = ? AND active = 1 ORDER BY display_name, id',
      [businessId],
    );
    return rows.map(({ id, businessId: company, displayName }) => ({ id, businessId: company, displayName }));
  }
  async create(actorId: string, businessId: string, displayName: string): Promise<Professional | null> {
    const connection = await this.pool.getConnection();
    let active = false;
    try {
      await connection.beginTransaction();
      active = true;
      const [rows] = await connection.execute<MembershipRow[]>(
        "SELECT role FROM memberships WHERE business_id = ? AND user_id = ? AND status = 'active' FOR UPDATE",
        [businessId, actorId],
      );
      if (!rows.length || !['owner', 'admin'].includes(rows[0].role)) {
        await connection.rollback();
        active = false;
        return null;
      }
      const professional = { id: randomUUID(), businessId, displayName };
      await connection.execute('INSERT INTO professionals (id,business_id,display_name) VALUES (?, ?, ?)', [professional.id, businessId, displayName]);
      await connection.commit();
      active = false;
      return professional;
    } catch (error) {
      if (active) await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

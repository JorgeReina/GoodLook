import type { Pool, RowDataPacket } from 'mysql2/promise';
import type { Membership } from './contracts.js';

export interface MembershipStore {
  listMemberships(actorId: string): Promise<Membership[]>;
}

interface MembershipRow extends RowDataPacket, Membership {}

const activeMemberships = `
  SELECT m.business_id AS businessId, b.name AS businessName, b.timezone,
         m.role, p.id AS professionalId
  FROM memberships m
  JOIN businesses b ON b.id = m.business_id
  LEFT JOIN professionals p
    ON p.business_id = m.business_id AND p.user_id = m.user_id AND p.active = 1
  WHERE m.user_id = ? AND m.status = 'active'
`;

function toMembership({ businessId, businessName, timezone, role, professionalId }: MembershipRow): Membership {
  return { businessId, businessName, timezone, role, professionalId };
}

export class MysqlMembershipStore implements MembershipStore {
  constructor(private readonly pool: Pick<Pool, 'execute'>) {}

  async listMemberships(actorId: string): Promise<Membership[]> {
    const [rows] = await this.pool.execute<MembershipRow[]>(
      `${activeMemberships} ORDER BY b.name, m.business_id`, [actorId],
    );
    return rows.map(toMembership);
  }
}

export async function getActiveMembership(
  connection: Pick<Pool, 'execute'>,
  actorId: string,
  businessId: string,
): Promise<Membership | null> {
  const [rows] = await connection.execute<MembershipRow[]>(
    `${activeMemberships} AND m.business_id = ?`, [actorId, businessId],
  );
  return rows[0] ? toMembership(rows[0]) : null;
}

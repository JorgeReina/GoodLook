import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { InvitationStore, Issue, Accept } from './service.js';
interface Member extends RowDataPacket { role:string; status:string }
interface Invite extends RowDataPacket { business_id:string; professional_id:string }
interface Professional extends RowDataPacket { user_id:string|null; active:number }
export class MysqlInvitationStore implements InvitationStore {
 constructor(private readonly pool:Pool) {}
 private async tx(action:(c:PoolConnection)=>Promise<boolean>):Promise<boolean> {
  const c=await this.pool.getConnection(); let begun=false;
  try { await c.beginTransaction(); begun=true; const ok=await action(c); if(ok) await c.commit(); else await c.rollback(); begun=false; return ok; }
  catch(error) { if(begun) { try { await c.rollback(); } catch {} } throw error; } finally { c.release(); }
 }
 async issue(v:Issue):Promise<boolean> { return this.tx(async c => {
  const [members]=await c.execute<Member[]>("SELECT role,status FROM memberships WHERE business_id=? AND user_id=? FOR UPDATE",[v.businessId,v.actorId]);
  if (!members[0] || members[0].status!=='active' || !['owner','admin'].includes(members[0].role)) return false;
  const [professionals]=await c.execute<Professional[]>("SELECT user_id,active FROM professionals WHERE business_id=? AND id=? FOR UPDATE",[v.businessId,v.professionalId]);
  if (!professionals[0] || !professionals[0].active || professionals[0].user_id!==null) return false;
  await c.execute('INSERT INTO professional_invitations (token_hash,business_id,professional_id,created_by,expires_at,created_at) VALUES (?,?,?,?,DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 7 DAY),UTC_TIMESTAMP(3))',[v.tokenHash,v.businessId,v.professionalId,v.actorId]);
  return true;
 }); }
 async accept(v:Accept):Promise<boolean> { return this.tx(async c => {
  // Lock the user before checking every profile: serializes acceptance for this account across all businesses.
  const [users]=await c.execute<RowDataPacket[]>('SELECT id FROM users WHERE id=? FOR UPDATE',[v.actorId]);
  if(!users.length) return false;
  const [invitations]=await c.execute<Invite[]>("SELECT business_id,professional_id FROM professional_invitations WHERE token_hash=? AND used_at IS NULL AND expires_at>UTC_TIMESTAMP(3) FOR UPDATE",[v.tokenHash]);
  const invite=invitations[0]; if (!invite) return false;
  const [assigned]=await c.execute<RowDataPacket[]>('SELECT id FROM professionals WHERE user_id=? FOR UPDATE',[v.actorId]);
  if(assigned.length) return false;
  const [professionals]=await c.execute<Professional[]>('SELECT user_id,active FROM professionals WHERE business_id=? AND id=? FOR UPDATE',[invite.business_id,invite.professional_id]);
  if(!professionals[0] || !professionals[0].active || professionals[0].user_id!==null) return false;
  const [members]=await c.execute<Member[]>('SELECT role,status FROM memberships WHERE business_id=? AND user_id=? FOR UPDATE',[invite.business_id,v.actorId]);
  if(members[0] && members[0].status!=='active') return false;
  if(!members.length) await c.execute("INSERT INTO memberships (business_id,user_id,role,status,created_at) VALUES (?,?,'professional','active',UTC_TIMESTAMP(3))",[invite.business_id,v.actorId]);
  await c.execute('UPDATE professionals SET user_id=? WHERE business_id=? AND id=?',[v.actorId,invite.business_id,invite.professional_id]);
  await c.execute('UPDATE professional_invitations SET used_at=UTC_TIMESTAMP(3) WHERE token_hash=?',[v.tokenHash]);
  return true;
 }); }
}

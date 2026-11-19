import { createHash, randomBytes } from 'node:crypto';

export type InvitationScope = {actorId:string; businessId:string; professionalId:string};
export type Issue = InvitationScope & {tokenHash:string};
export type Accept = {actorId:string; tokenHash:string};
export interface InvitationStore {
 issue(input:Issue):Promise<boolean>;
 accept(input:Accept):Promise<boolean>;
 revoke(input:InvitationScope):Promise<boolean>;
}
export class InvitationError extends Error { constructor(public readonly code:'invalid_input'|'unavailable') { super(code); } }
const id = (value:unknown):value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const hash = (token:string) => createHash('sha256').update(token).digest('hex');
function scope(actorId:unknown,businessId:unknown,professionalId:unknown):InvitationScope {
 if (!id(actorId)||!id(businessId)||!id(professionalId)) throw new InvitationError('invalid_input');
 return {actorId:actorId.toLowerCase(),businessId:businessId.toLowerCase(),professionalId:professionalId.toLowerCase()};
}
export class InvitationService {
 constructor(private readonly store:InvitationStore, private readonly makeToken = () => randomBytes(32).toString('hex')) {}
 async issue(actorId:unknown,businessId:unknown,professionalId:unknown) {
  const input=scope(actorId,businessId,professionalId);
  const token=this.makeToken();
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid token generator');
  if (!await this.store.issue({...input,tokenHash:hash(token)})) throw new InvitationError('unavailable');
  return {token,expiresInSeconds:604800};
 }
 async accept(actorId:unknown,token:unknown):Promise<void> {
  if (!id(actorId)||typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token)) throw new InvitationError('invalid_input');
  if (!await this.store.accept({actorId:actorId.toLowerCase(),tokenHash:hash(token)})) throw new InvitationError('unavailable');
 }
 async revoke(actorId:unknown,businessId:unknown,professionalId:unknown):Promise<void> {
  if (!await this.store.revoke(scope(actorId,businessId,professionalId))) throw new InvitationError('unavailable');
 }
}

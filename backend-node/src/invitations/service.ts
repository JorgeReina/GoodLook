import { createHash, randomBytes } from 'node:crypto';

export type Issue = {actorId:string; businessId:string; professionalId:string; tokenHash:string};
export type Accept = {actorId:string; tokenHash:string};
export interface InvitationStore { issue(input:Issue):Promise<boolean>; accept(input:Accept):Promise<boolean>; }
export class InvitationError extends Error { constructor(public readonly code:'invalid_input'|'unavailable') { super(code); } }
const id = (value:unknown):value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const hash = (token:string) => createHash('sha256').update(token).digest('hex');
export class InvitationService {
 constructor(private readonly store:InvitationStore, private readonly makeToken = () => randomBytes(32).toString('hex')) {}
 async issue(actorId:unknown,businessId:unknown,professionalId:unknown) {
  if (!id(actorId)||!id(businessId)||!id(professionalId)) throw new InvitationError('invalid_input');
  const token=this.makeToken();
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid token generator');
  if (!await this.store.issue({actorId,businessId,professionalId,tokenHash:hash(token)})) throw new InvitationError('unavailable');
  return {token,expiresInSeconds:604800};
 }
 async accept(actorId:unknown,token:unknown):Promise<void> {
  if (!id(actorId)||typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token)) throw new InvitationError('invalid_input');
  if (!await this.store.accept({actorId,tokenHash:hash(token)})) throw new InvitationError('unavailable');
 }
}

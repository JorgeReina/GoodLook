import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InvitationService, InvitationError, type InvitationStore } from '../src/invitations/service.js';
const a='00000000-0000-4000-8000-000000000001';
const b='00000000-0000-4000-8000-000000000002';
const c='00000000-0000-4000-8000-000000000003';
const token='a'.repeat(64);
const valid: InvitationStore = {
  async issue(input) { assert.equal(input.actorId,a); assert.equal(input.businessId,b); assert.equal(input.professionalId,c); assert.notEqual(input.tokenHash,token); return true; },
  async accept(input) { assert.equal(input.actorId,a); assert.notEqual(input.tokenHash,token); return true; },
};
test('admin creates invitation; only hashed token is persisted', async () => {
 const service = new InvitationService(valid, () => token);
 assert.deepEqual(await service.issue(a,b,c), {token,expiresInSeconds:604800});
});
test('authorized user accepts token without choosing a different user id', async () => {
 const service = new InvitationService(valid, () => token);
 assert.equal(await service.accept(a,token), undefined);
});
test('invalid identifiers, tokens and unauthorized operations fail closed', async () => {
 const service = new InvitationService({...valid, issue: async()=>false, accept:async()=>false}, () => token);
 await assert.rejects(service.issue('no',b,c), InvitationError);
 await assert.rejects(service.issue(a,b,c), /unavailable/);
 await assert.rejects(service.accept(a,'short'), /invalid_input/);
 await assert.rejects(service.accept(a,token), /unavailable/);
});

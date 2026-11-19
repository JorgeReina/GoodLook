import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Pool} from 'mysql2/promise';
import {MysqlInvitationStore} from '../src/invitations/mysql-store.js';
const actor='00000000-0000-4000-8000-000000000001', business='00000000-0000-4000-8000-000000000002', professional='00000000-0000-4000-8000-000000000003', tokenHash='a'.repeat(64);
function fake(results:unknown[], failAt=-1) { const log:string[]=[]; let n=0; const c={beginTransaction:async()=>{log.push('begin');},commit:async()=>{log.push('commit');},rollback:async()=>{log.push('rollback');},release:()=>{log.push('release');},query:async(sql:string)=>{log.push(sql);return [sql.includes('FROM professionals')?[{user_id:null,active:1}]:[],[]];},execute:async(sql:string)=>{log.push(sql);if(n++===failAt)throw Error('db failed');return [results.shift()??[],[]];}};return {log,pool:{getConnection:async()=>c} as unknown as Pool}; }
test('only active owner/admin may issue and plaintext is never sent to DB',async()=>{let x=fake([[{role:'professional',status:'active'}]]);let s=new MysqlInvitationStore(x.pool);assert.equal(await s.issue({actorId:actor,businessId:business,professionalId:professional,tokenHash}),false);assert.deepEqual(x.log.slice(-2),['rollback','release']);x=fake([[{role:'admin',status:'active'}],[{user_id:null,active:1}],[]]);s=new MysqlInvitationStore(x.pool);assert.equal(await s.issue({actorId:actor,businessId:business,professionalId:professional,tokenHash}),true);assert.ok(x.log.some(v=>v.includes('UTC_TIMESTAMP')));assert.deepEqual(x.log.slice(-2),['commit','release']);});
const invite={business_id:business,professional_id:professional};
test('consuming invitation locks business, account and profile in order before revalidating invitation',async()=>{
  const x=fake([[invite],[invite],[],[]]);
  assert.equal(await new MysqlInvitationStore(x.pool).accept({actorId:actor,tokenHash}),true);
  const lockOrder=['FROM businesses','FROM users','FROM professionals p','used_at IS NULL'].map(sql=>x.log.findIndex(v=>v.includes(sql)&&v.includes('FOR UPDATE')));
  assert.ok(lockOrder.every((index, position)=>index>=0&&(position===0||index>lockOrder[position-1])));
  assert.ok(x.log.some(v=>v.includes('UPDATE professional_invitations')));
  assert.deepEqual(x.log.slice(-2),['commit','release']);
});
test('expired/reused token, preexisting assignment or inactive member roll back',async()=>{for(const results of [[[invite],[]],[[invite],[invite],[{id:'assigned'}]],[[invite],[invite],[],[{role:'professional',status:'inactive'}]]]){const x=fake(results);assert.equal(await new MysqlInvitationStore(x.pool).accept({actorId:actor,tokenHash}),false);assert.deepEqual(x.log.slice(-2),['rollback','release']);}});
test('failed update rolls back and releases connection',async()=>{const x=fake([[invite],[invite],[],[]],5);await assert.rejects(new MysqlInvitationStore(x.pool).accept({actorId:actor,tokenHash}),/db failed/);assert.deepEqual(x.log.slice(-2),['rollback','release']);});
test('renewing revokes outstanding tokens before storing the new token hash', async () => {
 const x = fake([[{ role: 'admin', status: 'active' }], [{ user_id: null, active: 1 }], [], []]);
 assert.equal(await new MysqlInvitationStore(x.pool).issue({ actorId: actor, businessId: business, professionalId: professional, tokenHash }), true);
 const revoke = x.log.findIndex(sql => sql.includes('SET revoked_at'));
 const insert = x.log.findIndex(sql => sql.includes('INSERT INTO professional_invitations'));
 assert.ok(revoke >= 0 && revoke < insert);
});
test('acceptance filters revoked tokens and checks prior assignments within the same business', async () => {
 const x = fake([[invite], [invite], [], [{ role: 'admin', status: 'active' }]]);
 assert.equal(await new MysqlInvitationStore(x.pool).accept({ actorId: actor, tokenHash }), true);
 assert.ok(x.log.some(sql => sql.includes('revoked_at IS NULL') && sql.includes('FOR UPDATE')));
 assert.ok(x.log.some(sql => sql.includes('FROM professionals WHERE business_id=? AND user_id=? FOR UPDATE')));
 assert.ok(!x.log.some(sql => sql.includes('INSERT INTO memberships')));
});
test('only a manager within the business may revoke invitations', async () => {
 const x = fake([[{ role: 'owner', status: 'active' }], [{ user_id: null, active: 1 }], []]);
 const input = { actorId: actor, businessId: business, professionalId: professional };
 assert.equal(await new MysqlInvitationStore(x.pool).revoke(input), true);
 assert.ok(x.log.some(sql => sql.includes('SET revoked_at')));
 const y = fake([[{ role: 'professional', status: 'active' }]]);
 assert.equal(await new MysqlInvitationStore(y.pool).revoke(input), false);
 assert.ok(!y.log.some(sql => sql.includes('SET revoked_at')));
});

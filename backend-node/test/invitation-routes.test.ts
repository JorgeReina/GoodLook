import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { invitationRoutes, invitationRevocationRoute } from '../src/invitations/routes.js';
import { InvitationService } from '../src/invitations/service.js';
const actor='00000000-0000-4000-8000-000000000001', business='00000000-0000-4000-8000-000000000002', professional='00000000-0000-4000-8000-000000000003';
const origin='https://example.test', cookie='goodlook_session='+ 'a'.repeat(64);
test('invitations require session and same origin and obtain actor from session', async () => {
 const actions:string[]=[]; const service=new InvitationService({issue:async v=>{ actions.push(v.actorId); return true;},accept:async v=>{actions.push(v.actorId);return true;},revoke:async v=>{actions.push(v.actorId);return true;}},()=> 'b'.repeat(64));
 const auth={createUser:async()=>false,findUserByEmail:async()=>null,createSession:async()=>{},findUserBySession:async()=>({id:actor,email:'test@example.test',displayName:'A',passwordHash:'x'}),deleteSession:async()=>{}};
 const app=express(); app.use(express.json()); app.use('/invites',invitationRoutes(auth,origin,service));
 app.delete('/manage/:id/staff/:professionalId/invitation',invitationRevocationRoute(auth,origin,service));
 const server=app.listen(0,'127.0.0.1'); await new Promise<void>(r=>server.once('listening',r));
 const addr=server.address(); if(!addr||typeof addr==='string') throw Error(); const base=`http://127.0.0.1:${addr.port}`;
 try {
  let r=await fetch(base+'/invites',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({businessId:business,professionalId:professional})}); assert.equal(r.status,401);
  r=await fetch(base+'/invites',{method:'POST',headers:{'content-type':'application/json',origin:'https://other.test',cookie},body:'{}'}); assert.equal(r.status,403);
  r=await fetch(base+'/invites',{method:'POST',headers:{'content-type':'application/json',origin,cookie},body:JSON.stringify({businessId:business,professionalId:professional,actorId:business})}); assert.equal(r.status,201); assert.equal(r.headers.get('cache-control'),'no-store');
  r=await fetch(base+'/invites/accept',{method:'POST',headers:{'content-type':'application/json',origin,cookie},body:JSON.stringify({token:'b'.repeat(64),actorId:business})}); assert.equal(r.status,204);
  const revokePath=base+'/manage/'+business+'/staff/'+professional+'/invitation';
  r=await fetch(revokePath,{method:'DELETE',headers:{origin}}); assert.equal(r.status,401);
  r=await fetch(revokePath,{method:'DELETE',headers:{origin:'https://other.test',cookie}}); assert.equal(r.status,403);
  r=await fetch(revokePath,{method:'DELETE',headers:{origin,cookie}}); assert.equal(r.status,204); assert.equal(r.headers.get('cache-control'),'no-store');
  assert.deepEqual(actions,[actor,actor,actor]);
 } finally {await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});

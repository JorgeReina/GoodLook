import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import type {AddressInfo} from 'node:net';
import {createApp} from '../src/app.js';
import type {AuthStore,User} from '../src/auth/store.js';
import {ProfessionalService} from '../src/professionals/service.js';
const user: User={id:'4c95e891-d8b5-40cb-93c9-b1429db9a71d',email:'a@example.test',displayName:'A',passwordHash:'unused'};
const business='231c2e85-cba6-44e3-a803-fac58a3f7ff4';
let actor=''; let allow=false;
const store: AuthStore={async createUser(){return false},async findUserByEmail(){return null},async createSession(){},async findUserBySession(hash){return hash==='ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb'?user:null},async deleteSession(){}};
const professionals=new ProfessionalService({async listActive(businessId){return [{id:user.id,businessId,displayName:'Example'}]},async create(actorId,businessId,displayName){actor=actorId;return allow?{id:user.id,businessId,displayName}:null}});
const origin='https://app.example.test';const cookie=`goodlook_session=${'a'.repeat(64)}`;
const server=createApp({store,allowedOrigin:origin,professionals}).listen(0,'127.0.0.1');let base='';
before(async()=>{await new Promise<void>((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject)});base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`});
after(()=>new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve())));
const post=(session?:string,requestOrigin?:string)=>fetch(`${base}/api/professionals`,{method:'POST',headers:{'content-type':'application/json',...(session?{cookie:session}:{}),...(requestOrigin?{origin:requestOrigin}:{})},body:JSON.stringify({businessId:business,displayName:'Example',actorId:'attacker'})});
test('public list validates businessId and exposes only safe profile',async()=>{
 let r=await fetch(`${base}/api/professionals?businessId=bad`);assert.equal(r.status,400);
 r=await fetch(`${base}/api/professionals?businessId=${business}`);assert.equal(r.status,200);assert.deepEqual(await r.json(),[{id:user.id,businessId:business,displayName:'Example'}]);assert.equal(r.headers.get('cache-control'),'no-store');
});
test('creation requires session, correct origin and an authorized role',async()=>{
 assert.equal((await post(undefined,origin)).status,401);assert.equal((await post(cookie,'https://evil.test')).status,403);assert.equal((await post(cookie)).status,403);
 assert.equal((await post(cookie,origin)).status,403);assert.equal(actor,user.id);
 allow=true;const response=await post(cookie,origin);assert.equal(response.status,201);assert.equal(actor,user.id);assert.equal((await response.json()).displayName,'Example');
});

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { AppointmentError } from '../src/appointments/service.js';
import type { AuthStore, User } from '../src/auth/store.js';

const user: User = { id:'4c95e891-d8b5-40cb-93c9-b1429db9a71d', email:'a@example.com',displayName:'A',passwordHash:'unused' };
let recorded: Record<string,unknown> | undefined;
const store: AuthStore = {
  async createUser() {return false;}, async findUserByEmail(){return null;}, async createSession(){},
  async findUserBySession(hash) {return hash === 'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb' ? user : null;}, async deleteSession() {},
};
let rateMode: 'allow'|'deny'|'error' = 'allow';
let seenIp='';
const availabilityLimiter={async check(ip:string){seenIp=ip;if(rateMode==='error') throw new Error('db');return {allowed:rateMode==='allow',retryAfter:23};}};
const appointments = {
  async availability(input:any) { recorded = input; return {timezone:"Europe/Madrid",slots:[]}; },
  async create(input: any) { recorded = input; return {id:'booking-id'}; },
  async mine(input: any) { recorded = input; return []; },
  async agenda(input: any) { recorded = input; if (input.professionalId === 'forbidden') throw new AppointmentError('forbidden','Forbidden'); return []; },
};
const origin='https://app.example.test';
const server = createApp({store, allowedOrigin: origin, appointments, availabilityLimiter}).listen(0,'127.0.0.1');
let base = '';
before(async()=>{ await new Promise<void>((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;});
after(()=>new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve())));
const cookie=`goodlook_session=${'a'.repeat(64)}`;
const path='/api/appointments';
const payload={businessId:'b',professionalId:'p',serviceId:'s',startAt:'2030-01-01T12:00:00.000Z',actorId:'attacker'};
const post=(session?:string,from?:string)=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...(from?{origin:from}:{}),...(session?{cookie:session}:{})},body:JSON.stringify(payload)});

test('booking requires a valid session and correct origin',async()=>{
  assert.equal((await post(undefined,origin)).status,401);
  assert.equal((await post(cookie,'https://evil.example')).status,403);
  assert.equal((await post(cookie)).status,403);
});
test('booking derives actor from session, ignores untrusted actorId',async()=>{
  const response=await post(cookie,origin);
  assert.equal(response.status,201);
  assert.equal(recorded?.actorId,user.id);
});
test('agenda requires session and preserves service authorization',async()=>{
  const url='/api/appointments/agenda?businessId=b&professionalId=forbidden&from=a&to=b';
  assert.equal((await fetch(base+url)).status,401);
  const forbidden = await fetch(base+url,{headers:{cookie}});
  assert.equal(forbidden.status,403);
  assert.equal(forbidden.headers.get('cache-control'),'no-store');
  assert.equal(recorded?.actorId,user.id);
});

test('customer appointments require a session and derive identity from that session', async () => {
  const range='?from=2030-01-01T00%3A00%3A00.000Z&to=2030-02-01T00%3A00%3A00.000Z&actorId=attacker';
  assert.equal((await fetch(base+path+'/me'+range)).status,401);
  const response=await fetch(base+path+'/me'+range,{headers:{cookie}});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(recorded?.actorId,user.id);
  assert.equal(recorded?.from,'2030-01-01T00:00:00.000Z');
});

test('availability is readable without authentication, validates input and forbids caching', async()=>{
  const ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003'];
  const range=new URLSearchParams({businessId:ids[0],professionalId:ids[1],serviceId:ids[2],from:'2030-01-07T09:00:00.000Z',to:'2030-01-07T11:00:00.000Z'});
  const response=await fetch(base+path+'/availability?'+range);
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.deepEqual(await response.json(),{timezone:'Europe/Madrid',slots:[]});
  assert.equal(recorded?.businessId,ids[0]);assert.equal(recorded?.actorId,undefined);
});


test('availability rate limit is shared and uses socket IP, fails closed on storage errors', async()=>{
  rateMode='deny';
  let response=await fetch(base+path+'/availability?foo=bar',{headers:{'x-forwarded-for':'192.0.2.5'}});
  assert.equal(response.status,429);assert.equal(response.headers.get('retry-after'),'23');
  assert.notEqual(seenIp,'192.0.2.5');assert.ok(seenIp);
  rateMode='error';response=await fetch(base+path+'/availability');assert.equal(response.status,503);
  rateMode='allow';
});

test('availability is unavailable if a shared limiter is not configured',async()=>{
 const srv=createApp({store,allowedOrigin:origin,appointments}).listen(0,'127.0.0.1');
 await new Promise<void>((resolve,reject)=>{srv.once('listening',resolve);srv.once('error',reject)});
 try { const response=await fetch(`http://127.0.0.1:${(srv.address() as AddressInfo).port}${path}/availability`);assert.equal(response.status,503); }
 finally {await new Promise<void>((resolve,reject)=>srv.close(e=>e?reject(e):resolve()));}
});

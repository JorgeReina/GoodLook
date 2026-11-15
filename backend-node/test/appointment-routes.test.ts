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
const appointments = {
  async create(input: any) { recorded = input; return {id:'booking-id'}; },
  async agenda(input: any) { recorded = input; if (input.professionalId === 'forbidden') throw new AppointmentError('forbidden','Forbidden'); return []; },
};
const origin='https://app.example.test';
const server = createApp({store, allowedOrigin: origin, appointments}).listen(0,'127.0.0.1');
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

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import type { AuthStore, User } from '../src/auth/store.js';

class TestStore implements AuthStore {
  users: User[] = [];
  sessions = new Map<string, { userId: string; expiresAt: Date }>();
  async createUser(user: User): Promise<boolean> {
    if (this.users.some(u => u.email === user.email)) return false;
    this.users.push(user); return true;
  }
  async findUserByEmail(email: string) { return this.users.find(u => u.email === email) ?? null; }
  async createSession(hash: string, userId: string, expiresAt: Date) { this.sessions.set(hash, { userId, expiresAt }); }
  async findUserBySession(hash: string) {
    const session = this.sessions.get(hash);
    return session && session.expiresAt.getTime() > Date.now() ? this.users.find(u => u.id === session.userId) ?? null : null;
  }
  async deleteSession(hash: string) { this.sessions.delete(hash); }
}
const store = new TestStore();
const origin = 'https://app.example.test';
const server = createApp({ store, allowedOrigin: origin, authLimiter: {check:async()=>({allowed:true,retryAfter:0})} as never }).listen(0, '127.0.0.1');
let base = '';
before(async () => {
  await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())));
const post = (path: string, body: unknown, cookie?: string, requestOrigin = origin) => fetch(base + path, {
  method: 'POST', headers: { 'content-type': 'application/json', origin: requestOrigin, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body),
});

test('registration validates inputs, normalizes email and never exposes password hash', async () => {
  let r = await post('/api/auth/register', { email:'bad', password:'short', displayName:'X' });
  assert.equal(r.status, 400);
  r = await post('/api/auth/register', { email:'User@Example.com', password:'long enough secret', displayName:'Example' });
  assert.equal(r.status, 201);
  const data = await r.json();
  assert.equal(data.email, 'user@example.com');
  assert.equal('passwordHash' in data, false);
  assert.notEqual(store.users[0].passwordHash, 'long enough secret');
  assert.equal((await post('/api/auth/register', { email:'user@example.com', password:'long enough secret', displayName:'Example' })).status, 409);
});

test('login rejects bad credentials; secure session enables me and logout revokes it', async () => {
  let r = await post('/api/auth/login', { email:'user@example.com', password:'wrong password' });
  assert.equal(r.status, 401);
  r = await post('/api/auth/login', { email:'user@example.com', password:'long enough secret' });
  assert.equal(r.status, 200);
  const cookie = r.headers.get('set-cookie')!;
  assert.match(cookie, /HttpOnly/i); assert.match(cookie, /Secure/i); assert.match(cookie, /SameSite=Strict/i);
  const pair = cookie.split(';')[0];
  assert.ok(!store.sessions.has(pair.split('=')[1]));
  r = await fetch(base + '/api/auth/me', { headers: {cookie: pair} });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).email, 'user@example.com');
  assert.equal((await post('/api/auth/logout', {}, pair)).status, 204);
  assert.equal((await fetch(base + '/api/auth/me', {headers:{cookie:pair}})).status, 401);
});

test('mutation requests from other origins are rejected and invalid cookies do not authenticate', async () => {
  assert.equal((await post('/api/auth/login', {email:'user@example.com',password:'long enough secret'}, undefined, 'https://evil.example')).status, 403);
  assert.equal((await fetch(base + '/api/auth/me', {headers:{cookie:'goodlook_session=not-a-token'}})).status, 401);
});

test('missing Origin is denied for mutations', async () => {
  const r = await fetch(base + '/api/auth/login', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({email:'user@example.com',password:'long enough secret'})});
  assert.equal(r.status, 403);
});

test('expired sessions cannot identify a user', async () => {
  const r = await post('/api/auth/login', {email:'user@example.com',password:'long enough secret'});
  const pair = r.headers.get('set-cookie')!.split(';')[0];
  for (const item of store.sessions.values()) item.expiresAt = new Date(0);
  assert.equal((await fetch(base + '/api/auth/me', {headers:{cookie:pair}})).status, 401);
});

test('oversize JSON is rejected without reflecting its contents', async () => {
  const r = await post('/api/auth/register', { email:'user@example.com', password:'secret'.repeat(7000), displayName:'A' });
  assert.equal(r.status, 413);
  assert.deepEqual(await r.json(), {error:'Request too large'});
});

test('unknown accounts and wrong passwords return the same response', async () => {
  const missing = await post('/api/auth/login', {email:'missing@example.com',password:'long enough secret'});
  const wrong = await post('/api/auth/login', {email:'user@example.com',password:'incorrect password'});
  assert.equal(missing.status, 401);
  assert.equal(wrong.status, 401);
  assert.deepEqual(await missing.json(), await wrong.json());
});

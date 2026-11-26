import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createApp } from '../src/app.js';
import { AuthRateLimiter } from '../src/auth/rate-limit.js';
import { AvailabilityRateLimiter } from '../src/appointments/rate-limit.js';
import type { AuthStore } from '../src/auth/store.js';

const origin = 'https://app.example.test';
const secret = 'a'.repeat(64);
const store: AuthStore = {
  async createUser() { return false; },
  async findUserByEmail() { return null; },
  async createSession() {},
  async findUserBySession() { return null; },
  async deleteSession() {},
};

function memoryBuckets(limit: number) {
  const counts = new Map<string, number>();
  return {
    async consume(keys: string | string[]) {
      const key = Array.isArray(keys) ? keys[0] : keys;
      const attempts = (counts.get(key) ?? 0) + 1;
      counts.set(key, attempts);
      const allowed = attempts <= limit;
      return { allowed, retryAfter: allowed ? 0 : 15 };
    },
  };
}

function listen(app: ReturnType<typeof createApp>): Promise<{ server: Server; base: string }> {
  const server = app.listen(0, '127.0.0.1');
  return new Promise((resolve, reject) => {
    server.once('listening', () => resolve({ server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }));
    server.once('error', reject);
  });
}

const close = (server: Server) => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));

describe('rate-limit client identity', { concurrency: false }, () => {
  const previousVercel = process.env.VERCEL;
  let server: Server;
  let base = '';

  before(async () => {
    const listening = await listen(createApp({
      store,
      allowedOrigin: origin,
      authLimiter: new AuthRateLimiter(memoryBuckets(1), secret),
      availabilityLimiter: new AvailabilityRateLimiter(memoryBuckets(1), secret),
      appointments: { async create() { return {}; }, async agenda() { return []; }, async availability() { return { timezone: 'Europe/Madrid', slots: [] }; } },
    }));
    server = listening.server;
    base = listening.base;
  });

  after(async () => {
    if (previousVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previousVercel;
    if (server) await close(server);
  });

  async function withFreshLimits(): Promise<void> {
    if (server) await close(server);
    const listening = await listen(createApp({
      store,
      allowedOrigin: origin,
      authLimiter: new AuthRateLimiter(memoryBuckets(1), secret),
      availabilityLimiter: new AvailabilityRateLimiter(memoryBuckets(1), secret),
      appointments: { async create() { return {}; }, async agenda() { return []; }, async availability() { return { timezone: 'Europe/Madrid', slots: [] }; } },
    }));
    server = listening.server;
    base = listening.base;
  }

  const login = (headers: Record<string, string>, email = 'a@example.test') => fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ email, password: 'some-long-password' }),
  });

  const availability = (headers: Record<string, string>) => fetch(`${base}/api/appointments/availability?businessId=1`, { headers });

  test('trust proxy stays off so Express does not parse X-Forwarded-For', () => {
    assert.equal(createApp({ store, allowedOrigin: origin }).get('trust proxy'), false);
  });

  test('behind Vercel one abuser does not exhaust another client on the same socket', async () => {
    await withFreshLimits();
    process.env.VERCEL = '1';
    const abuser = { 'x-vercel-forwarded-for': '203.0.113.10', 'x-forwarded-for': '198.51.100.50', 'x-real-ip': '198.51.100.50' };
    const neighbor = { 'x-vercel-forwarded-for': '203.0.113.20', 'x-forwarded-for': '203.0.113.10' };
    const first = await login(abuser, 'abuser@example.test');
    assert.equal(first.status, 401);
    const blocked = await login(abuser, 'other-account@example.test');
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get('retry-after'), '15');
    const spoofed = await login({ ...abuser, 'x-forwarded-for': '203.0.113.20', 'x-real-ip': '203.0.113.20' }, 'third@example.test');
    assert.equal(spoofed.status, 429);
    assert.equal(spoofed.headers.get('retry-after'), '15');
    const other = await login(neighbor, 'neighbor@example.test');
    assert.equal(other.status, 401);
    assert.equal(other.headers.get('retry-after'), null);
    const sameClientLongerChain = await login({ 'x-vercel-forwarded-for': '203.0.113.10, 198.51.100.1' }, 'fourth@example.test');
    assert.equal(sameClientLongerChain.status, 429);
    const blockedRegister = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json', 'x-vercel-forwarded-for': '203.0.113.10', 'x-forwarded-for': '198.51.100.9' },
      body: JSON.stringify({ email: 'fresh@example.test', password: 'some-long-password', displayName: 'Cliente' }),
    });
    assert.equal(blockedRegister.status, 429);
    assert.equal(blockedRegister.headers.get('retry-after'), '15');
    const otherRegister = await fetch(`${base}/api/auth/register`, {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json', 'x-vercel-forwarded-for': '203.0.113.21' },
      body: JSON.stringify({ email: 'not-an-email', password: 'short', displayName: '' }),
    });
    assert.equal(otherRegister.status, 400);

    const open = await availability(neighbor);
    assert.equal(open.status, 200);
    const limited = await availability({ 'x-vercel-forwarded-for': '203.0.113.20', 'x-forwarded-for': '203.0.113.10' });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after'), '15');
    const unrelated = await availability({ 'x-vercel-forwarded-for': '203.0.113.30', 'x-forwarded-for': '203.0.113.20' });
    assert.equal(unrelated.status, 200);
  });

  test('a forged platform header cannot choose a bucket and a missing one fails closed', async () => {
    await withFreshLimits();
    process.env.VERCEL = '1';
    const invalid = await login({ 'x-vercel-forwarded-for': '203.0.113.10, not-an-ip', 'x-forwarded-for': '198.51.100.77' });
    assert.equal(invalid.status, 503);
    const missing = await availability({ 'x-forwarded-for': '203.0.113.40', 'x-real-ip': '203.0.113.40' });
    assert.equal(missing.status, 503);
    const stillOpen = await availability({ 'x-vercel-forwarded-for': '203.0.113.40' });
    assert.equal(stillOpen.status, 200);
  });

  test('without Vercel the platform header is ignored and the socket quota is shared', async () => {
    await withFreshLimits();
    delete process.env.VERCEL;
    const first = await login({ 'x-vercel-forwarded-for': '203.0.113.60', 'x-forwarded-for': '203.0.113.61' }, 'local-a@example.test');
    assert.equal(first.status, 401);
    const second = await login({ 'x-vercel-forwarded-for': '203.0.113.62', 'x-forwarded-for': '203.0.113.63' }, 'local-b@example.test');
    assert.equal(second.status, 429);
    assert.equal(second.headers.get('retry-after'), '15');
    const slots = await availability({ 'x-vercel-forwarded-for': '203.0.113.70', 'x-forwarded-for': '192.0.2.5' });
    assert.equal(slots.status, 200);
    const shared = await availability({ 'x-vercel-forwarded-for': '203.0.113.71' });
    assert.equal(shared.status, 429);
    assert.equal(shared.headers.get('retry-after'), '15');
  });
});

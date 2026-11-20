import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import type { Pool } from 'mysql2/promise';
import { createApp } from '../src/app.js';
import type { AuthStore, User } from '../src/auth/store.js';
import { getActiveMembership, MysqlMembershipStore } from '../src/product/membership-store.js';

const staff: User = {
  id: 'staff', email: 'staff@example.test', displayName: 'Staff', passwordHash: 'unused',
};
const customer: User = {
  id: 'customer', email: 'customer@example.test', displayName: 'Customer', passwordHash: 'unused',
};
const staffToken = 'a'.repeat(64);
const customerToken = 'b'.repeat(64);
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const sessions = new Map([[hash(staffToken), staff], [hash(customerToken), customer]]);
const auth: AuthStore = {
  async createUser() { return false; },
  async findUserByEmail() { return null; },
  async createSession() {},
  async findUserBySession(tokenHash) { return sessions.get(tokenHash) ?? null; },
  async deleteSession() {},
};

const expected = [
  { businessId: 'a', businessName: 'Centro', timezone: 'Europe/Madrid', role: 'owner', professionalId: 'staff-a' },
  { businessId: 'b', businessName: 'Norte', timezone: 'Europe/Lisbon', role: 'professional', professionalId: 'staff-b' },
];

const db = new DatabaseSync(':memory:');
db.exec(`
  CREATE TABLE businesses (id TEXT PRIMARY KEY, name TEXT, timezone TEXT);
  CREATE TABLE memberships (
    business_id TEXT, user_id TEXT, role TEXT, status TEXT,
    PRIMARY KEY (business_id, user_id)
  );
  CREATE TABLE professionals (
    id TEXT PRIMARY KEY, business_id TEXT, user_id TEXT, active INTEGER,
    UNIQUE (business_id, user_id)
  );

  INSERT INTO businesses VALUES
    ('a', 'Centro', 'Europe/Madrid'), ('b', 'Norte', 'Europe/Lisbon'),
    ('c', 'Sur', 'Europe/Madrid'), ('d', 'Este', 'Europe/Madrid');
  INSERT INTO memberships VALUES
    ('a', 'staff', 'owner', 'active'), ('b', 'staff', 'professional', 'active'),
    ('c', 'staff', 'admin', 'inactive'), ('d', 'other', 'owner', 'active'),
    ('a', 'other', 'admin', 'active'), ('a', 'inactive-profile', 'admin', 'active');
  INSERT INTO professionals VALUES
    ('staff-a', 'a', 'staff', 1), ('staff-b', 'b', 'staff', 1),
    ('staff-c', 'c', 'staff', 1), ('other-a', 'a', 'other', 1),
    ('inactive-a', 'a', 'inactive-profile', 0);
`);
const connection = {
  async execute(sql: string, values: string[]) {
    return [db.prepare(sql).all(...values), []];
  },
} as unknown as Pick<Pool, 'execute'>;

const options = {
  store: auth,
  allowedOrigin: 'https://app.example.test',
  memberships: new MysqlMembershipStore(connection),
};
const server = createApp(options).listen(0, '127.0.0.1');
let url: string;
before(async () => {
  await once(server, 'listening');
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/me/memberships`;
});
after(() => new Promise<void>((resolve, reject) => {
  db.close();
  server.close(error => error ? reject(error) : resolve());
}));

test('lists memberships and both profiles using the session actor', async () => {
  const response = await fetch(`${url}?actorId=customer&businessId=c`, {
    headers: { cookie: `goodlook_session=${staffToken}` },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), expected);
});

test('returns an empty list for an authenticated customer without memberships', async () => {
  const response = await fetch(`${url}?actorId=staff`, {
    headers: { cookie: `goodlook_session=${customerToken}` },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), []);
});

test('denies anonymous membership requests', async () => {
  const response = await fetch(`${url}?actorId=staff`);
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { code: 'unauthenticated' });
});

test('resolves a single active membership by actor and business', async () => {
  assert.deepEqual(await getActiveMembership(connection, staff.id, 'b'), expected[1]);
  assert.equal(await getActiveMembership(connection, staff.id, 'c'), null);
  assert.equal(await getActiveMembership(connection, staff.id, 'd'), null);
  assert.equal(await getActiveMembership(connection, customer.id, 'a'), null);
});

test('retains an active business role when its professional profile is inactive', async () => {
  assert.deepEqual(await getActiveMembership(connection, 'inactive-profile', 'a'), {
    businessId: 'a', businessName: 'Centro', timezone: 'Europe/Madrid', role: 'admin', professionalId: null,
  });
});

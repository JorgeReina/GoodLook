import test from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig, applyMigrations, checksum } from '../migrate-lib.mjs';

const base = { DATABASE_URL: 'mysql://user:pass@127.0.0.1:3306/goodlook_test', GOODLOOK_MIGRATION_TARGET: 'test', MYSQL_ALLOW_INSECURE_LOCAL: 'true' };
test('requires explicit target and blocks production by default', () => {
  assert.throws(() => parseConfig({}), /DATABASE_URL/);
  assert.throws(() => parseConfig({ DATABASE_URL: base.DATABASE_URL }), /TARGET/);
  assert.throws(() => parseConfig({ ...base, GOODLOOK_MIGRATION_TARGET: 'production' }), /production/i);
  assert.equal(parseConfig(base).database, 'goodlook_test');
});

function fakeConnection(existing = []) {
  const rows = structuredClone(existing);
  const events = [];
  return {
    rows, events,
    async query(sql, params = []) {
      events.push(sql);
      if (sql.startsWith('SELECT GET_LOCK')) return [[{ acquired: 1 }]];
      if (sql.startsWith('SELECT RELEASE_LOCK')) return [[{ released: 1 }]];
      if (sql.startsWith('SELECT version')) return [rows];
      if (sql.startsWith('INSERT INTO schema_migrations')) rows.push({ version: params[0], checksum: params[1], state: 'applying' });
      if (sql.startsWith('UPDATE schema_migrations')) rows.find(r => r.version === params[0]).state = 'applied';
      return [[]];
    },
  };
}
const item = { version: '001', name: '001_initial.sql', sql: 'CREATE TABLE fixture (id INT);' };
test('records applying before DDL, then applied and does not replay', async () => {
  const conn = fakeConnection();
  await applyMigrations(conn, [item], 'testlock');
  const insert = conn.events.findIndex(x => x.startsWith('INSERT INTO schema_migrations'));
  const ddl = conn.events.indexOf(item.sql);
  const update = conn.events.findIndex(x => x.startsWith('UPDATE schema_migrations'));
  assert.ok(insert < ddl && ddl < update);
  assert.equal(conn.rows[0].state, 'applied');
  const before = conn.events.filter(x => x === item.sql).length;
  await applyMigrations(conn, [item], 'testlock');
  assert.equal(conn.events.filter(x => x === item.sql).length, before);
});
test('refuses interrupted and modified migrations before applying any DDL', async () => {
  for (const row of [
    { version: '001', checksum: checksum(item.sql), state: 'applying' },
    { version: '001', checksum: '0'.repeat(64), state: 'applied' },
  ]) {
    const conn = fakeConnection([row]);
    await assert.rejects(() => applyMigrations(conn, [item], 'testlock'));
    assert.equal(conn.events.includes(item.sql), false);
    assert.ok(conn.events.some(x => x.startsWith('SELECT RELEASE_LOCK')));
  }
});
test('refuses concurrent execution if advisory lock unavailable', async () => {
  const conn = fakeConnection();
  conn.query = async sql => sql.startsWith('SELECT GET_LOCK') ? [[{ acquired: 0 }]] : (() => { throw Error('must not execute'); })();
  await assert.rejects(() => applyMigrations(conn, [item], 'testlock'), /lock/i);
});
test('failed DDL leaves a durable applying marker and blocks retry', async () => {
  const conn = fakeConnection();
  const query = conn.query.bind(conn);
  conn.query = async (sql, params) => {
    if (sql === item.sql) throw new Error('simulated DDL failure');
    return query(sql, params);
  };
  await assert.rejects(() => applyMigrations(conn, [item], 'testlock'), /DDL failure/);
  assert.equal(conn.rows[0].state, 'applying');
  await assert.rejects(() => applyMigrations(conn, [item], 'testlock'), /Interrupted/);
});

test('preview migrations accept only the preview identity and refuse production or unknown hosts', () => {
  const previewUrl = 'mysql://db81522:secret@db81522.public.databaseasp.net/db81522';
  const preview = { ...base, GOODLOOK_MIGRATION_TARGET: 'preview', DATABASE_URL: previewUrl, MYSQL_TLS: 'true', MYSQL_ALLOW_INSECURE_LOCAL: undefined };
  assert.equal(parseConfig(preview).database, 'db81522');
  const productionUrl = 'mysql://db80496:super-secret-preview@db80496.public.databaseasp.net/db80496';
  for (const target of ['test', 'development', 'preview']) {
    assert.throws(() => parseConfig({
      ...base,
      GOODLOOK_MIGRATION_TARGET: target,
      DATABASE_URL: productionUrl,
      MYSQL_TLS: 'true',
      GOODLOOK_ALLOW_PRODUCTION_MIGRATIONS: 'YES',
    }), error => error instanceof Error && /production database identity/.test(error.message) && !error.message.includes('super-secret-preview'));
  }
  assert.throws(() => parseConfig({ ...base, GOODLOOK_MIGRATION_TARGET: 'preview', DATABASE_URL: 'mysql://preview_user:secret@other.example.test/db80496', MYSQL_TLS: 'true' }), /production database identity/);
  assert.throws(() => parseConfig({ ...base, GOODLOOK_MIGRATION_TARGET: 'preview', DATABASE_URL: 'mysql://preview_user:secret@db99999.public.databaseasp.net/db99999', MYSQL_TLS: 'true' }), /preview database identity/);
  assert.equal(parseConfig({
    ...base,
    GOODLOOK_MIGRATION_TARGET: 'production',
    DATABASE_URL: productionUrl,
    MYSQL_TLS: 'true',
    GOODLOOK_ALLOW_PRODUCTION_MIGRATIONS: 'YES',
  }).database, 'db80496');
});

test('requires verified TLS except explicitly permitted loopback', () => {
  assert.throws(() => parseConfig({ ...base, MYSQL_ALLOW_INSECURE_LOCAL: undefined }), /TLS/);
  assert.throws(() => parseConfig({ ...base, DATABASE_URL: 'mysql://user:pass@db.example.test/goodlook_test' }), /TLS/);
  assert.deepEqual(parseConfig({ ...base, DATABASE_URL: 'mysql://user:pass@db.example.test/goodlook_test', MYSQL_TLS: 'true' }).ssl, { rejectUnauthorized: true });
  assert.equal(parseConfig(base).ssl, undefined);
});

test('migration dialect is explicit and server version must match before writes', async () => {
  const { migrationDialect, verifyServerDialect, tlsVerificationFailure } = await import('../migrate-lib.mjs');
  assert.equal(migrationDialect({}), 'mysql');
  assert.equal(migrationDialect({ GOODLOOK_MIGRATION_TARGET: 'preview' }), 'mariadb');
  assert.equal(migrationDialect({ GOODLOOK_MIGRATION_TARGET: 'preview', GOODLOOK_MIGRATION_DIALECT: 'mariadb' }), 'mariadb');
  assert.equal(migrationDialect({GOODLOOK_MIGRATION_DIALECT:'mariadb'}), 'mariadb');
  assert.throws(() => migrationDialect({GOODLOOK_MIGRATION_DIALECT:'other'}), /dialect/i);
  const server = version => ({ query: async () => [[{version}]] });
  await verifyServerDialect(server('10.11.19-MariaDB-log'), 'mariadb');
  await verifyServerDialect(server('8.4.7'), 'mysql');
  await assert.rejects(() => verifyServerDialect(server('10.11.19-MariaDB-log'), 'mysql'), /dialect/i);
  await assert.rejects(() => verifyServerDialect(server('8.4.7'), 'mariadb'), /dialect/i);
  assert.match(tlsVerificationFailure({ code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' }), /system CA/);
  assert.match(tlsVerificationFailure({ code: 'HANDSHAKE_SSL_ERROR', cause: { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' } }), /rejectUnauthorized=true/);
  assert.equal(tlsVerificationFailure({ code: 'ER_ACCESS_DENIED_ERROR' }), null);
});

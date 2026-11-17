import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checksum, loadMigrations } from '../migrate-lib.mjs';
import { seedDemo } from '../demo-seed.mjs';

const containerId = 'a'.repeat(64);
const migrations = await loadMigrations(fileURLToPath(new URL('../migrations/', import.meta.url)));
const applied = migrations.map(({ version, sql }) => ({ version, checksum: checksum(sql), state: 'applied' }));

function simulatedConnection({ history = applied, hostname = containerId.slice(0, 12), businessRows = [], failInsert = false, port = 33317 } = {}) {
  const operations = [];
  return {
    config: { host: '127.0.0.1', port },
    operations,
    async query(sql) {
      if (sql.startsWith('SELECT @@hostname')) return [[{ hostname, databaseName: 'goodlook_disposable_test', version: '8.4.7' }]];
      if (sql.startsWith('SELECT GET_LOCK')) return [[{ acquired: 1 }]];
      if (sql.startsWith('SELECT RELEASE_LOCK')) return [[{ released: 1 }]];
      if (sql.includes('FROM schema_migrations')) return [history];
      throw new Error('Unexpected query: ' + sql);
    },
    async execute(sql, values) {
      if (sql.startsWith('SELECT')) return [sql.includes('FROM businesses') ? businessRows : []];
      assert.match(sql, /^INSERT INTO /);
      assert.equal(sql.split('?').length - 1, values.length);
      operations.push(sql.match(/^INSERT INTO (\w+)/)[1]);
      if (failInsert && sql.includes('INSERT INTO professionals')) throw new Error('fixture insert failed');
      return [{}];
    },
    async beginTransaction() { operations.push('begin'); },
    async commit() { operations.push('commit'); },
    async rollback() { operations.push('rollback'); },
  };
}

test('rejects an unexpected loopback port before writing', async () => {
  const connection = simulatedConnection({ port: 13317 });
  await assert.rejects(seedDemo(connection, containerId), /unexpected database target/);
  assert.deepEqual(connection.operations, []);
});

test('rejects a foreign database identity before writing', async () => {
  const connection = simulatedConnection({ hostname: 'other' });
  await assert.rejects(seedDemo(connection, containerId), /unexpected database target/);
  assert.deepEqual(connection.operations, []);
});

for (const [label, history] of [
  ['incomplete', applied.slice(0, -1)],
  ['interrupted', [...applied.slice(0, -1), { ...applied.at(-1), state: 'applying' }]],
  ['modified', [{ ...applied[0], checksum: '0'.repeat(64) }, ...applied.slice(1)]],
]) {
  test('rejects ' + label + ' migrations before writing', async () => {
    const connection = simulatedConnection({ history });
    await assert.rejects(seedDemo(connection, containerId), /migration history/i);
    assert.deepEqual(connection.operations, []);
  });
}

test('detects a reserved UUID collision before any insert', async () => {
  const connection = simulatedConnection({ businessRows: [{ name: 'Foreign business' }] });
  await assert.rejects(seedDemo(connection, containerId), /conflict/i);
  assert.deepEqual(connection.operations, ['begin', 'rollback']);
});

test('rolls back if an insert fails partway through', async () => {
  const connection = simulatedConnection({ failInsert: true });
  await assert.rejects(seedDemo(connection, containerId), /fixture insert failed/);
  assert.deepEqual(connection.operations, ['begin', 'businesses', 'professionals', 'rollback']);
});

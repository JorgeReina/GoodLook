import assert from 'node:assert/strict';
import { test } from 'node:test';
import mysql from 'mysql2/promise';
import { demo, mockDocker } from './demo-containers.fixture.mjs';
import { migrateDemo, validateDemoTarget } from '../demo-guard.mjs';

const target = {
  containerId: '0123456789abcdef'.repeat(4),
  hostname: '0123456789ab',
  database: 'goodlook_disposable_test',
  host: '127.0.0.1',
  port: 33317,
};

test('accepts the exact disposable target', () => {
  assert.doesNotThrow(() => validateDemoTarget(target));
});

for (const [field, value] of [
  ['containerId', '0123456789ab'],
  ['containerId', 'g'.repeat(64)],
  ['containerId', target.containerId + '\n'],
  ['hostname', 'another-host'],
  ['database', 'another_database'],
  ['host', 'localhost'],
  ['host', 'remote.example.invalid'],
  ['port', 3306],
  ['port', '33317'],
]) {
  test(`rejects a mismatched ${field} (${JSON.stringify(value)})`, () => {
    assert.throws(() => validateDemoTarget({ ...target, [field]: value }), /demo local/i);
  });
}

test('migration rejects a matching SQL target owned by another Compose project before opening a connection', async t => {
  mockDocker(t, { change: container => { container.Config.Labels['com.docker.compose.project'] = 'foreign'; } });
  const connect = t.mock.method(mysql, 'createConnection', async () => {
    throw new Error('migration attempted to open the database');
  });
  await assert.rejects(migrateDemo(target.containerId, 'mysql', demo), /container ownership/);
  assert.equal(connect.mock.callCount(), 0);
});

for (const [label, simulation] of [
  ['remote Docker endpoint', { endpoint: 'tcp://192.0.2.10:2376' }],
  ['persistent storage mount', { change: container => { container.Mounts = [{ Type: 'volume', Destination: '/var/lib/mysql' }]; } }],
  ['nonloopback published port', { change: container => { container.NetworkSettings.Ports['3306/tcp'][0].HostIp = '0.0.0.0'; } }],
]) {
  test('rejects ' + label + ' before migration opens a database connection', async t => {
    mockDocker(t, simulation);
    const connect = t.mock.method(mysql, 'createConnection', async () => {
      throw new Error('migration attempted to open the database');
    });
    await assert.rejects(migrateDemo(target.containerId, 'mysql', demo), /container ownership/);
    assert.equal(connect.mock.callCount(), 0);
  });
}

import assert from 'node:assert/strict';
import { test } from 'node:test';
import mysql from 'mysql2/promise';
import { mockDocker, networkId } from './demo-containers.fixture.mjs';
import { migrateDemo, validateDemoTarget } from '../demo-guard.mjs';
import { requireDemoOwnership, withNewDemo } from '../demo-runtime.mjs';

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

test('migration rejects matching metadata when the process did not create the container', async t => {
  const connect = t.mock.method(mysql, 'createConnection', async () => {
    throw new Error('migration attempted to open the database');
  });
  await assert.rejects(migrateDemo({ ...target, context: 'desktop-linux', project: 'goodlook-demo-' + 'f'.repeat(32) }), /container ownership/);
  assert.equal(connect.mock.callCount(), 0);
});

for (const [label, simulation, reason] of [
  ['another Compose project', { change: container => { container.Config.Labels['com.docker.compose.project'] = 'foreign'; } }, /container identity/],
  ['remote Docker endpoint', { endpoint: 'tcp://192.0.2.10:2376' }, /local Docker socket/],
  ['persistent storage mount', { change: container => { container.Mounts = [{ Type: 'volume', Destination: '/var/lib/mysql' }]; } }, /container identity/],
  ['nonloopback published port', { change: container => { container.NetworkSettings.Ports['3306/tcp'][0].HostIp = '0.0.0.0'; } }, /publish the expected loopback/],
  ['public address beside loopback', { change: container => { container.NetworkSettings.Ports['3306/tcp'].push({ HostIp: '0.0.0.0', HostPort: '33317' }); } }, /publish the expected loopback/],
  ['IPv6 loopback without IPv4', { change: container => { container.NetworkSettings.Ports['3306/tcp'][0].HostIp = '::1'; } }, /publish the expected loopback/],
]) {
  test('rejects ' + label + ' before granting access to the database', async t => {
    mockDocker(t, simulation);
    const work = t.mock.fn();
    await assert.rejects(withNewDemo('mysql', work), reason);
    assert.equal(work.mock.callCount(), 0);
  });
}

test('accepts the IPv6 loopback binding Docker adds beside 127.0.0.1', async t => {
  mockDocker(t, { change: container => { container.NetworkSettings.Ports['3306/tcp'].push({ HostIp: '::1', HostPort: '33317' }); } });
  const work = t.mock.fn(async () => 'ready');
  assert.equal(await withNewDemo('mysql', work), 'ready');
  assert.equal(work.mock.callCount(), 1);
});

test('a pre-existing generated project is neither adopted nor cleaned up', async t => {
  const operations = mockDocker(t, { preexisting: true });
  const work = t.mock.fn();
  await assert.rejects(withNewDemo('mysql', work), /container name already exists/);
  assert.equal(work.mock.callCount(), 0);
  assert.deepEqual(operations.map(([action]) => action), ['network create', 'create', 'network rm']);
  assert.deepEqual(operations.at(-1), ['network rm', networkId]);
});

test('the capability expires before cleanup of the project created by this process', async t => {
  const operations = mockDocker(t);
  let capability;
  await assert.rejects(withNewDemo('mysql', async owner => {
    capability = owner;
    assert.equal(requireDemoOwnership(owner).containerId, target.containerId);
    throw new Error('operation failed');
  }), /operation failed/);
  assert.throws(() => requireDemoOwnership(capability), /container ownership/);
  assert.deepEqual(operations.slice(2), [['rm', target.containerId], ['network rm', networkId]]);
});

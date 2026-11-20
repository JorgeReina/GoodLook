import childProcess from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const localEndpoints = new Set([
  'npipe:////./pipe/dockerDesktopLinuxEngine',
  'npipe:////./pipe/docker_engine',
  'unix:///var/run/docker.sock',
]);
const images = { mysql: 'mysql:8.4', mariadb: 'mariadb:10.11' };
const backend = fileURLToPath(new URL('../', import.meta.url));
const capabilities = new WeakMap();
const fullId = /^[a-f0-9]{64}$/;
const demoEnvironment = {
  MYSQL_ROOT_PASSWORD: 'local_test_only_root',
  MYSQL_DATABASE: 'goodlook_disposable_test',
  MYSQL_USER: 'goodlook_test',
  MYSQL_PASSWORD: 'local_test_only_password',
};

function docker(...args) {
  return childProcess.execFileSync('docker', args, {
    cwd: backend,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120_000,
    windowsHide: true,
  }).trim();
}

async function assertPortAvailable() {
  const listener = net.createServer();
  await new Promise((done, reject) => {
    listener.once('error', () => reject(new Error('Demo local: cannot bind 127.0.0.1:33317. Check whether the port is occupied.')));
    listener.listen({ host: '127.0.0.1', port: 33317, exclusive: true }, done);
  });
  await new Promise((done, reject) => listener.close(error => error ? reject(error) : done()));
}

function assertComposeConfig(config, project, image) {
  const service = config.services?.mysql;
  const [port] = service?.ports ?? [];
  const health = service?.healthcheck;
  if (config.name !== project || Object.keys(config.services ?? {}).length !== 1 ||
      service?.image !== image || service.privileged || service.volumes?.length ||
      Object.keys(config.volumes ?? {}).length !== 0 || service.network_mode ||
      service.tmpfs?.length !== 1 || service.tmpfs[0] !== '/var/lib/mysql' ||
      service.ports?.length !== 1 || port?.host_ip !== '127.0.0.1' ||
      String(port.published) !== '33317' || port.target !== 3306 || port.protocol !== 'tcp' ||
      Object.keys(service.environment ?? {}).length !== Object.keys(demoEnvironment).length ||
      !Object.entries(demoEnvironment).every(([key, value]) => service.environment?.[key] === value) ||
      health?.test?.length !== 2 || health.test[0] !== 'CMD-SHELL' || !health.test[1] ||
      !health.interval || !health.timeout || !Number.isInteger(health.retries)) {
    throw new Error('Demo local: unexpected Compose isolation configuration.');
  }
  return health;
}

function hasLoopbackBinding(ports) {
  if (!ports || typeof ports !== 'object') return false;
  const published = [];
  for (const [port, bindings] of Object.entries(ports)) {
    // An image EXPOSE without --publish is null. It is not a host binding.
    if (bindings == null) continue;
    if (!Array.isArray(bindings)) return false;
    for (const binding of bindings) published.push([port, binding]);
  }
  const mysql = published.filter(([port]) => port === '3306/tcp');
  const loopback = new Set(['127.0.0.1', '::1']);
  return published.length === mysql.length && mysql.length > 0 &&
    mysql.every(([, binding]) => loopback.has(binding?.HostIp) && binding.HostPort === '33317') &&
    mysql.some(([, binding]) => binding.HostIp === '127.0.0.1');
}

function inspectContainer(record) {
  const { context, project, dialect, containerId, networkId } = record;
  const inspections = JSON.parse(docker('--context', context, 'inspect', '--type', 'container', containerId));
  const container = Array.isArray(inspections) && inspections.length === 1 ? inspections[0] : undefined;
  const config = container?.Config;
  const host = container?.HostConfig;
  if (container?.Id !== containerId || container.Name !== '/' + project + '-mysql-1' ||
      config?.Hostname !== containerId.slice(0, 12) || config.Labels?.['com.docker.compose.project'] !== project ||
      config.Labels?.['com.docker.compose.service'] !== 'mysql' || config.Image !== images[dialect] ||
      !host || host.NetworkMode !== networkId || host.Privileged || host.Binds?.length || host.VolumesFrom?.length ||
      Object.keys(host.Tmpfs ?? {}).length !== 1 || !Object.hasOwn(host.Tmpfs, '/var/lib/mysql') ||
      !Array.isArray(container.Mounts) ||
      container.Mounts.some(mount => mount.Type !== 'tmpfs' || mount.Destination !== '/var/lib/mysql') ||
      !hasLoopbackBinding(host.PortBindings)) {
    throw new Error('Demo local: container identity, storage or port binding could not be verified.');
  }
  if (container.State?.Running && (container.NetworkSettings?.Networks?.[project]?.NetworkID !== networkId ||
      Object.keys(container.NetworkSettings?.Networks ?? {}).length !== 1)) {
    throw new Error('Demo local: running container network could not be verified.');
  }
  return container;
}

export function requireDemoOwnership(capability) {
  const record = capabilities.get(capability);
  if (!record) throw new Error('Demo local: container ownership was not granted by this process.');
  const container = inspectContainer(record);
  if (!container.State?.Running || container.State.Health?.Status !== 'healthy' ||
      !hasLoopbackBinding(container.NetworkSettings?.Ports)) {
    throw new Error('Demo local: the owned container is not healthy on the expected loopback address.');
  }
  return { containerId: record.containerId, dialect: record.dialect };
}

// Callers can request a new disposable demo, but can neither supply container
// metadata nor obtain a capability for a project that already exists.
export async function withNewDemo(dialect, work, { signal } = {}) {
  if (!Object.hasOwn(images, dialect)) throw new Error('Demo local: invalid database dialect.');
  signal?.throwIfAborted();
  await assertPortAvailable();
  const context = docker('context', 'show');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(context) ||
      !localEndpoints.has(docker('context', 'inspect', '--format', '{{.Endpoints.docker.Host}}', context)) ||
      docker('--context', context, 'info', '--format', '{{.OSType}}') !== 'linux') {
    throw new Error('Demo local: a local Docker socket with Linux containers is required.');
  }

  const project = 'goodlook-demo-' + randomUUID().replaceAll('-', '');
  const directory = mkdtempSync(join(tmpdir(), 'goodlook-demo-'));
  const envFile = join(directory, 'compose.env');
  const compose = ['--context', context, 'compose', '--env-file', envFile, '-p', project,
    '-f', join(backend, 'compose.integration.yaml')];
  if (dialect === 'mariadb') compose.push('-f', join(backend, 'compose.mariadb.integration.yaml'));

  let networkId;
  let containerId;
  const capability = Object.freeze({});
  try {
    writeFileSync(envFile, '', { flag: 'wx' });
    const health = assertComposeConfig(
      JSON.parse(docker(...compose, 'config', '--format', 'json')), project, images[dialect],
    );
    signal?.throwIfAborted();
    const network = docker('--context', context, 'network', 'create', project);
    if (!fullId.test(network)) throw new Error('Demo local: Docker did not return a network ID.');
    networkId = network;
    signal?.throwIfAborted();
    const args = ['--context', context, 'create', '--name', project + '-mysql-1',
      '--network', networkId, '--tmpfs', '/var/lib/mysql', '--publish', '127.0.0.1:33317:3306',
      '--label', 'com.docker.compose.project=' + project, '--label', 'com.docker.compose.service=mysql',
      '--health-cmd', health.test[1], '--health-interval', health.interval,
      '--health-timeout', health.timeout, '--health-retries', String(health.retries)];
    for (const [key, value] of Object.entries(demoEnvironment)) args.push('--env', key + '=' + value);
    // Docker create fails on a duplicate container name. Only its returned ID
    // is eligible for migration, seeding or removal by this invocation.
    const created = docker(...args, images[dialect]);
    if (!fullId.test(created)) throw new Error('Demo local: Docker did not return a container ID.');
    containerId = created;
    const record = { context, project, dialect, containerId, networkId };
    if (inspectContainer(record).State?.Status !== 'created') {
      throw new Error('Demo local: expected a newly created container.');
    }
    await assertPortAvailable();
    signal?.throwIfAborted();
    docker('--context', context, 'start', containerId);
    const deadline = Date.now() + 120_000;
    while (true) {
      signal?.throwIfAborted();
      const container = inspectContainer(record);
      const health = container.State?.Health?.Status;
      if (!container.State?.Running || health === 'unhealthy' || Date.now() >= deadline) {
        throw new Error('Demo local: the isolated database did not become healthy.');
      }
      if (health === 'healthy') {
        if (!hasLoopbackBinding(container.NetworkSettings?.Ports)) {
          throw new Error('Demo local: the running container did not publish the expected loopback address.');
        }
        break;
      }
      await delay(1000, undefined, { signal });
    }
    capabilities.set(capability, record);
    return await work(capability);
  } finally {
    capabilities.delete(capability);
    try {
      try {
        if (containerId) docker('--context', context, 'rm', '-f', containerId);
      } finally {
        if (networkId) docker('--context', context, 'network', 'rm', networkId);
      }
    } finally {
      rmSync(envFile, { force: true });
      rmdirSync(directory);
    }
  }
}

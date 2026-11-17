import childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyMigrations, loadMigrations, migrationDialect, verifyServerDialect } from './migrate-lib.mjs';

const target = {
  host: '127.0.0.1',
  port: 33317,
  database: 'goodlook_disposable_test',
};

export function validateDemoTarget({ containerId, hostname, database, host, port } = {}) {
  if (typeof containerId !== 'string' || !/^[a-fA-F0-9]{64}$/.test(containerId)) {
    throw new Error('Demo local: invalid container ID.');
  }
  if (hostname !== containerId.slice(0, 12) ||
      database !== target.database || host !== target.host || port !== target.port) {
    throw new Error('Demo local: unexpected database target.');
  }
}

const localEndpoints = new Set([
  'npipe:////./pipe/dockerDesktopLinuxEngine',
  'npipe:////./pipe/docker_engine',
  'unix:///var/run/docker.sock',
]);
const imageDialects = new Map([['mysql:8.4', 'mysql'], ['mariadb:10.11', 'mariadb']]);

function hasLoopbackBinding(ports) {
  const bindings = ports?.['3306/tcp'];
  return ports && Object.keys(ports).length === 1 && Array.isArray(bindings) &&
    bindings.length === 1 && bindings[0].HostIp === target.host && bindings[0].HostPort === String(target.port);
}

export function verifyDemoContainer(containerId, { context, project } = {}) {
  const ownershipError = 'Demo local: container ownership could not be verified.';
  if (typeof containerId !== 'string' || containerId.length !== 64 || !/^[a-f0-9]+$/.test(containerId) ||
      typeof context !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(context) ||
      typeof project !== 'string' || project.length !== 46 || !/^goodlook-demo-[a-f0-9]{32}$/.test(project)) {
    throw new Error(ownershipError);
  }
  const docker = (...args) => childProcess.execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10_000,
    windowsHide: true,
  }).trim();

  let inspections;
  try {
    const endpoint = docker('context', 'inspect', '--format', '{{.Endpoints.docker.Host}}', context);
    if (!localEndpoints.has(endpoint) || docker('--context', context, 'info', '--format', '{{.OSType}}') !== 'linux') {
      throw new Error(ownershipError);
    }
    inspections = JSON.parse(docker('--context', context, 'inspect', '--type', 'container', containerId));
  } catch {
    throw new Error(ownershipError);
  }

  const container = Array.isArray(inspections) && inspections.length === 1 ? inspections[0] : undefined;
  const config = container?.Config;
  const host = container?.HostConfig;
  const dialect = imageDialects.get(config?.Image);
  if (container?.Id !== containerId || container.Name !== '/' + project + '-mysql-1' ||
      config?.Hostname !== containerId.slice(0, 12) || config.Labels?.['com.docker.compose.project'] !== project ||
      config.Labels?.['com.docker.compose.service'] !== 'mysql' || !dialect ||
      container.State?.Running !== true || container.State.Health?.Status !== 'healthy' ||
      !host || host.Privileged || host.Binds?.length || host.VolumesFrom?.length ||
      Object.keys(host.Tmpfs ?? {}).length !== 1 || !Object.hasOwn(host.Tmpfs, '/var/lib/mysql') ||
      !Array.isArray(container.Mounts) ||
      container.Mounts.some(mount => mount.Type !== 'tmpfs' || mount.Destination !== '/var/lib/mysql') ||
      !hasLoopbackBinding(host.PortBindings) || !hasLoopbackBinding(container.NetworkSettings?.Ports)) {
    throw new Error(ownershipError);
  }
  return dialect;
}

export async function migrateDemo(containerId, dialectArgument, demo) {
  const containerDialect = verifyDemoContainer(containerId, demo);
  const dialect = migrationDialect({ GOODLOOK_MIGRATION_DIALECT: dialectArgument });
  if (dialect !== containerDialect) throw new Error('Demo local: unexpected container dialect.');
  const { default: mysql } = await import('mysql2/promise');
  const connection = await mysql.createConnection({
    ...target,
    user: 'goodlook_test',
    password: 'local_test_only_password',
    timezone: 'Z',
    connectTimeout: 5000,
    multipleStatements: true,
  });
  try {
    const [[identity]] = await connection.query('SELECT @@hostname AS hostname, DATABASE() AS databaseName');
    validateDemoTarget({
      containerId,
      hostname: identity?.hostname,
      database: identity?.databaseName,
      host: target.host,
      port: target.port,
    });
    await verifyServerDialect(connection, dialect);
    const directory = dialect === 'mariadb' ? 'migrations-mariadb' : 'migrations';
    const migrations = await loadMigrations(fileURLToPath(new URL(`./${directory}/`, import.meta.url)));
    const lock = `goodlook:migrate:${createHash('sha256').update(target.database).digest('hex').slice(0, 40)}`;
    await applyMigrations(connection, migrations, lock);
  } finally {
    await connection.end();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await migrateDemo(process.argv[2], process.argv[3], { context: process.argv[4], project: process.argv[5] });
  } catch {
    console.error('Demo local: migration or database identity check failed.');
    process.exitCode = 1;
  }
}

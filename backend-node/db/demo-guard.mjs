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

async function migrateDemo(containerId, dialectArgument) {
  validateDemoTarget({ ...target, containerId, hostname: containerId?.slice(0, 12) });
  const dialect = migrationDialect({ GOODLOOK_MIGRATION_DIALECT: dialectArgument });
  const { createConnection } = await import('mysql2/promise');
  const connection = await createConnection({
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
    await migrateDemo(process.argv[2], process.argv[3]);
  } catch {
    console.error('Demo local: migration or database identity check failed.');
    process.exitCode = 1;
  }
}

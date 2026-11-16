import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection } from 'mysql2/promise';
import { applyMigrations, loadMigrations } from './migrate-lib.mjs';
import { inspectTarget, monsterConfig } from './monsterasp-lib.mjs';

let connection;
try {
  const config = monsterConfig(process.env);
  const migrations = await loadMigrations(join(dirname(fileURLToPath(import.meta.url)), 'migrations-mariadb'));
  connection = await createConnection(config);
  await inspectTarget(connection);
  const lock = `goodlook:migrate:${createHash('sha256').update(config.database).digest('hex').slice(0, 40)}`;
  await applyMigrations(connection, migrations, lock);
  console.log('Verified test database and applied MariaDB migrations.');
} catch {
  // Do not print driver errors, connection strings, or credentials.
  console.error('Test database migration failed. Inspect the target state before retrying; DDL may be partially applied.');
  process.exitCode = 1;
} finally {
  if (connection) await connection.end();
}

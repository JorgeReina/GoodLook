import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseConfig, loadMigrations, applyMigrations, migrationDialect, verifyServerDialect, tlsVerificationFailure } from './migrate-lib.mjs';

let conn;
try {
  const config = parseConfig(process.env);
  const dialect = migrationDialect(process.env);
  const migrations = await loadMigrations(join(dirname(fileURLToPath(import.meta.url)), dialect === 'mariadb' ? 'migrations-mariadb' : 'migrations'));
  const mysql = await import('mysql2/promise');
  conn = await mysql.createConnection(config);
  await verifyServerDialect(conn, dialect);
  const lock = `goodlook:migrate:${createHash('sha256').update(config.database.toLowerCase()).digest('hex').slice(0, 40)}`;
  await applyMigrations(conn, migrations, lock);
  console.log('Migrations completed.');
} catch (error) {
  // Avoid printing database URLs or raw driver errors, which can contain secrets.
  const tls = tlsVerificationFailure(error);
  const code = typeof error?.code === 'string' ? error.code : 'check configuration or migration state';
  console.error(`Migration failed (${tls ?? code}).`);
  process.exitCode = 1;
} finally {
  if (conn) await conn.end();
}

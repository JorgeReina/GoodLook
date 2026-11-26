import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  isLoopbackHost,
  matchesDatabaseIdentity,
  matchesProductionDatabase,
  readPreviewDatabase,
  readProductionDatabase,
} from './production-identity.mjs';

export const checksum = sql => createHash('sha256').update(sql, 'utf8').digest('hex');

export function migrationDialect(env) {
  const dialect = env.GOODLOOK_MIGRATION_DIALECT ?? 'mysql';
  if (!['mysql', 'mariadb'].includes(dialect)) throw new Error('Invalid migration dialect');
  return dialect;
}

export async function verifyServerDialect(connection, dialect, options = {}) {
  const [rows] = await connection.query('SELECT VERSION() AS version');
  const version = rows[0]?.version;
  if (typeof version !== 'string') throw new Error('Cannot determine server dialect');
  const maria = /mariadb/i.test(version);
  const mysql8 = !maria && /^8\./.test(version);
  if (options.allowPreviewMysql && mysql8) return;
  if ((dialect === 'mariadb') !== maria || (!maria && !mysql8)) throw new Error('Server dialect does not match selected migration dialect');
}

export function parseConfig(env) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const target = env.GOODLOOK_MIGRATION_TARGET;
  if (!['test', 'development', 'preview', 'production'].includes(target)) throw new Error('GOODLOOK_MIGRATION_TARGET must be test, development, preview, or production');
  if ((target === 'production' || env.NODE_ENV === 'production') && env.GOODLOOK_ALLOW_PRODUCTION_MIGRATIONS !== 'YES') {
    throw new Error('Production migrations are disabled; explicit override is required');
  }
  let url;
  try { url = new URL(env.DATABASE_URL); } catch { throw new Error('Invalid DATABASE_URL'); }
  if (url.protocol !== 'mysql:' || !url.hostname || !url.username || !url.pathname.slice(1) || url.search || url.hash || url.pathname.slice(1).includes('/')) throw new Error('Invalid DATABASE_URL');
  const tls = env.MYSQL_TLS === 'true';
  if (!tls && !(env.MYSQL_ALLOW_INSECURE_LOCAL === 'true' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('MySQL TLS is required unless local plaintext is explicitly permitted');
  const port = url.port ? Number(url.port) : 3306;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid database port');
  let database, user, password;
  try { database = decodeURIComponent(url.pathname.slice(1)); user = decodeURIComponent(url.username); password = decodeURIComponent(url.password); } catch { throw new Error('Invalid DATABASE_URL encoding'); }
  if (!database || database.includes('/') || database.includes('\0')) throw new Error('Invalid database name');
  if (!isLoopbackHost(url.hostname)) {
    const production = readProductionDatabase();
    const preview = readPreviewDatabase();
    const identity = { host: url.hostname, database, user };
    if (target === 'preview') {
      if (matchesProductionDatabase(identity, production)) throw new Error('Refusing to migrate the production database identity');
      if (!preview) throw new Error('Preview database identity is not configured; refusing a non-loopback database');
      if (!matchesDatabaseIdentity(identity, preview)) throw new Error('Preview can only migrate the preview database identity');
    } else {
      if (!production && target !== 'production') throw new Error('Production database identity is not configured; refusing a non-loopback database');
      if (target !== 'production' && matchesProductionDatabase(identity, production)) {
        throw new Error('Refusing to migrate the production database identity');
      }
    }
  }
  return { host: url.hostname, port, user, password, database, timezone: 'Z', multipleStatements: true,
    ssl: tls ? { rejectUnauthorized: true } : undefined };
}

export async function loadMigrations(dir) {
  const files = (await readdir(dir)).filter(name => /^\d{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
  if (!files.length) throw new Error('No migration files found');
  const migrations = await Promise.all(files.map(async name => ({ name, version: name.slice(0, 3), sql: await readFile(join(dir, name), 'utf8') })));
  if (new Set(migrations.map(m => m.version)).size !== migrations.length) throw new Error('Duplicate migration version');
  return migrations;
}

export async function applyMigrations(connection, migrations, lockName) {
  const [lock] = await connection.query('SELECT GET_LOCK(?, 0) AS acquired', [lockName]);
  if (lock[0]?.acquired !== 1) throw new Error('Migration lock unavailable');
  try {
    await connection.query("SET time_zone = '+00:00'");
    await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
      checksum CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
      state ENUM('applying','applied') NOT NULL,
      applied_at DATETIME(3) NULL
    ) ENGINE=InnoDB`);
    const [rows] = await connection.query('SELECT version, checksum, state FROM schema_migrations ORDER BY version');
    const known = new Map(migrations.map(m => [m.version, m]));
    for (const row of rows) {
      if (row.state !== 'applied') throw new Error(`Interrupted migration ${row.version}; manual recovery required`);
      const migration = known.get(row.version);
      if (!migration || checksum(migration.sql) !== row.checksum) throw new Error(`Missing or modified migration ${row.version}`);
    }
    const existing = new Set(rows.map(r => r.version));
    let seenMissing = false;
    for (const migration of migrations) {
      if (!existing.has(migration.version)) seenMissing = true;
      else if (seenMissing) throw new Error('Migration history has a gap');
    }
    for (const migration of migrations) {
      if (existing.has(migration.version)) continue;
      await connection.query('INSERT INTO schema_migrations (version,checksum,state) VALUES (?, ?, ?)', [migration.version, checksum(migration.sql), 'applying']);
      // MySQL DDL commits implicitly. A failure deliberately leaves 'applying'.
      await connection.query(migration.sql);
      await connection.query("UPDATE schema_migrations SET state='applied', applied_at=UTC_TIMESTAMP(3) WHERE version=? AND state='applying'", [migration.version]);
    }
  } finally {
    await connection.query('SELECT RELEASE_LOCK(?) AS released', [lockName]);
  }
}

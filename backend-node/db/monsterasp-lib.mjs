import { PRODUCTION_DATABASE } from './production-identity.mjs';

// Pinned to the production database. It still refuses a non-empty schema.
// Preview uses migrate.mjs with GOODLOOK_MIGRATION_TARGET=preview instead.
export function monsterConfig(env) {
  if (env.GOODLOOK_ALLOW_PRODUCTION_MIGRATIONS !== 'YES') throw new Error('Production migrations are disabled; explicit override is required');
  if (!env.GOODLOOK_DB_PASSWORD) throw new Error('Missing database password');
  return { host: PRODUCTION_DATABASE.host, port: 3306,
    user: PRODUCTION_DATABASE.user, password: env.GOODLOOK_DB_PASSWORD, database: PRODUCTION_DATABASE.database,
    timezone: 'Z', multipleStatements: true, ssl: { rejectUnauthorized: true } };
}

export function validatePreflight({ db, version, cipher, count }) {
  if (db !== PRODUCTION_DATABASE.database || typeof version !== 'string' || !/^10\.11\..*mariadb/i.test(version) ||
      typeof cipher !== 'string' || !cipher || Number(count) !== 0) {
    throw new Error('Database preflight failed; no migrations applied');
  }
}

export async function inspectTarget(connection) {
  const [identity] = await connection.query('SELECT DATABASE() AS db, VERSION() AS version');
  const [tls] = await connection.query("SHOW SESSION STATUS LIKE 'Ssl_cipher'");
  const [tables] = await connection.query('SELECT COUNT(*) AS count FROM information_schema.tables WHERE table_schema = DATABASE()');
  validatePreflight({ ...identity[0], cipher: tls[0]?.Value, count: tables[0]?.count });
}

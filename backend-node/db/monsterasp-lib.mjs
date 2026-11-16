// This launcher is intentionally limited to the dedicated, empty test database.
export function monsterConfig(env) {
  if (!env.GOODLOOK_DB_PASSWORD) throw new Error('Missing database password');
  return { host: 'db80496.public.databaseasp.net', port: 3306,
    user: 'db80496', password: env.GOODLOOK_DB_PASSWORD, database: 'db80496',
    timezone: 'Z', multipleStatements: true, ssl: { rejectUnauthorized: true } };
}

export function validatePreflight({ db, version, cipher, count }) {
  if (db !== 'db80496' || typeof version !== 'string' || !/^10\.11\..*mariadb/i.test(version) ||
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

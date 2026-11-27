import { createConnection } from 'mysql2/promise';

const ALLOWED_HOST = 'db81522.public.databaseasp.net';
const ALLOWED_DATABASE = 'db81522';
const FORBIDDEN_IDENTITY = 'db80496';

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function parsePreviewUrl(raw) {
  if (!raw) throw new Error('missing');
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('invalid');
  }
  if (url.protocol !== 'mysql:' || url.search || url.hash) throw new Error('invalid');
  let host, database, user, password;
  try {
    host = url.hostname;
    database = decodeURIComponent(url.pathname.replace(/^\//, ''));
    user = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
  } catch {
    throw new Error('invalid');
  }
  const port = url.port ? Number(url.port) : 3306;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('invalid');
  if (!host || !database || !user || database.includes('/') || database.includes('\0')) throw new Error('invalid');
  const identity = `${host}/${database}/${user}`;
  if (identity.includes(FORBIDDEN_IDENTITY)) throw new Error('production');
  if (host !== ALLOWED_HOST || database !== ALLOWED_DATABASE) throw new Error('mismatch');
  return { host, port, user, password, database };
}

function mysqlConfig(parsed) {
  return {
    host: parsed.host,
    port: parsed.port,
    user: parsed.user,
    password: parsed.password,
    database: parsed.database,
    timezone: 'Z',
    ssl: { rejectUnauthorized: true },
    connectTimeout: 15000,
  };
}

function maskSecrets(parsed) {
  for (const value of [parsed.password, parsed.user, parsed.host, parsed.database]) {
    if (value) console.log(`::add-mask::${value}`);
  }
}

function fixtureId(n) {
  return '81522000-0000-4000-8000-' + String(n).padStart(12, '0');
}

const userId = fixtureId(1);
const businessId = fixtureId(2);
const professionalId = fixtureId(3);
const serviceId = fixtureId(4);
const hours = [1, 2, 3, 4, 5].map(day => ({
  id: fixtureId(10 + day),
  weekday: day,
}));

async function withPreviewConnection(rawUrl, fn) {
  const parsed = parsePreviewUrl(rawUrl);
  maskSecrets(parsed);
  const connection = await createConnection(mysqlConfig(parsed));
  try {
    const [[identity]] = await connection.query('SELECT @@hostname AS hostname, DATABASE() AS databaseName');
    const databaseName = identity?.databaseName;
    if (typeof databaseName === 'string' && databaseName.includes(FORBIDDEN_IDENTITY)) {
      throw new Error('production');
    }
    if (databaseName !== ALLOWED_DATABASE) throw new Error('mismatch');
    return await fn(connection);
  } finally {
    await connection.end();
  }
}

async function diagnose(connection) {
  const [[row]] = await connection.query(`
    SELECT VERSION() AS version,
           @@character_set_server AS character_set_server,
           @@collation_server AS collation_server,
           @@sql_mode AS sql_mode
  `);
  const [[{ table_count }]] = await connection.query(`
    SELECT COUNT(*) AS table_count
    FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'
  `);
  console.log(`version=${row.version}`);
  console.log(`character_set_server=${row.character_set_server}`);
  console.log(`collation_server=${row.collation_server}`);
  console.log(`sql_mode=${row.sql_mode}`);
  console.log(`table_count=${table_count}`);
}

async function seed(connection) {
  await connection.query("SET time_zone = '+00:00'");
  await connection.beginTransaction();
  try {
    await connection.execute(
      `INSERT INTO users (id, email, password_hash, display_name)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE display_name = VALUES(display_name)`,
      [userId, 'preview-user@example.test', 'disabled', 'Usuario de prueba Preview'],
    );
    await connection.execute(
      `INSERT INTO businesses (id, name, timezone, is_public)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), timezone = VALUES(timezone)`,
      [businessId, 'Negocio Preview', 'Europe/Madrid', 1],
    );
    await connection.execute(
      `INSERT INTO memberships (business_id, user_id, role, status)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE role = VALUES(role), status = VALUES(status)`,
      [businessId, userId, 'owner', 'active'],
    );
    await connection.execute(
      `INSERT INTO professionals (id, business_id, user_id, display_name, active)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE display_name = VALUES(display_name), active = VALUES(active)`,
      [professionalId, businessId, userId, 'Profesional Preview', 1],
    );
    await connection.execute(
      `INSERT INTO services (id, business_id, name, duration_minutes, price_cents, currency, active)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), duration_minutes = VALUES(duration_minutes),
         price_cents = VALUES(price_cents), active = VALUES(active)`,
      [serviceId, businessId, 'Corte Preview', 30, 1500, 'EUR', 1],
    );
    await connection.execute(
      `INSERT INTO professional_services (business_id, professional_id, service_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE business_id = VALUES(business_id)`,
      [businessId, professionalId, serviceId],
    );
    for (const hour of hours) {
      await connection.execute(
        `INSERT INTO working_hours (id, business_id, professional_id, weekday, start_time, end_time)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE start_time = VALUES(start_time), end_time = VALUES(end_time)`,
        [hour.id, businessId, professionalId, hour.weekday, '09:00:00', '18:00:00'],
      );
    }
    await connection.commit();
    console.log('Preview seed completed.');
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

async function inventory(connection) {
  const [tables] = await connection.query(`
    SELECT table_name AS name
    FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  console.log('tables_and_rows:');
  for (const table of tables) {
    const name = table.name;
    if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error('invalid');
    const [[{ n }]] = await connection.query(`SELECT COUNT(*) AS n FROM \`${name}\``);
    console.log(`${name}=${n}`);
  }
}

const command = process.argv[2];
const raw = process.env.PREVIEW_DATABASE_URL ?? process.env.DATABASE_URL;

try {
  if (command === 'guard') {
    const parsed = parsePreviewUrl(raw);
    maskSecrets(parsed);
    console.log('Preview database identity accepted.');
  } else if (command === 'diagnose') {
    await withPreviewConnection(raw, diagnose);
  } else if (command === 'seed') {
    await withPreviewConnection(raw, seed);
  } else if (command === 'inventory') {
    await withPreviewConnection(raw, inventory);
  } else {
    fail('Unknown preview-ops command.');
  }
} catch (error) {
  const reason = error?.message;
  if (reason === 'missing') fail('PREVIEW_DATABASE_URL is required.');
  else if (reason === 'invalid') fail('PREVIEW_DATABASE_URL is invalid.');
  else if (reason === 'production') fail('Refusing production database identity.');
  else if (reason === 'mismatch') fail('Preview database identity mismatch.');
  else fail(`Preview ops failed (${typeof error?.code === 'string' ? error.code : 'check configuration'}).`);
}

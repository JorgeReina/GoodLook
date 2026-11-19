import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createConnection } from 'mysql2/promise';
import { validateDemoTarget } from './demo-guard.mjs';
import { requireDemoOwnership } from './demo-runtime.mjs';
import { checksum, loadMigrations } from './migrate-lib.mjs';

const target = {
  host: '127.0.0.1',
  port: 33317,
  database: 'goodlook_disposable_test',
};

function fixtureId(number) {
  return '00000000-0000-4000-8000-' + String(number).padStart(12, '0');
}

const business = fixtureId(1);
const professionals = [fixtureId(2), fixtureId(3)];
const services = [fixtureId(4), fixtureId(5)];

// Only these primary keys and values belong to the seed. Other rows, including
// later appointments and catalog entries, do not participate in equality checks.
const fixtures = [
  {
    table: 'businesses',
    columns: ['id', 'name', 'timezone', 'is_public'],
    keyLength: 1,
    rows: [[business, 'DEMO LOCAL', 'Europe/Madrid', 1]],
  },
  {
    table: 'professionals',
    columns: ['id', 'business_id', 'user_id', 'display_name', 'active'],
    keyLength: 1,
    rows: [
      [professionals[0], business, null, 'Profesional Demo A', 1],
      [professionals[1], business, null, 'Profesional Demo B', 1],
    ],
  },
  {
    table: 'services',
    columns: ['id', 'business_id', 'name', 'duration_minutes', 'price_cents', 'currency', 'active'],
    keyLength: 1,
    rows: [
      [services[0], business, 'Corte Demo', 30, 1500, 'EUR', 1],
      [services[1], business, 'Peinado Demo', 45, 2000, 'EUR', 1],
    ],
  },
  {
    table: 'professional_services',
    columns: ['business_id', 'professional_id', 'service_id'],
    keyLength: 3,
    rows: professionals.flatMap(professional => services.map(service => [business, professional, service])),
  },
  {
    table: 'working_hours',
    columns: ['id', 'business_id', 'professional_id', 'weekday', 'start_time', 'end_time'],
    keyLength: 1,
    rows: professionals.flatMap((professional, index) => Array.from({ length: 7 }, (_, day) => [
      fixtureId(10 + 7 * index + day), business, professional, day + 1, '09:00:00', '18:00:00',
    ])),
  },
];

function placeholders(rows, width) {
  const tuple = '(' + Array(width).fill('?').join(', ') + ')';
  return rows.map(() => tuple).join(', ');
}

async function requireAppliedMigrations(connection, version, dialect) {
  if (typeof version !== 'string' ||
      (dialect === 'mariadb' ? !/mariadb/i.test(version) : !/^8\./.test(version) || /mariadb/i.test(version))) {
    throw new Error('Demo local: unsupported database dialect.');
  }
  const directory = dialect === 'mariadb' ? 'migrations-mariadb' : 'migrations';
  const migrations = await loadMigrations(fileURLToPath(new URL('./' + directory + '/', import.meta.url)));
  const [applied] = await connection.query('SELECT version, checksum, state FROM schema_migrations ORDER BY version');
  if (applied.length !== migrations.length || migrations.some(({ version, sql }, index) => {
    const row = applied[index];
    return row.version !== version || row.state !== 'applied' || row.checksum !== checksum(sql);
  })) {
    throw new Error('Demo local: migration history is incomplete or does not match the expected series.');
  }
}

async function countMatchingRows(connection, { table, columns, keyLength, rows }) {
  const keyColumns = columns.slice(0, keyLength).join(', ');
  const keys = rows.map(row => row.slice(0, keyLength));
  const key = keyLength === 1 ? keyColumns : '(' + keyColumns + ')';
  const values = keyLength === 1 ? keys.map(() => '?').join(', ') : placeholders(keys, keyLength);
  const [existing] = await connection.execute(
    'SELECT ' + columns.join(', ') + ' FROM ' + table + ' WHERE ' + key + ' IN (' + values + ') FOR UPDATE',
    keys.flat(),
  );
  for (const actual of existing) {
    if (!rows.some(expected => columns.every((column, index) => actual[column] === expected[index]))) {
      throw new Error('Demo local: reserved fixture conflict in ' + table + '.');
    }
  }
  return existing.length;
}

export async function seedDemo(connection, capability) {
  const { containerId: expectedContainerId, dialect } = requireDemoOwnership(capability);
  const { host, port, socketPath, stream } = connection.config;
  if (socketPath || stream) throw new Error('Demo local: unexpected database target.');
  const expected = { containerId: expectedContainerId, host, port };
  const expectedHostname = typeof expectedContainerId === 'string' ? expectedContainerId.slice(0, 12) : undefined;
  validateDemoTarget({ ...expected, database: target.database, hostname: expectedHostname });
  const [[identity]] = await connection.query('SELECT @@hostname AS hostname, DATABASE() AS databaseName, VERSION() AS version');
  validateDemoTarget({ ...expected, hostname: identity?.hostname, database: identity?.databaseName });

  // Serialize concurrent seeds and use the same lock name as the migrator.
  const lock = 'goodlook:migrate:' + createHash('sha256').update(target.database).digest('hex').slice(0, 40);
  const [[result]] = await connection.query('SELECT GET_LOCK(?, 0) AS acquired', [lock]);
  if (result?.acquired !== 1) throw new Error('Demo local: migration or seed lock is unavailable.');
  try {
    await requireAppliedMigrations(connection, identity.version, dialect);
    await connection.beginTransaction();
    try {
      let matching = 0;
      for (const fixture of fixtures) matching += await countMatchingRows(connection, fixture);
      if (matching === 0) {
        for (const { table, columns, rows } of fixtures) {
          await connection.execute(
            'INSERT INTO ' + table + ' (' + columns.join(', ') + ') VALUES ' + placeholders(rows, columns.length),
            rows.flat(),
          );
        }
      } else if (matching !== fixtures.reduce((count, fixture) => count + fixture.rows.length, 0)) {
        throw new Error('Demo local: partial reserved fixture conflict.');
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    await connection.query('SELECT RELEASE_LOCK(?) AS released', [lock]);
  }
}

export async function openDemoConnection(capability) {
  requireDemoOwnership(capability);
  return createConnection({
    ...target,
    user: 'goodlook_test',
    password: 'local_test_only_password',
    timezone: 'Z',
    connectTimeout: 5000,
  });
}

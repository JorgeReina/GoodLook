import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { applyMigrations, checksum } from '../../db/migrate-lib.mjs';

type Migration = { name: string; version: string; sql: string };
type Row = RowDataPacket & Record<string, unknown>;

export async function verifyProductSchema(connection: Pick<PoolConnection, 'query'>) {
  const [columns] = await connection.query<Row[]>(`
    SELECT table_name AS tableName, column_name AS columnName,
           data_type AS dataType, is_nullable AS nullable,
           character_maximum_length AS length, datetime_precision AS precisionDigits
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND ((table_name = 'businesses' AND column_name IN ('address', 'first_published_at', 'sector'))
        OR (table_name = 'services' AND column_name = 'description')
        OR (table_name = 'professional_invitations' AND column_name = 'revoked_at'))
    ORDER BY table_name, column_name`);
  assert.deepEqual(columns.map(row => [
    row.tableName, row.columnName, row.dataType, row.nullable,
    row.length === null ? null : Number(row.length),
    row.precisionDigits === null ? null : Number(row.precisionDigits),
  ]), [
    ['businesses', 'address', 'varchar', 'YES', 250, null],
    ['businesses', 'first_published_at', 'datetime', 'YES', null, 3],
    ['businesses', 'sector', 'varchar', 'YES', 80, null],
    ['professional_invitations', 'revoked_at', 'datetime', 'YES', null, 3],
    ['services', 'description', 'varchar', 'YES', 500, null],
  ]);

  const [indexes] = await connection.query<Row[]>(`
    SELECT index_name AS name, non_unique AS nonUnique, column_name AS columnName
    FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'professionals'
      AND index_name IN ('ix_prof_user_business', 'uq_prof_business_user')
    ORDER BY index_name, seq_in_index`);
  assert.deepEqual(indexes.map(row => [row.name, Number(row.nonUnique), row.columnName]), [
    ['ix_prof_user_business', 1, 'user_id'],
    ['ix_prof_user_business', 1, 'business_id'],
    ['ix_prof_user_business', 1, 'id'],
    ['uq_prof_business_user', 0, 'business_id'],
    ['uq_prof_business_user', 0, 'user_id'],
  ]);
}

export async function verifyProductSchemaUpgrade(connection: PoolConnection, migrations: Migration[]) {
  const lock = 'goodlook:integration';
  const prefix = migrations.filter(migration => migration.version <= '004');
  assert.deepEqual(prefix.map(migration => migration.version), ['001', '002', '003', '004']);
  await applyMigrations(connection, prefix, lock);

  const publicBusiness = randomUUID(), privateBusiness = randomUUID();
  const professional = randomUUID(), secondProfessional = randomUUID(), service = randomUUID();
  const user = randomUUID(), customer = randomUUID(), appointment = randomUUID();
  const invitationHash = 'a'.repeat(64);
  const createdAt = '2026-01-02 03:04:05.123';
  const startAt = '2026-02-02 12:00:00.000', endAt = '2026-02-02 12:45:00.000';
  await connection.execute(
    'INSERT INTO users(id,email,password_hash,display_name) VALUES (?,?,?,?),(?,?,?,?)',
    [user, 'schema-pro@example.test', 'disabled', 'Professional', customer, 'schema-customer@example.test', 'disabled', 'Customer'],
  );
  await connection.execute(
    'INSERT INTO businesses(id,name,timezone,is_public,created_at) VALUES (?,?,?,?,?),(?,?,?,?,?)',
    [publicBusiness, 'Existing public business', 'UTC', 1, createdAt, privateBusiness, 'Existing private business', 'UTC', 0, createdAt],
  );
  await connection.execute(
    "INSERT INTO memberships(business_id,user_id,role) VALUES (?,?,'professional')",
    [publicBusiness, user],
  );
  const addProfessional = (id: string, businessId: string) => connection.execute(
    'INSERT INTO professionals(id,business_id,user_id,display_name) VALUES (?,?,?,?)',
    [id, businessId, user, 'Professional'],
  );
  await addProfessional(professional, publicBusiness);
  await connection.execute(
    'INSERT INTO services(id,business_id,name,duration_minutes,price_cents) VALUES (?,?,?,45,2100)',
    [service, publicBusiness, 'Existing service'],
  );
  await connection.execute(
    'INSERT INTO professional_services(business_id,professional_id,service_id) VALUES (?,?,?)',
    [publicBusiness, professional, service],
  );
  await connection.execute(
    `INSERT INTO appointments(id,business_id,professional_id,service_id,customer_user_id,start_at,end_at,status,notes,price_cents,currency)
     VALUES (?,?,?,?,?,?,?,'completed','Synthetic note',1800,'EUR')`,
    [appointment, publicBusiness, professional, service, customer, startAt, endAt],
  );
  await connection.execute(
    'INSERT INTO professional_invitations(token_hash,business_id,professional_id,created_by,expires_at) VALUES (?,?,?,?,?)',
    [invitationHash, publicBusiness, professional, user, endAt],
  );

  const readHistory = async () => (await connection.query<Row[]>(
    'SELECT version, checksum, state, applied_at FROM schema_migrations ORDER BY version',
  ))[0];
  const readAppointment = async () => (await connection.execute<Row[]>('SELECT * FROM appointments WHERE id = ?', [appointment]))[0];
  const originalHistory = await readHistory();
  const originalAppointment = await readAppointment();

  await applyMigrations(connection, migrations, lock);
  await verifyProductSchema(connection);
  const upgradedHistory = await readHistory();
  assert.ok(upgradedHistory.some(row => row.version === '005'));
  assert.deepEqual(upgradedHistory.slice(0, prefix.length), originalHistory);
  assert.deepEqual(upgradedHistory.map(({ version, checksum: digest, state }) => [version, digest, state]),
    migrations.map(migration => [migration.version, checksum(migration.sql), 'applied']));

  const [businesses] = await connection.execute<Row[]>(
    'SELECT is_public, sector, address, first_published_at, created_at FROM businesses WHERE id IN (?,?) ORDER BY is_public',
    [publicBusiness, privateBusiness],
  );
  assert.deepEqual(businesses.map(row => [row.is_public, row.sector, row.address, row.first_published_at]), [
    [0, null, null, null],
    [1, null, null, new Date('2026-01-02T03:04:05.123Z')],
  ]);
  assert.deepEqual(businesses[1].first_published_at, businesses[1].created_at);
  const [[oldService]] = await connection.execute<Row[]>('SELECT description FROM services WHERE id = ?', [service]);
  assert.equal(oldService.description, null);
  const [[oldInvitation]] = await connection.execute<Row[]>(
    'SELECT revoked_at FROM professional_invitations WHERE token_hash = ?', [invitationHash],
  );
  assert.equal(oldInvitation.revoked_at, null);

  await assert.rejects(addProfessional(secondProfessional, privateBusiness), { code: 'ER_NO_REFERENCED_ROW_2' });
  await connection.execute(
    "INSERT INTO memberships(business_id,user_id,role) VALUES (?,?,'professional')",
    [privateBusiness, user],
  );
  await addProfessional(secondProfessional, privateBusiness);
  await assert.rejects(addProfessional(randomUUID(), publicBusiness), { code: 'ER_DUP_ENTRY' });
  await assert.rejects(connection.execute(
    'INSERT INTO professional_services(business_id,professional_id,service_id) VALUES (?,?,?)',
    [privateBusiness, secondProfessional, service],
  ), { code: 'ER_NO_REFERENCED_ROW_2' });
  await assert.rejects(connection.execute(
    'DELETE FROM professional_services WHERE business_id = ? AND professional_id = ? AND service_id = ?',
    [publicBusiness, professional, service],
  ), { code: 'ER_ROW_IS_REFERENCED_2' });
  const [profiles] = await connection.execute<Row[]>(
    'SELECT id FROM professionals WHERE user_id = ? ORDER BY id', [user],
  );
  assert.deepEqual(profiles.map(row => row.id), [professional, secondProfessional].sort());

  const publication = '2026-03-01 09:00:00.456';
  await connection.execute('UPDATE businesses SET first_published_at = ? WHERE id = ?', [publication, publicBusiness]);
  await applyMigrations(connection, migrations, lock);
  assert.deepEqual(await readHistory(), upgradedHistory);
  assert.deepEqual(await readAppointment(), originalAppointment);
  const [[publicRow]] = await connection.execute<Row[]>('SELECT first_published_at FROM businesses WHERE id = ?', [publicBusiness]);
  assert.deepEqual(publicRow.first_published_at, new Date('2026-03-01T09:00:00.456Z'));
}

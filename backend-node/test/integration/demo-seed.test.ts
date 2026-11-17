import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createConnection, type Pool, type RowDataPacket } from 'mysql2/promise';
import { seedDemo } from '../../db/demo-seed.mjs';
import { publicAvailability } from '../../src/appointments/public-availability.js';
import { createAppointment, listCustomerAppointments, type AppointmentPool } from '../../src/appointments/service.js';
import { MysqlCatalogStore } from '../../src/catalog/mysql-store.js';
import { MysqlProfessionalsStore } from '../../src/professionals/mysql-store.js';

const containerId = process.env.GOODLOOK_TEST_CONTAINER_ID;
if (process.env.GOODLOOK_RUN_MYSQL_TESTS !== '1' || !containerId || !/^[a-f0-9]{64}$/.test(containerId)) {
  throw new Error('Use scripts/demo-local.ps1 -Mode test to provision the isolated database.');
}

test('isolated seed loads twice, preserves later rows and refuses partial or changed fixtures', async () => {
  const connection = await createConnection({
    host: '127.0.0.1',
    port: 33317,
    database: 'goodlook_disposable_test',
    user: 'goodlook_test',
    password: 'local_test_only_password',
    timezone: 'Z',
    connectTimeout: 5000,
  });
  try {
    // Keep all fixture and appointment writes on the connection verified by seedDemo.
    await seedDemo(connection, containerId);
    const appointmentPool: AppointmentPool = {
      async getConnection() {
        return {
          beginTransaction: () => connection.beginTransaction(),
          commit: () => connection.commit(),
          rollback: () => connection.rollback(),
          query: (sql, parameters) => connection.query(sql, parameters),
          release() {},
        };
      },
    };
    // The public catalog reads use only execute, which both types provide.
    const catalog = new MysqlCatalogStore(connection as unknown as Pool);
    const roster = new MysqlProfessionalsStore(connection as unknown as Pool);
    const businesses = await catalog.listBusinesses();
    assert.equal(businesses.length, 1);
    const [business] = businesses;
    assert.equal(business.name, 'DEMO LOCAL');
    assert.equal(business.timezone, 'Europe/Madrid');
    const services = await catalog.list(business.id);
    const professionals = await roster.listActive(business.id);
    assert.equal(services.length, 2);
    assert.equal(professionals.length, 2);

    const tomorrow = new Date(Date.now() + 86_400_000);
    tomorrow.setUTCHours(0, 0, 0, 0);
    const from = tomorrow.toISOString();
    const to = new Date(tomorrow.getTime() + 86_400_000).toISOString();
    const search = { businessId: business.id, professionalId: professionals[0].id, serviceId: services[0].id, from, to };
    const slots = await publicAvailability(appointmentPool, search);
    assert.ok(slots.slots.length > 1);

    const unrelatedBusiness = randomUUID();
    await connection.execute('INSERT INTO businesses(id,name,timezone) VALUES (?,?,?)', [unrelatedBusiness, 'Centinela', 'UTC']);
    const [[usersBeforeBooking]] = await connection.query<RowDataPacket[]>('SELECT COUNT(*) AS count FROM users');
    assert.equal(Number(usersBeforeBooking.count), 0);
    const customer = randomUUID();
    await connection.execute(
      'INSERT INTO users(id,email,password_hash,display_name) VALUES (?,?,?,?)',
      [customer, 'demo-seed-test@example.test', 'synthetic fixture', 'Cliente de prueba'],
    );
    const appointment = await createAppointment(appointmentPool, { ...search, actorId: customer, startAt: slots.slots[0].startAt });

    await seedDemo(connection, containerId);
    assert.deepEqual(await catalog.listBusinesses(), businesses);
    assert.deepEqual(await catalog.list(business.id), services);
    assert.deepEqual(await roster.listActive(business.id), professionals);
    for (const [table, expectedCount] of [['professionals', 2], ['services', 2], ['professional_services', 4], ['working_hours', 14]] as const) {
      const [[row]] = await connection.execute<RowDataPacket[]>('SELECT COUNT(*) AS count FROM ' + table + ' WHERE business_id=?', [business.id]);
      assert.equal(Number(row.count), expectedCount, table);
    }
    const [[sentinel]] = await connection.execute<RowDataPacket[]>('SELECT name, timezone, is_public FROM businesses WHERE id=?', [unrelatedBusiness]);
    assert.deepEqual(sentinel, { name: 'Centinela', timezone: 'UTC', is_public: 0 });
    const { customerUserId, ...expectedAppointment } = appointment;
    assert.equal(customerUserId, customer);
    assert.deepEqual(await listCustomerAppointments(appointmentPool, { actorId: customer, from, to }), [expectedAppointment]);
    assert.ok(!(await publicAvailability(appointmentPool, search)).slots.some(slot => slot.startAt === appointment.startAt));

    // Simulate a changed row with a reserved identifier, even under an equivalent collation.
    await connection.execute('UPDATE businesses SET name=? WHERE id=?', ['demo local', business.id]);
    await assert.rejects(seedDemo(connection, containerId), /reserved fixture conflict/);
    assert.equal((await catalog.listBusinesses())[0].name, 'demo local');
    await connection.execute('UPDATE businesses SET name=? WHERE id=?', [business.name, business.id]);

    await connection.execute(
      'DELETE FROM professional_services WHERE business_id=? AND professional_id=? AND service_id=?',
      [business.id, professionals[1].id, services[1].id],
    );
    try {
      await assert.rejects(seedDemo(connection, containerId), /partial reserved fixture conflict/);
      const [[remaining]] = await connection.execute<RowDataPacket[]>('SELECT COUNT(*) AS count FROM professional_services WHERE business_id=?', [business.id]);
      assert.equal(Number(remaining.count), 3);
    } finally {
      await connection.execute(
        'INSERT INTO professional_services (business_id,professional_id,service_id) VALUES (?,?,?)',
        [business.id, professionals[1].id, services[1].id],
      );
    }
  } finally {
    await connection.end();
  }
});

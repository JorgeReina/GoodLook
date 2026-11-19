import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import { createPool, type RowDataPacket } from 'mysql2/promise';
import { createApp } from '../../src/app.js';
import { MysqlAuthStore } from '../../src/auth/mysql-store.js';
import { AuthRateLimiter, MysqlRateLimitStore } from '../../src/auth/rate-limit.js';
import { createAppointment, listProfessionalAgenda, type AppointmentPool } from '../../src/appointments/service.js';
import { loadMigrations, verifyServerDialect, migrationDialect } from '../../db/migrate-lib.mjs';

import { verifyProductSchemaUpgrade } from './product-schema.js';

// Hardcoded loopback-only ephemeral database; hostname is checked against the
// container created by the wrapper before any schema or fixture is written.
if (process.env.GOODLOOK_RUN_MYSQL_TESTS !== '1' || !/^[a-f0-9]{64}$/.test(process.env.GOODLOOK_TEST_CONTAINER_ID ?? '')) {
  throw new Error('Use scripts/test-mysql-integration.sh; explicit isolated Docker container required');
}
const expectedContainer = process.env.GOODLOOK_TEST_CONTAINER_ID!;
const pool = createPool({ host:'127.0.0.1', port:33317, user:'goodlook_test', password:'local_test_only_password', database:'goodlook_disposable_test', timezone:'Z', connectionLimit:5, multipleStatements:true });
type R = RowDataPacket & Record<string, unknown>;

test('isolated database: migrations, identity, tenant checks and racing bookings', async t => {
  let server: ReturnType<ReturnType<typeof createApp>['listen']> | undefined;
  try {
    const [identity] = await pool.query<R[]>('SELECT @@hostname AS host, DATABASE() AS db, VERSION() AS version');
    assert.equal(identity[0].host, expectedContainer.slice(0,12), 'unexpected server; refusing to write');
    assert.equal(identity[0].db, 'goodlook_disposable_test');
    const [existing] = await pool.query<R[]>("SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()");
    assert.equal(existing.length, 0, 'database must be empty; refusing to write');
    const dialect = migrationDialect(process.env);
    t.diagnostic(String(identity[0].version));
    const conn = await pool.getConnection();
    try {
      await verifyServerDialect(conn, dialect);
      const dir = dialect === 'mariadb' ? 'migrations-mariadb' : 'migrations';
      const migrations = await loadMigrations(fileURLToPath(new URL(`../../db/${dir}/`, import.meta.url)));
      await verifyProductSchemaUpgrade(conn, migrations);
    } finally { conn.release(); }

    const realLimiter = new AuthRateLimiter(new MysqlRateLimitStore(pool), 'b'.repeat(64));
    const attempts = await Promise.all(Array.from({length:12}, () => realLimiter.check('192.0.2.44', 'ratelimit@example.test')));
    assert.equal(attempts.filter(result => result.allowed).length, 10);
    assert.equal(attempts.filter(result => !result.allowed).length, 2);
    const [beforeBuckets] = await pool.query<R[]>('SELECT COUNT(*) AS n FROM auth_rate_limits');
    for (let index = 0; index < 110; index++) {
      const result = await realLimiter.check('192.0.2.45', `unique${index}@example.test`);
      assert.equal(result.allowed, index < 100);
    }
    const [afterBuckets] = await pool.query<R[]>('SELECT COUNT(*) AS n FROM auth_rate_limits');
    // The blocked socket creates no further identity rows after the IP cap.
    assert.equal(Number(afterBuckets[0].n) - Number(beforeBuckets[0].n), 101);

    const store = new MysqlAuthStore(pool);
    const origin = 'https://app.example.test';
    server = createApp({store, allowedOrigin:origin, authLimiter:new AuthRateLimiter(new MysqlRateLimitStore(pool),'a'.repeat(64))}).listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => { server!.once('listening',resolve); server!.once('error',reject); });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const post = (path:string, body:unknown, cookie?:string) => fetch(base + path, { method:'POST', headers:{'content-type':'application/json',origin,...(cookie?{cookie}:{})}, body:JSON.stringify(body) });
    const registered = await post('/api/auth/register',{email:'one@example.test',password:'test password only',displayName:'Cliente'});
    assert.equal(registered.status,201);
    const registeredData = await registered.json() as {id:string; passwordHash?:string};
    assert.equal(registeredData.passwordHash,undefined);
    const login = await post('/api/auth/login',{email:'one@example.test',password:'test password only'});
    assert.equal(login.status,200);
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie);
    assert.equal((await fetch(base+'/api/auth/me',{headers:{cookie}})).status,200);
    assert.equal((await post('/api/auth/logout',{},cookie)).status,204);
    assert.equal((await fetch(base+'/api/auth/me',{headers:{cookie}})).status,401);

    const business=randomUUID(), otherBusiness=randomUUID(), professional=randomUUID(), staffUser=randomUUID(), service=randomUUID(), otherService=randomUUID(), owner=randomUUID(), attacker=randomUUID();
    await pool.execute('INSERT INTO users(id,email,password_hash,display_name) VALUES (?,?,?,?),(?,?,?,?)',[owner,'owner@example.test','dummy','Owner',attacker,'attacker@example.test','dummy','Other']);
    await pool.execute('INSERT INTO businesses(id,name,timezone) VALUES (?,?,?),(?,?,?)',[business,'One','UTC',otherBusiness,'Two','UTC']);
    await pool.execute("INSERT INTO memberships(business_id,user_id,role,status) VALUES (?,?,'owner','active'),(?,?,'owner','active')",[business,owner,otherBusiness,attacker]);
    await pool.execute('INSERT INTO users(id,email,password_hash,display_name) VALUES (?,?,?,?)',[staffUser,'staff@example.test','disabled','Pro']);
    await pool.execute("INSERT INTO memberships(business_id,user_id,role) VALUES (?,?,'professional')",[business,staffUser]);
    await pool.execute('INSERT INTO professionals(id,business_id,user_id,display_name) VALUES (?,?,?,?)',[professional,business,staffUser,'Pro']);
    await pool.execute('INSERT INTO services(id,business_id,name,duration_minutes,price_cents,currency) VALUES (?,?,?,30,1500,?),(?,?,?,30,1500,?)',[service,business,'Cut','EUR',otherService,otherBusiness,'Other','EUR']);
    await assert.rejects(pool.execute('INSERT INTO professional_services(business_id,professional_id,service_id) VALUES (?,?,?)',[business,professional,otherService]));
    await pool.execute('INSERT INTO professional_services(business_id,professional_id,service_id) VALUES (?,?,?)',[business,professional,service]);
    for (let day=1; day<=7;day++) await pool.execute('INSERT INTO working_hours(id,business_id,professional_id,weekday,start_time,end_time) VALUES (?,?,?,?,?,?)',[randomUUID(),business,professional,day,'00:00:00','24:00:00']);
    const day = new Date(Date.now()+2*86400000); day.setUTCHours(12,0,0,0);
    const startAt=day.toISOString();
    const booking={actorId:registeredData.id,businessId:business,professionalId:professional,serviceId:service,startAt};
    await assert.rejects(createAppointment(pool as unknown as AppointmentPool,booking), /unavailable/i);
    await pool.execute('UPDATE businesses SET is_public=1 WHERE id=?',[business]);
    const target=pool as unknown as AppointmentPool;
    const outcomes=await Promise.allSettled([createAppointment(target,booking),createAppointment(target,booking)]);
    assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
    assert.equal(outcomes.filter(x=>x.status==='rejected').length,1);
    const [count]=await pool.execute<R[]>('SELECT COUNT(*) AS n FROM appointments WHERE professional_id=?',[professional]);
    assert.equal(count[0].n,1);
    const from=new Date(day.getTime()-86400000).toISOString(), to=new Date(day.getTime()+86400000).toISOString();
    assert.equal((await listProfessionalAgenda(target,{actorId:owner,businessId:business,professionalId:professional,from,to})).length,1);
    assert.equal((await listProfessionalAgenda(target,{actorId:staffUser,businessId:business,professionalId:professional,from,to})).length,1);
    await assert.rejects(listProfessionalAgenda(target,{actorId:attacker,businessId:business,professionalId:professional,from,to}), /Forbidden/);
  } finally {
    if (server) await new Promise<void>((resolve,reject)=>server!.close(e=>e?reject(e):resolve()));
    await pool.end();
  }
});

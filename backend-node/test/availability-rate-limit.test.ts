import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AvailabilityRateLimiter, MysqlAvailabilityRateStore} from '../src/appointments/rate-limit.js';

test('IP is HMAC-scoped and stored without the raw address',async()=>{
 let seen=''; const limiter=new AvailabilityRateLimiter({async consume(key){seen=key;return {allowed:true,retryAfter:0};}},'a'.repeat(64));
 assert.deepEqual(await limiter.check('192.0.2.123'),{allowed:true,retryAfter:0});
 assert.match(seen,/^[0-9a-f]{64}$/);assert.ok(!seen.includes('192.0.2.123'));
 await assert.rejects(limiter.check('')); assert.throws(()=>new AvailabilityRateLimiter({async consume(){return {allowed:true,retryAfter:0}}},'weak'));
});

test('MySQL limiter uses atomic bucket update, returns retry time, rolls back on failure',async()=>{
 const calls:string[]=[];let rolled=0,released=0,fail=false;
 const c={async beginTransaction(){},async commit(){},async rollback(){rolled++;},release(){released++;},async execute(sql:string){calls.push(sql);if(fail)throw new Error('db');if(sql.startsWith('SELECT'))return [[{attempts:31,retry_after:27}],[]];return [{affectedRows:1},[]];}};
 const store=new MysqlAvailabilityRateStore({async getConnection(){return c;}} as never);
 assert.deepEqual(await store.consume('a'.repeat(64)),{allowed:false,retryAfter:27});
 assert.ok(calls.some(s=>s.includes('INSERT INTO auth_rate_limits')&&s.includes('ON DUPLICATE KEY UPDATE')));
 fail=true;await assert.rejects(store.consume('a'.repeat(64)));assert.equal(rolled,1);assert.equal(released,2);
});

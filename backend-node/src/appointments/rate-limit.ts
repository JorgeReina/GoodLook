import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import type { Pool, RowDataPacket } from 'mysql2/promise';

export interface AvailabilityRateResult {allowed:boolean; retryAfter:number}
export interface AvailabilityLimitStore {consume(key:string):Promise<AvailabilityRateResult>}
export interface AvailabilityLimiter {check(ip:string):Promise<AvailabilityRateResult>}

/** IP digests are isolated from authentication buckets even when the secret is shared. */
export class AvailabilityRateLimiter implements AvailabilityLimiter {
 constructor(private readonly store:AvailabilityLimitStore,private readonly secret:string){
  if(!/^[a-f0-9]{64,}$/i.test(secret))throw new Error('AUTH_LIMIT_SECRET must have at least 32 bytes');
 }
 async check(ip:string):Promise<AvailabilityRateResult>{
  if(typeof ip!=='string'||!isIP(ip))throw new Error('Client address unavailable');
  const normalized=ip.toLowerCase().startsWith('::ffff:')&&isIP(ip.slice(7))===4?ip.slice(7):ip.toLowerCase();
  const key=createHmac('sha256',this.secret).update('availability-ip\0').update(normalized).digest('hex');
  return this.store.consume(key);
 }
}
interface Bucket extends RowDataPacket {attempts:number;retry_after:number}
/** Fixed window shared across instances using migration 004's HMAC-keyed table. */
export class MysqlAvailabilityRateStore implements AvailabilityLimitStore {
 constructor(private readonly pool:Pool){}
 async consume(key:string):Promise<AvailabilityRateResult>{
  if(!/^[a-f0-9]{64}$/.test(key))throw new Error('Invalid rate limit bucket');
  const c=await this.pool.getConnection();let active=false;
  try{
   await c.beginTransaction();active=true;
   await c.execute(`INSERT INTO auth_rate_limits (bucket_key,window_start,attempts) VALUES (?,UTC_TIMESTAMP(3),1) ON DUPLICATE KEY UPDATE attempts=IF(window_start<=UTC_TIMESTAMP(3)-INTERVAL 1 MINUTE,1,LEAST(attempts+1,31)),window_start=IF(window_start<=UTC_TIMESTAMP(3)-INTERVAL 1 MINUTE,UTC_TIMESTAMP(3),window_start)`,[key]);
   const [rows]=await c.execute<Bucket[]>(`SELECT attempts,GREATEST(1,CEIL(TIMESTAMPDIFF(MICROSECOND,UTC_TIMESTAMP(3),window_start+INTERVAL 1 MINUTE)/1000000)) AS retry_after FROM auth_rate_limits WHERE bucket_key=?`,[key]);
   const attempts=Number(rows[0]?.attempts),retryAfter=Number(rows[0]?.retry_after);
   if(!Number.isSafeInteger(attempts)||attempts<1||!Number.isSafeInteger(retryAfter)||retryAfter<1)throw new Error('Rate limit state unavailable');
   await c.commit();active=false;
   return {allowed:attempts<=30,retryAfter:attempts<=30?0:retryAfter};
  }catch(error){if(active){try{await c.rollback()}catch{}}throw error;}finally{c.release();}
 }
}

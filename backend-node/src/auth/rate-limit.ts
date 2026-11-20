import {createHmac} from 'node:crypto';
import type {Pool,RowDataPacket,ResultSetHeader} from 'mysql2/promise';
export interface RateResult {allowed:boolean;retryAfter:number}
export interface RateLimitStore {consume(keys:string[]):Promise<RateResult>}
export class AuthRateLimiter {
 constructor(private readonly store:RateLimitStore,private readonly secret:string){if(!/^[a-f0-9]{64,}$/i.test(secret))throw new Error('AUTH_LIMIT_SECRET must be a hex secret with at least 32 bytes');}
 async check(ip:string,email:unknown):Promise<RateResult>{
  if(!ip)throw new Error('Client address unavailable');
  const digest=(scope:string,value:string)=>createHmac('sha256',this.secret).update(scope).update('\0').update(value).digest('hex');
  const keys=[digest('ip',ip)];
  if(typeof email==='string'&&email.trim().length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) keys.push(digest('identity',email.trim().toLowerCase()));
  return this.store.consume(keys);
 }
}
interface Bucket extends RowDataPacket {attempts:number;retry_after:number}
export class MysqlRateLimitStore implements RateLimitStore {
 constructor(private readonly pool:Pool){}
 async consume(keys:string[]):Promise<RateResult>{
  if(keys.length<1||keys.length>2||keys.some(k=>!/^[a-f0-9]{64}$/.test(k)))throw new Error('Invalid rate limit buckets');
  // Keys have distinct HMAC namespaces. All requests lock IP first, then at
  // most one identity; no identity lock can be followed by an IP lock.
  if (keys.length === 2 && keys[0] === keys[1]) throw new Error('Rate limit buckets must be distinct');
  const buckets=keys.map((key,index)=>({key,limit:index===0?100:10}));
  const c=await this.pool.getConnection();let active=false;
  try {await c.beginTransaction();active=true;let allowed=true,retryAfter=0;
   for(const {key,limit} of buckets){
    await c.execute(`INSERT INTO auth_rate_limits (bucket_key,window_start,attempts) VALUES (?,UTC_TIMESTAMP(3),1) ON DUPLICATE KEY UPDATE attempts=IF(window_start<=UTC_TIMESTAMP(3)-INTERVAL 15 MINUTE,1,LEAST(attempts+1,101)),window_start=IF(window_start<=UTC_TIMESTAMP(3)-INTERVAL 15 MINUTE,UTC_TIMESTAMP(3),window_start)`,[key]);
    const [rows]=await c.execute<Bucket[]>(`SELECT attempts,GREATEST(1,CEIL(TIMESTAMPDIFF(MICROSECOND,UTC_TIMESTAMP(3),window_start+INTERVAL 15 MINUTE)/1000000)) AS retry_after FROM auth_rate_limits WHERE bucket_key=?`,[key]);
    if(!rows.length||!Number.isFinite(Number(rows[0].attempts))||!Number.isFinite(Number(rows[0].retry_after)))throw new Error('Rate limit state unavailable');
    if(Number(rows[0].attempts)>limit){allowed=false;retryAfter=Math.max(retryAfter,Number(rows[0].retry_after));break;}
   }
   await c.commit();active=false;return {allowed,retryAfter};
  }catch(e){if(active){try{await c.rollback()}catch{}}throw e;}finally{c.release()}
 }
 /** Delete one bounded batch only; schedule externally and repeat if needed. */
 async cleanupExpired():Promise<number>{
  const [result]=await this.pool.execute<ResultSetHeader>('DELETE FROM auth_rate_limits WHERE window_start < UTC_TIMESTAMP(3) - INTERVAL 24 HOUR ORDER BY window_start LIMIT 500');
  return result.affectedRows;
 }
}

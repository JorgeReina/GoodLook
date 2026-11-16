import { AppointmentError, type AppointmentPool } from './service.js';

export type AvailabilityPool = AppointmentPool;
export interface AvailabilityQuery {businessId:string; professionalId:string; serviceId:string; from:string; to:string}
interface Service {duration_minutes:number; timezone:string}
interface Hours {weekday:number; start_seconds:number; end_seconds:number}
interface Busy {start_at:Date|string; end_at:Date|string}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const step=15*60_000;
function timestamp(value:unknown):number {
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) throw new AppointmentError('invalid','Invalid time');
 const n=Date.parse(value); if(!Number.isFinite(n)||new Date(n).toISOString()!==value) throw new AppointmentError('invalid','Invalid time'); return n;
}
function sqlTime(n:number):string{return new Date(n).toISOString().replace('T',' ').replace('Z','');}
function dbTime(value:Date|string):number{
 const n = value instanceof Date ? value.valueOf() : Date.parse(value.replace(' ','T')+'Z');
 if(!Number.isFinite(n)) throw new Error('Invalid database time'); return n;
}
function unpack<T>(value:[unknown,unknown]):T[]{if(!Array.isArray(value[0]))throw new Error('Invalid database result');return value[0] as T[];}
function local(ms:number,fmt:Intl.DateTimeFormat){
 const date=new Date(ms), p=Object.fromEntries(fmt.formatToParts(date).map(x=>[x.type,x.value]));
 const weekday=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(p.weekday)+1;
 if(!weekday||!p.timeZoneName) throw new Error('Invalid local time');
 return {day:`${p.year}-${p.month}-${p.day}`,weekday,seconds:Number(p.hour)*3600+Number(p.minute)*60+Number(p.second)+date.getUTCMilliseconds()/1000,offset:p.timeZoneName};
}
/** An advisory snapshot; every slot must be revalidated atomically when booked. */
export async function publicAvailability(pool:AvailabilityPool,input:AvailabilityQuery,now:()=>number=Date.now){
 for(const value of [input.businessId,input.professionalId,input.serviceId]) if(typeof value!=='string'||!uuid.test(value)) throw new AppointmentError('invalid','Invalid identifier');
 const from=timestamp(input.from),to=timestamp(input.to), current=now();
 if(!Number.isFinite(current)||from>=to||to-from>7*86_400_000)throw new AppointmentError('invalid','Invalid range');
 const c=await pool.getConnection(); let begun=false;
 try{
  await c.beginTransaction();begun=true;
  const services=unpack<Service>(await c.query(`SELECT s.duration_minutes,b.timezone FROM services s JOIN businesses b ON b.id=s.business_id JOIN professional_services ps ON ps.business_id=s.business_id AND ps.service_id=s.id JOIN professionals p ON p.business_id=ps.business_id AND p.id=ps.professional_id WHERE b.id=? AND b.is_public=TRUE AND p.id=? AND p.active=TRUE AND s.id=? AND s.active=TRUE`,[input.businessId,input.professionalId,input.serviceId]));
  const service=services[0];
  if(!service||!Number.isSafeInteger(service.duration_minutes)||service.duration_minutes<=0)throw new AppointmentError('unavailable','Unavailable');
  let formatter:Intl.DateTimeFormat;
  try{formatter=new Intl.DateTimeFormat('en-GB',{timeZone:service.timezone,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'longOffset'});}catch{throw new AppointmentError('unavailable','Unavailable');}
  const hours=unpack<Hours>(await c.query('SELECT weekday,TIME_TO_SEC(start_time) AS start_seconds,TIME_TO_SEC(end_time) AS end_seconds FROM working_hours WHERE business_id=? AND professional_id=? LIMIT 101',[input.businessId,input.professionalId]));
  if(hours.length>100)throw new AppointmentError('unavailable','Unavailable');
  const busyRows=unpack<Busy>(await c.query("SELECT start_at,end_at FROM appointments WHERE business_id=? AND professional_id=? AND status IN ('booked','completed','no_show') AND start_at < ? AND end_at > ? LIMIT 5001",[input.businessId,input.professionalId,sqlTime(to),sqlTime(from)]));
  // Do not truncate occupied appointments: omitted rows could create false availability.
  if(busyRows.length>5000)throw new AppointmentError('unavailable','Unavailable');
  const busy=busyRows.map(b=>({start:dbTime(b.start_at),end:dbTime(b.end_at)})).sort((a,b)=>a.start-b.start||a.end-b.end);
  const merged:{start:number;end:number}[]=[];
  for(const interval of busy){
   if(interval.start>=interval.end)throw new Error('Invalid occupied interval');
   const last=merged[merged.length-1];
   if(last && interval.start<=last.end)last.end=Math.max(last.end,interval.end);
   else merged.push({...interval});
  }
  const duration=service.duration_minutes*60_000;
  const slots:{startAt:string;endAt:string}[]=[];
  let busyIndex=0;
  for(let start=Math.ceil(from/step)*step;start+duration<=to;start+=step){
   if(start<=current)continue;
   const end=start+duration,a=local(start,formatter),b=local(end,formatter);
   const nextDay=new Date(Date.parse(`${a.day}T00:00:00.000Z`)+86_400_000).toISOString().slice(0,10);
   const midnight=b.day===nextDay && b.seconds===0, endSeconds=midnight?86400:b.seconds;
   if(a.offset!==b.offset || (!midnight && (a.day!==b.day || a.weekday!==b.weekday)) || endSeconds<=a.seconds)continue;
   if(!hours.some(h=>Number(h.weekday)===a.weekday&&Number(h.start_seconds)<=a.seconds&&Number(h.end_seconds)>=endSeconds))continue;
   while(busyIndex<merged.length&&merged[busyIndex].end<=start)busyIndex++;
   if(busyIndex<merged.length&&merged[busyIndex].start<end)continue;
   slots.push({startAt:new Date(start).toISOString(),endAt:new Date(end).toISOString()});
  }
  await c.commit();begun=false;return {timezone:service.timezone,slots};
 }catch(e){if(begun){try{await c.rollback()}catch{}}throw e;}finally{c.release();}
}

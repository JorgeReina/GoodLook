import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicAvailability, type AvailabilityPool} from '../src/appointments/public-availability.js';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
class Connection {
 released=0; calls:{sql:string;params:readonly unknown[]}[]=[]; public=true; occupied:{start_at:Date|string;end_at:Date|string}[]=[];
 async beginTransaction(){} async commit(){} async rollback(){} release(){this.released++;}
 async query(sql:string,params:readonly unknown[]=[]):Promise<[unknown,unknown]>{
  this.calls.push({sql,params});
  if(sql.includes('FROM services s')) return [this.public?[{duration_minutes:30,timezone:'Europe/Madrid'}]:[],[]];
  if(sql.includes('FROM working_hours')) return [[{weekday:1,start_seconds:9*3600,end_seconds:18*3600},{weekday:7,start_seconds:0,end_seconds:86400}],[]];
  if(sql.includes('FROM appointments')) return [this.occupied,[]];
  throw new Error('Unexpected query');
 }
}
const pool=(c:Connection):AvailabilityPool=>({getConnection:async()=>c});
const req={businessId:id(1),professionalId:id(2),serviceId:id(3),from:'2030-01-07T09:00:00.000Z',to:'2030-01-07T11:00:00.000Z'};
const clock=()=>Date.parse('2030-01-01T00:00:00.000Z');
test('returns future 15 minute candidates within working hours that avoid occupied intervals',async()=>{
 const c=new Connection(); c.occupied=[{start_at:'2030-01-07 09:30:00.000',end_at:'2030-01-07 10:00:00.000'}];
 const actual=await publicAvailability(pool(c),req,clock);
 assert.deepEqual(actual.slots.map(s=>s.startAt),['2030-01-07T09:00:00.000Z','2030-01-07T10:00:00.000Z','2030-01-07T10:15:00.000Z','2030-01-07T10:30:00.000Z']);
 assert.equal(c.released,1);assert.equal(JSON.stringify(actual).includes('customer'),false);
 const q=c.calls.find(x=>x.sql.includes('FROM appointments'))!; assert.ok(q.sql.includes('business_id')&&q.sql.includes('professional_id')); assert.ok(!q.sql.includes('notes'));
});
test('returns generic unavailable for unpublished business, unknown service or non-matching professional',async()=>{
 const c=new Connection();c.public=false;await assert.rejects(publicAvailability(pool(c),req,clock),/unavailable/i);assert.equal(c.released,1);
});
test('validates identifiers, dates and range before querying',async()=>{
 for(const changed of [{businessId:'bad'},{from:'invalid'},{to:'2030-02-07T11:00:00.000Z'},{to:req.from}]){const c=new Connection();await assert.rejects(publicAvailability(pool(c),{...req,...changed},clock));assert.equal(c.calls.length,0);}
});
test('omits a slot that spans DST offset change but returns slots after it',async()=>{
 const c=new Connection(); const r=await publicAvailability(pool(c),{...req,from:'2030-03-31T00:15:00.000Z',to:'2030-03-31T01:45:00.000Z'},clock);
 assert.ok(!r.slots.some(s=>s.startAt==='2030-03-31T00:30:00.000Z'));
 assert.ok(r.slots.some(s=>s.startAt==='2030-03-31T01:00:00.000Z'));
});

test('fails closed instead of returning slots if too many occupied appointments are found',async()=>{
 const c=new Connection();c.occupied=Array.from({length:5001},()=>({start_at:'2030-01-07 09:30:00.000',end_at:'2030-01-07 10:00:00.000'}));
 await assert.rejects(publicAvailability(pool(c),req,clock),/unavailable/i);
});
test('repeated local time at DST fall-back is returned as distinct UTC instants',async()=>{
 const c=new Connection();const r=await publicAvailability(pool(c),{...req,from:'2030-10-27T00:00:00.000Z',to:'2030-10-27T02:00:00.000Z'},clock);
 assert.ok(r.slots.some(s=>s.startAt==='2030-10-27T00:00:00.000Z'));
 assert.ok(r.slots.some(s=>s.startAt==='2030-10-27T01:00:00.000Z'));
});

test('merged unordered busy intervals give same result as a naive overlap oracle',async()=>{
 const c=new Connection();
 const base=Date.parse(req.from);
 const occupied=[{start:45,end:70},{start:10,end:25},{start:12,end:18},{start:25,end:40},{start:100,end:110},{start:39,end:50}];
 c.occupied=occupied.map(x=>({start_at:new Date(base+x.start*60000),end_at:new Date(base+x.end*60000)}));
 const actual=await publicAvailability(pool(c),req,clock);
 const expected=[];for(let min=0;min+30<=120;min+=15)if(!occupied.some(x=>min<x.end&&x.start<min+30))expected.push(new Date(base+min*60000).toISOString());
 assert.deepEqual(actual.slots.map(s=>s.startAt),expected);
});

test('availability slots start on the UTC 15-minute grid even when the window does not',async()=>{
 const c=new Connection();
 const r=await publicAvailability(pool(c),{...req,from:'2030-01-07T09:07:03.123Z',to:'2030-01-07T11:00:00.000Z'},clock);
 assert.ok(r.slots.length>0);
 for(const slot of r.slots){
  assert.equal(Date.parse(slot.startAt)%900_000,0,slot.startAt);
  assert.match(slot.startAt,/T\d\d:(00|15|30|45):00\.000Z$/);
 }
});

test('availability fails closed when too many weekly hours exist',async()=>{
 const c=new Connection();const original=c.query.bind(c);
 c.query=async(sql,params)=>sql.includes('FROM working_hours')?[Array.from({length:101},()=>({weekday:1,start_seconds:0,end_seconds:86400})),[]]:original(sql,params);
 await assert.rejects(publicAvailability(pool(c),req,clock),/unavailable/i);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CatalogService, CatalogError } from '../src/catalog/service.js';
import type { CatalogStore } from '../src/catalog/service.js';
const actor='4c95e891-d8b5-40cb-93c9-b1429db9a71d', business='231c2e85-cba6-44e3-a803-fac58a3f7ff4', professional='b1ca7e0e-b0b4-49ac-a311-fe23403cfc43', service='d5502df6-1f29-47b8-8af4-d2101326580f';
let calls: unknown[][] = [];
const repo: CatalogStore = {
 async createBusiness(a,n,t){calls.push(['createBusiness',a,n,t]);return {id:business,name:n,timezone:t,isPublic:false}}, async listBusinesses(){return []}, async getHours(){return []},
 async list(b){calls.push(['list',b]);return []},
 async create(a,b,v){calls.push(['create',a,b,v]);return {id:service,businessId:b,...v}},
 async assign(a,b,p,s){calls.push(['assign',a,b,p,s])},
 async setHours(a,b,p,h){calls.push(['hours',a,b,p,h])},
};
const sut = new CatalogService(repo);
test('validates and normalizes service, using integer cents and duration', async()=>{
 calls=[]; const result=await sut.create(actor,business,{name:' Corte ',durationMinutes:30,priceCents:1250,currency:'eur'});
 assert.equal(result.name,'Corte');assert.equal(result.currency,'EUR');assert.deepEqual(calls[0].slice(0,3),['create',actor,business]);
 for (const input of [{name:'',durationMinutes:30,priceCents:1,currency:'EUR'},{name:'X',durationMinutes:0,priceCents:1,currency:'EUR'},{name:'X',durationMinutes:30,priceCents:1.2,currency:'EUR'},{name:'X',durationMinutes:30,priceCents:-1,currency:'EUR'},{name:'X',durationMinutes:30,priceCents:1,currency:'€'}]) await assert.rejects(()=>sut.create(actor,business,input),CatalogError);
});
test('schedules reject malformed, overlapping and reversed ranges',async()=>{
 calls=[];await sut.setHours(actor,business,professional,[{weekday:1,startTime:'09:00',endTime:'12:00'},{weekday:1,startTime:'12:00',endTime:'14:00'}]);assert.equal(calls.length,1);
 for(const h of [[{weekday:0,startTime:'09:00',endTime:'10:00'}],[{weekday:1,startTime:'25:00',endTime:'26:00'}],[{weekday:1,startTime:'10:00',endTime:'09:00'}],[{weekday:1,startTime:'09:00',endTime:'11:00'},{weekday:1,startTime:'10:00',endTime:'12:00'}]]) await assert.rejects(()=>sut.setHours(actor,business,professional,h),CatalogError);
});
test('tenant and professional identifiers are validated',async()=>{
 await assert.rejects(()=>sut.assign(actor,'bad',professional,service),CatalogError);
 await assert.rejects(()=>sut.list('bad'),CatalogError);
 await sut.assign(actor,business,professional,service);assert.deepEqual(calls.at(-1),['assign',actor,business,professional,service]);
});
test('business creation validates name and IANA timezone before touching store',async()=>{calls=[];const result=await sut.createBusiness(actor,{name:' Salon ',timezone:'Europe/Madrid'});assert.equal(result.name,'Salon');assert.equal(result.isPublic,false);assert.deepEqual(calls[0],['createBusiness',actor,'Salon','Europe/Madrid']);for(const input of [{name:'',timezone:'UTC'},{name:'Test',timezone:'No/Such_Zone'},{name:'Test',timezone:'UTC '.repeat(40)},{name:'a'.repeat(161),timezone:'UTC'}])await assert.rejects(()=>sut.createBusiness(actor,input),CatalogError);});

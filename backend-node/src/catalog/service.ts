export interface ServiceData { name:string; durationMinutes:number; priceCents:number; currency:string }
export interface CatalogItem extends ServiceData { id:string; businessId:string }
export interface WorkPeriod { weekday:number; startTime:string; endTime:string }
export interface CatalogStore {
 list(businessId:string):Promise<CatalogItem[]>;
 create(actorId:string,businessId:string,data:ServiceData):Promise<CatalogItem>;
 assign(actorId:string,businessId:string,professionalId:string,serviceId:string):Promise<void>;
 setHours(actorId:string,businessId:string,professionalId:string,hours:WorkPeriod[]):Promise<void>;
 listBusinesses():Promise<{id:string;name:string;timezone:string}[]>;
 createBusiness(actorId:string,name:string,timezone:string):Promise<{id:string;name:string;timezone:string;isPublic:false}>;
 setVisibility(actorId:string,businessId:string,published:boolean):Promise<void>;
 getHours(actorId:string,businessId:string,professionalId:string):Promise<WorkPeriod[]>;
}
export class CatalogError extends Error { constructor(public readonly code:'invalid'|'forbidden'|'not_found') { super(code); } }
function id(value:unknown):string { if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new CatalogError('invalid'); return value.toLowerCase(); }
function minutes(v:unknown, end=false):number { if(typeof v!=='string'||!/^\d\d:\d\d$/.test(v)) throw new CatalogError('invalid'); const [h,m]=v.split(':').map(Number); if(m>59||h>24||(h===24&&(!end||m!==0))) throw new CatalogError('invalid'); return h*60+m; }
export class CatalogService {
 constructor(private readonly store:CatalogStore) {}
 async listBusinesses(){return this.store.listBusinesses();}
 async createBusiness(actor:unknown,input:unknown){const a=id(actor);if(typeof input!=='object'||input===null)throw new CatalogError('invalid');const {name,timezone}=input as Record<string,unknown>;if(typeof name!=='string'||!name.trim()||Array.from(name.trim()).length>160||typeof timezone!=='string'||timezone.length>64||!(/^[A-Za-z0-9_+\/-]+$/.test(timezone)))throw new CatalogError('invalid');try{new Intl.DateTimeFormat('en',{timeZone:timezone})}catch{throw new CatalogError('invalid')}return this.store.createBusiness(a,name.trim(),timezone);}
 async setVisibility(actor:unknown,business:unknown,published:unknown){const a=id(actor),b=id(business);if(typeof published!=='boolean')throw new CatalogError('invalid');return this.store.setVisibility(a,b,published);}
 async list(business:unknown) { return this.store.list(id(business)); }
 async getHours(actor:unknown,business:unknown,professional:unknown){return this.store.getHours(id(actor),id(business),id(professional));}
 async create(actor:unknown,business:unknown,input:unknown) {
  const a=id(actor),b=id(business); if(typeof input!=='object'||input===null) throw new CatalogError('invalid');
  const {name,durationMinutes,priceCents,currency}=input as Record<string,unknown>;
  if(typeof name!=='string'||!name.trim()||Array.from(name.trim()).length>160||!Number.isSafeInteger(durationMinutes)||Number(durationMinutes)<1||Number(durationMinutes)>65535||!Number.isSafeInteger(priceCents)||Number(priceCents)<0||Number(priceCents)>4294967295||typeof currency!=='string'||!/^[a-z]{3}$/i.test(currency)) throw new CatalogError('invalid');
  return this.store.create(a,b,{name:name.trim(),durationMinutes:Number(durationMinutes),priceCents:Number(priceCents),currency:currency.toUpperCase()});
 }
 async assign(actor:unknown,business:unknown,professional:unknown,service:unknown) { return this.store.assign(id(actor),id(business),id(professional),id(service)); }
 async setHours(actor:unknown,business:unknown,professional:unknown,input:unknown) {
  const a=id(actor),b=id(business),p=id(professional); if(!Array.isArray(input)||input.length>100) throw new CatalogError('invalid');
  const periods=input.map(value=>{ if(typeof value!=='object'||value===null) throw new CatalogError('invalid'); const {weekday,startTime,endTime}=value as Record<string,unknown>; if(!Number.isInteger(weekday)||Number(weekday)<1||Number(weekday)>7) throw new CatalogError('invalid');const start=minutes(startTime),end=minutes(endTime,true);if(start>=end) throw new CatalogError('invalid'); return {weekday:Number(weekday),startTime:startTime as string,endTime:endTime as string,start,end};});
  periods.sort((x,y)=>x.weekday-y.weekday||x.start-y.start);for(let i=1;i<periods.length;i++) if(periods[i].weekday===periods[i-1].weekday&&periods[i].start<periods[i-1].end) throw new CatalogError('invalid');
  return this.store.setHours(a,b,p,periods.map(({weekday,startTime,endTime})=>({weekday,startTime,endTime})));
 }
}

import {Router,type Request,type Response,type NextFunction} from 'express';
import type {AuthStore,User} from '../auth/store.js';import {sessionUser} from '../auth/routes.js';import {CatalogError,type CatalogService} from './service.js';
import { managementStatus } from '../product/management-routes.js';
import { ManagementError, type ManagementService } from '../product/management-service.js';
import { PRIVATE_NO_STORE, PUBLIC_CATALOG_CACHE } from '../http/cache-control.js';
export function catalogRoutes(auth:AuthStore,origin:string,catalog:CatalogService,management?:ManagementService):Router {
 const router=Router();router.use((_req,res,next)=>{res.setHeader('Cache-Control',PRIVATE_NO_STORE);next();});
 async function session(req:Request,res:Response,write:boolean):Promise<User|null>{if(write&&req.headers.origin!==origin){res.status(403).json({error:'Forbidden origin'});return null}const user=await sessionUser(req,auth);if(!user){res.status(401).json({error:'Unauthorized'});return null}return user;}
 router.post('/businesses',async(req,res,next)=>{try{const user=await session(req,res,true);if(!user)return;res.status(201).json(await catalog.createBusiness(user.id,req.body))}catch(e){next(e)}});
 router.get('/businesses',async(req,res,next)=>{try{const body=await catalog.listBusinesses(req.query);res.setHeader('Cache-Control',PUBLIC_CATALOG_CACHE);res.json(body)}catch(e){next(e)}});
 router.put('/businesses/visibility',async(req,res,next)=>{try{const user=await session(req,res,true);if(!user)return;const b=req.body??{};if(management)await management.setVisibility(user.id,b.businessId,b);else await catalog.setVisibility(user.id,b.businessId,b.isPublic);res.status(204).end()}catch(e){next(e)}});
 router.get('/services',async(req,res,next)=>{try{const body=await catalog.list(req.query.businessId,req.query);res.setHeader('Cache-Control',PUBLIC_CATALOG_CACHE);res.json(body)}catch(e){next(e)}});
 router.post('/services',async(req,res,next)=>{try{const user=await session(req,res,true);if(!user)return;const b=req.body??{};res.status(201).json(await catalog.create(user.id,b.businessId,b))}catch(e){next(e)}});
 router.post('/services/assign',async(req,res,next)=>{try{const user=await session(req,res,true);if(!user)return;const b=req.body??{};await catalog.assign(user.id,b.businessId,b.professionalId,b.serviceId);res.status(204).end()}catch(e){next(e)}});
 router.get('/schedules',async(req,res,next)=>{try{const user=await session(req,res,false);if(!user)return;res.json(await catalog.getHours(user.id,req.query.businessId,req.query.professionalId))}catch(e){next(e)}});
 router.put('/schedules',async(req,res,next)=>{try{const user=await session(req,res,true);if(!user)return;const b=req.body??{};if(management)await management.setHours(user.id,b.businessId,b.professionalId,b,req.get('X-GoodLook-Impact'));else await catalog.setHours(user.id,b.businessId,b.professionalId,b.hours);res.status(204).end()}catch(e){next(e)}});
 router.use((e:unknown,_req:Request,res:Response,next:NextFunction)=>{
  if(e instanceof ManagementError){res.status(managementStatus(e)).json({error:e.code==='invalid_input'?'invalid':e.code,...e.impact});return;}
  if(!(e instanceof CatalogError)){next(e);return}
  res.status({invalid:400,forbidden:403,not_found:404}[e.code]).json({error:e.code});
 });return router;
}

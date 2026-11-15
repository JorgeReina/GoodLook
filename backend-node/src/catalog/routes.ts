import {Router,type Request,type Response,type NextFunction} from 'express';
import type {AuthStore,User} from '../auth/store.js';import {sessionUser} from '../auth/routes.js';import {CatalogError,type CatalogService} from './service.js';
export function catalogRoutes(auth:AuthStore,origin:string,catalog:CatalogService):Router {
 const router=Router();router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
 async function session(req:Request,res:Response,write:boolean):Promise<User|null>{if(write&&req.headers.origin!==origin){res.status(403).json({error:'Forbidden origin'});return null}const user=await sessionUser(req,auth);if(!user){res.status(401).json({error:'Unauthorized'});return null}return user;}
 router.post('/businesses',async(req,res,next)=>{try{const user=await session(req,res,true);if(!user)return;res.status(201).json(await catalog.createBusiness(user.id,req.body))}catch(e){next(e)}});
 router.get('/businesses',async(_req,res,next)=>{try{res.json(await catalog.listBusinesses())}catch(e){next(e)}});
 router.put('/businesses/visibility',async(req,res,next)=>{try{const user=await session(req,res,true);if(!user)return;const b=req.body??{};await catalog.setVisibility(user.id,b.businessId,b.isPublic);res.status(204).end()}catch(e){next(e)}});
 router.get('/services',async(req,res,next)=>{try{res.json(await catalog.list(req.query.businessId))}catch(e){next(e)}});
 router.post('/services',async(req,res,next)=>{try{const user=await session(req,res,true);if(!user)return;const b=req.body??{};res.status(201).json(await catalog.create(user.id,b.businessId,b))}catch(e){next(e)}});
 router.post('/services/assign',async(req,res,next)=>{try{const user=await session(req,res,true);if(!user)return;const b=req.body??{};await catalog.assign(user.id,b.businessId,b.professionalId,b.serviceId);res.status(204).end()}catch(e){next(e)}});
 router.get('/schedules',async(req,res,next)=>{try{const user=await session(req,res,false);if(!user)return;res.json(await catalog.getHours(user.id,req.query.businessId,req.query.professionalId))}catch(e){next(e)}});
 router.put('/schedules',async(req,res,next)=>{try{const user=await session(req,res,true);if(!user)return;const b=req.body??{};await catalog.setHours(user.id,b.businessId,b.professionalId,b.hours);res.status(204).end()}catch(e){next(e)}});
 router.use((e:unknown,_req:Request,res:Response,next:NextFunction)=>{if(!(e instanceof CatalogError)){next(e);return}res.status({invalid:400,forbidden:403,not_found:404}[e.code]).json({error:e.code});});return router;
}

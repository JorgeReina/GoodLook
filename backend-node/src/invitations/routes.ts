import { Router, type Request, type Response, type NextFunction } from 'express';
import type { AuthStore } from '../auth/store.js';
import { sessionUser } from '../auth/routes.js';
import { InvitationError, type InvitationService } from './service.js';
export function invitationRoutes(store:AuthStore,origin:string,service:InvitationService):Router {
 const r=Router();
 r.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store'); next();});
 r.use((req,res,next)=>{if(req.headers.origin!==origin){res.status(403).json({error:'Forbidden origin'});return;}next();});
 r.post('/',async (req,res,next)=>{try {const user=await sessionUser(req,store); if(!user){res.status(401).json({error:'Unauthorized'});return;} const {businessId,professionalId}=req.body??{}; const invite=await service.issue(user.id,businessId,professionalId); res.status(201).json(invite);}catch(e){next(e);}});
 r.post('/accept',async (req,res,next)=>{try {const user=await sessionUser(req,store); if(!user){res.status(401).json({error:'Unauthorized'});return;} await service.accept(user.id,req.body?.token);res.status(204).end();}catch(e){next(e);}});
 r.use((e:unknown,_req:Request,res:Response,next:NextFunction)=>{if(!(e instanceof InvitationError)){next(e);return;}res.status(e.code==='invalid_input'?400:403).json({error:e.code});});
 return r;
}

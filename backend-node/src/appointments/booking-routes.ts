import { Router } from 'express';
import { sessionUser } from '../auth/routes.js';
import type { AuthStore } from '../auth/store.js';
import type { AppointmentHandlers } from './routes.js';
import { AppointmentError } from './service.js';

export function bookingRoutes(store:AuthStore, origin:string, book:NonNullable<AppointmentHandlers['book']>) {
  const router=Router();
  router.post('/',async(req,res,next)=>{
    res.setHeader('Cache-Control','no-store');
    try {
      if(req.headers.origin!==origin) {res.status(403).json({code:'forbidden'}); return;}
      const user=await sessionUser(req,store);
      if(!user) {res.status(401).json({code:'unauthenticated'}); return;}
      const {businessId,professionalId,serviceId,startAt,notes,quote}=req.body??{};
      const result=await book({actorId:user.id,requestKey:req.get('Idempotency-Key')??'',businessId,professionalId,serviceId,startAt,notes,quote});
      res.status(result.replayed?200:201).json(result.appointment);
    } catch(error) {
      if(!(error instanceof AppointmentError)) {next(error);return;}
      if (error.code === 'invalid') { res.status(400).json({ code: 'invalid_input' }); return; }
      res.status(409).json({code:error.code,...(error.quote?{quote:error.quote}:{})});
    }
  });
  return router;
}

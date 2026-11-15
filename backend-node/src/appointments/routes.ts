import { Router } from 'express';
import type { AuthStore } from '../auth/store.js';
import { sessionUser } from '../auth/routes.js';
import { AppointmentError, createAppointment, listProfessionalAgenda } from './service.js';

type CreateInput = Parameters<typeof createAppointment>[1];
type AgendaInput = Parameters<typeof listProfessionalAgenda>[1];
export interface AppointmentHandlers {
  create(input: CreateInput): Promise<unknown>;
  agenda(input: AgendaInput): Promise<unknown>;
  mine?(input: { actorId: string; from: string; to: string }): Promise<unknown>;
}
function queryString(value: unknown): string { return typeof value === 'string' ? value : ''; }
export function appointmentRoutes(store: AuthStore, allowedOrigin: string, handlers: AppointmentHandlers): Router {
  const router = Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.post('/', async (req, res, next) => {
    try {
      if (req.headers.origin !== allowedOrigin) { res.status(403).json({error:'Forbidden origin'}); return; }
      const user = await sessionUser(req, store);
      if (!user) { res.status(401).json({error:'Unauthorized'}); return; }
      const { businessId, professionalId, serviceId, startAt, notes } = req.body ?? {};
      const result = await handlers.create({actorId:user.id, businessId, professionalId, serviceId, startAt, notes});
      res.status(201).json(result);
    } catch (error) { next(error); }
  });
  router.get('/me', async (req, res, next) => {
    try {
      const user = await sessionUser(req, store);
      if (!user) { res.status(401).json({error:'Unauthorized'}); return; }
      if (!handlers.mine) { res.status(503).json({error:'Unavailable'}); return; }
      const result = await handlers.mine({actorId:user.id, from:queryString(req.query.from), to:queryString(req.query.to)});
      res.json(result);
    } catch (error) { next(error); }
  });
  router.get('/agenda', async (req, res, next) => {
    try {
      const user = await sessionUser(req, store);
      if (!user) { res.status(401).json({error:'Unauthorized'}); return; }
      const result = await handlers.agenda({actorId:user.id, businessId:queryString(req.query.businessId), professionalId:queryString(req.query.professionalId), from:queryString(req.query.from), to:queryString(req.query.to)});
      res.json(result);
    } catch (error) { next(error); }
  });
  router.use((error: unknown, _req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) => {
    if (!(error instanceof AppointmentError)) { next(error); return; }
    const status = {invalid:400, unavailable:422, conflict:409, forbidden:403}[error.code];
    res.status(status).json({error:error.code});
  });
  return router;
}

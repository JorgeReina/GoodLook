import { Router } from 'express';
import type { AuthStore } from '../auth/store.js';
import { sessionUser } from '../auth/routes.js';
import { AppointmentError, createAppointment, listProfessionalAgenda } from './service.js';
import type { AvailabilityQuery } from './public-availability.js';
import type { AvailabilityLimiter } from './rate-limit.js';

type CreateInput = Parameters<typeof createAppointment>[1];
type AgendaInput = Parameters<typeof listProfessionalAgenda>[1];
export interface AppointmentHandlers {
  create(input: CreateInput): Promise<unknown>;
  agenda(input: AgendaInput): Promise<unknown>;
  mine?(input: { actorId: string; from: string; to: string }): Promise<unknown>;
  availability?(input: AvailabilityQuery): Promise<unknown>;
}
function queryString(value: unknown): string { return typeof value === 'string' ? value : ''; }
export function appointmentRoutes(store: AuthStore, allowedOrigin: string, handlers: AppointmentHandlers, availabilityLimiter?: AvailabilityLimiter): Router {
  const router = Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.get('/availability', async (req, res, next) => {
    try {
      if (!handlers.availability) { res.status(503).json({error:'Unavailable'}); return; }
      // Do not trust X-Forwarded-For; socket address may be a reverse proxy.
      if (!availabilityLimiter || !req.socket.remoteAddress) { res.status(503).json({error:'Unavailable'}); return; }
      let rate;
      try { rate=await availabilityLimiter.check(req.socket.remoteAddress); }
      catch { res.status(503).json({error:'Unavailable'}); return; }
      if (!rate || typeof rate.allowed !== 'boolean' || (!rate.allowed && (!Number.isSafeInteger(rate.retryAfter) || rate.retryAfter < 1))) { res.status(503).json({error:'Unavailable'}); return; }
      if (!rate.allowed) { res.setHeader('Retry-After',String(rate.retryAfter)); res.status(429).json({error:'Too many requests'}); return; }
      const result = await handlers.availability({businessId:queryString(req.query.businessId), professionalId:queryString(req.query.professionalId), serviceId:queryString(req.query.serviceId), from:queryString(req.query.from), to:queryString(req.query.to)});
      res.json(result);
    } catch (error) { next(error); }
  });
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

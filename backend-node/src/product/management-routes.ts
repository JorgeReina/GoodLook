import { Router, type Request, type RequestHandler } from 'express';
import { sessionUser } from '../auth/routes.js';
import type { AuthStore } from '../auth/store.js';
import { ManagementError, type ManagementService } from './management-service.js';

export function managementStatus(error: ManagementError) {
  if (error.code === 'invalid_input') return 400;
  if (error.code === 'forbidden') return 403;
  if (error.code === 'not_found') return 404;
  return 409;
}

export function managementRoutes(auth: AuthStore, origin: string, service: ManagementService) {
  const router = Router();
  const endpoint = (status: 200 | 201 | 204, call: (actor: string, req: Request, token?: string) => Promise<unknown>): RequestHandler =>
    async (req, res, next) => {
      res.setHeader('Cache-Control', 'no-store');
      try {
        if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers.origin !== origin) {
          res.status(403).json({ code: 'forbidden' });
          return;
        }
        const user = await sessionUser(req, auth);
        if (!user) {
          res.status(401).json({ code: 'unauthenticated' });
          return;
        }
        const value = await call(user.id, req, req.get('X-GoodLook-Impact'));
        if (status === 204) res.status(status).end();
        else res.status(status).json(value);
      } catch (error) {
        if (!(error instanceof ManagementError)) { next(error); return; }
        res.status(managementStatus(error)).json({ code: error.code, ...error.impact });
      }
    };

  router.post('/', endpoint(201, (actor, req) => service.createBusiness(actor, req.body)));
  router.get('/:id', endpoint(200, (actor, req) => service.get(actor, req.params.id)));
  router.patch('/:id/profile', endpoint(204, (actor, req) => service.patchProfile(actor, req.params.id, req.body)));
  router.put('/:id/visibility', endpoint(204, (actor, req) => service.setVisibility(actor, req.params.id, req.body)));
  router.post('/:id/services', endpoint(201, (actor, req) => service.createService(actor, req.params.id, req.body)));
  router.patch('/:id/services/:serviceId', endpoint(204, (actor, req, token) => service.patchService(actor, req.params.id, req.params.serviceId, req.body, token)));
  router.post('/:id/staff', endpoint(201, (actor, req) => service.createStaff(actor, req.params.id, req.body)));
  router.patch('/:id/staff/:professionalId', endpoint(204, (actor, req, token) => service.patchStaff(actor, req.params.id, req.params.professionalId, req.body, token)));
  router.put('/:id/staff/:professionalId/services', endpoint(204, (actor, req, token) => service.setAssignments(actor, req.params.id, req.params.professionalId, req.body, token)));
  router.get('/:id/staff/:professionalId/hours', endpoint(200, (actor, req) => service.getHours(actor, req.params.id, req.params.professionalId)));
  router.put('/:id/staff/:professionalId/hours', endpoint(204, (actor, req, token) => service.setHours(actor, req.params.id, req.params.professionalId, req.body, token)));
  router.get('/:id/staff/:professionalId/closures', endpoint(200, (actor, req) => service.getClosures(actor, req.params.id, req.params.professionalId)));
  router.post('/:id/staff/:professionalId/closures', endpoint(201, (actor, req, token) => service.createClosure(actor, req.params.id, req.params.professionalId, req.body, token)));
  router.delete('/:id/staff/:professionalId/closures/:closureId', endpoint(204, (actor, req) => service.deleteClosure(actor, req.params.id, req.params.professionalId, req.params.closureId)));
  return router;
}

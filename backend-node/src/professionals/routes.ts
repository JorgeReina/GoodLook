import { Router, type Request, type Response, type NextFunction } from 'express';
import type { AuthStore } from '../auth/store.js';
import { sessionUser } from '../auth/routes.js';
import { ProfessionalError, type ProfessionalService } from './service.js';

export function professionalRoutes(store: AuthStore, allowedOrigin: string, service: ProfessionalService): Router {
  const router = Router();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.get('/', async (req, res, next) => {
    try {
      const list = await service.listActive(req.query.businessId);
      res.json(list.map(({id, businessId, displayName}) => ({id, businessId, displayName})));
    } catch (error) { next(error); }
  });
  router.post('/', async (req, res, next) => {
    try {
      if (req.headers.origin !== allowedOrigin) { res.status(403).json({error:'Forbidden origin'}); return; }
      const user = await sessionUser(req, store);
      if (!user) { res.status(401).json({error:'Unauthorized'}); return; }
      const {businessId, displayName} = req.body ?? {};
      const professional = await service.create(user.id, businessId, displayName);
      res.status(201).json({id:professional.id,businessId:professional.businessId,displayName:professional.displayName});
    } catch (error) { next(error); }
  });
  router.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (!(error instanceof ProfessionalError)) { next(error); return; }
    res.status(error.code === 'invalid_input' ? 400 : 403).json({error:error.code});
  });
  return router;
}

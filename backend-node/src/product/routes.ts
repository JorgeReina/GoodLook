import { Router } from 'express';
import { sessionUser } from '../auth/routes.js';
import type { AuthStore } from '../auth/store.js';
import type { MembershipStore } from './membership-store.js';

export function membershipRoutes(auth: AuthStore, memberships: MembershipStore): Router {
  const router = Router();
  router.get('/memberships', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const user = await sessionUser(req, auth);
      if (!user) {
        res.status(401).json({ code: 'unauthenticated' });
        return;
      }
      res.json(await memberships.listMemberships(user.id));
    } catch {
      res.status(500).json({ code: 'internal_error' });
    }
  });
  return router;
}

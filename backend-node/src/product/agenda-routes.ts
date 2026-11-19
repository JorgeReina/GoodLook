import { Router } from 'express';
import { sessionUser } from '../auth/routes.js';
import type { AuthStore } from '../auth/store.js';
import { agendaId, AgendaInputError, agendaMonday, agendaTimestamp, type AgendaStore } from './agenda-store.js';

export function agendaRoutes(auth: AuthStore, store: AgendaStore): Router {
  const router = Router();
  router.get('/agenda', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const actor = await sessionUser(req, auth);
      if (!actor) {
        res.status(401).json({ code: 'unauthenticated' });
        return;
      }
      const { businessId, professionalId, weekStart } = req.query;
      const week = await store.week(actor.id, agendaId(businessId), agendaId(professionalId), agendaMonday(weekStart));
      if (!week) {
        res.status(403).json({ code: 'forbidden' });
        return;
      }
      res.json(week);
    } catch (error) {
      if (error instanceof AgendaInputError) res.status(400).json({ code: error.code });
      else res.status(500).json({ code: 'internal_error' });
    }
  });

  router.get('/me/bookings', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const actor = await sessionUser(req, auth);
      if (!actor) {
        res.status(401).json({ code: 'unauthenticated' });
        return;
      }
      const { cursor } = req.query;
      const from = agendaTimestamp(req.query.from);
      const to = agendaTimestamp(req.query.to);
      if (from >= to || to - from > 31 * 86_400_000 || (cursor !== undefined && typeof cursor !== 'string')) {
        throw new AgendaInputError();
      }
      res.json(await store.bookings(actor.id, from, to, cursor));
    } catch (error) {
      if (error instanceof AgendaInputError) res.status(400).json({ code: error.code });
      else res.status(500).json({ code: 'internal_error' });
    }
  });
  return router;
}

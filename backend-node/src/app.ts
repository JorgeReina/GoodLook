import express, { type ErrorRequestHandler } from 'express';
import { authRoutes } from './auth/routes.js';
import type { AuthStore } from './auth/store.js';
import { bookingRoutes } from './appointments/booking-routes.js';
import { appointmentRoutes, type AppointmentHandlers } from './appointments/routes.js';
import { professionalRoutes } from './professionals/routes.js';
import type { ProfessionalService } from './professionals/service.js';
import { invitationRevocationRoute, invitationRoutes } from './invitations/routes.js';
import type { InvitationService } from './invitations/service.js';
import { catalogRoutes } from './catalog/routes.js';
import type { CatalogService } from './catalog/service.js';
import type { AuthRateLimiter } from './auth/rate-limit.js';
import type { AvailabilityLimiter } from './appointments/rate-limit.js';
import type { MembershipStore } from './product/membership-store.js';
import { membershipRoutes } from './product/routes.js';
import { managementRoutes } from './product/management-routes.js';
import type { ManagementService } from './product/management-service.js';
import { agendaRoutes } from './product/agenda-routes.js';
import type { AgendaStore } from './product/agenda-store.js';

export function createApp(options?: { store: AuthStore; allowedOrigin: string; appointments?: AppointmentHandlers; professionals?: ProfessionalService; invitations?: InvitationService; catalog?: CatalogService; authLimiter?: AuthRateLimiter; availabilityLimiter?: AvailabilityLimiter; publicCatalog?: express.Router; memberships?: MembershipStore; management?: ManagementService; agenda?: AgendaStore }) {
const app = express();
app.disable('x-powered-by');
// Leave trust proxy off. req.ip would parse X-Forwarded-For, which a client can forge
// off Vercel and which is the wrong control even on Vercel. See clientAddress().
app.set('trust proxy', false);
app.use(express.json({ limit: '32kb' }));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

if (options) {
  app.use('/api/auth', authRoutes(options.store, options.allowedOrigin, options.authLimiter));
  if (options.appointments?.book) app.use('/api/bookings',bookingRoutes(options.store,options.allowedOrigin,options.appointments.book));
  if (options.appointments) app.use('/api/appointments', appointmentRoutes(options.store, options.allowedOrigin, options.appointments, options.availabilityLimiter));
  if (options.professionals) app.use('/api/professionals', professionalRoutes(options.store, options.allowedOrigin, options.professionals));
  if (options.invitations) {
    app.use('/api/invitations', invitationRoutes(options.store, options.allowedOrigin, options.invitations));
    app.delete('/api/manage/businesses/:id/staff/:professionalId/invitation', invitationRevocationRoute(options.store, options.allowedOrigin, options.invitations));
  }
  if (options.memberships) app.use('/api/me', membershipRoutes(options.store, options.memberships));
  if(options.publicCatalog) app.use('/api/catalog',options.publicCatalog);
  if (options.management) app.use('/api/manage/businesses', managementRoutes(options.store, options.allowedOrigin, options.management));
  if (options.agenda) app.use('/api', agendaRoutes(options.store, options.agenda));
  if (options.catalog) app.use('/api', catalogRoutes(options.store, options.allowedOrigin, options.catalog, options.management));
}

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const handleError: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  if (typeof error === 'object' && error !== null && 'type' in error) {
    if (error.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Invalid JSON' });
      return;
    }
    if (error.type === 'entity.too.large') {
      res.status(413).json({ error: 'Request too large' });
      return;
    }
  }
  res.status(500).json({ error: 'Internal server error' });
};
app.use(handleError);
return app;
}
export const app = createApp();

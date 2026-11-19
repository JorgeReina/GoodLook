import { createPool } from 'mysql2/promise';
import { createApp } from './app.js';
import { MysqlMembershipStore } from './product/membership-store.js';
import { ManagementService } from './product/management-service.js';
import { MysqlManagementStore } from './product/management-store.js';
import { MysqlAuthStore } from './auth/mysql-store.js';
import { AuthRateLimiter, MysqlRateLimitStore } from './auth/rate-limit.js';
import { loadConfig } from './config.js';
import { createBooking, createAppointment, listProfessionalAgenda, listCustomerAppointments } from './appointments/service.js';
import { MysqlProfessionalsStore } from './professionals/mysql-store.js';
import { ProfessionalService } from './professionals/service.js';
import { InvitationService } from './invitations/service.js';
import { MysqlInvitationStore } from './invitations/mysql-store.js';
import {publicCatalogRoutes} from './catalog/public.js';
import { CatalogService } from './catalog/service.js';
import { MysqlCatalogStore } from './catalog/mysql-store.js';
import { publicAvailability } from './appointments/public-availability.js';
import { AvailabilityRateLimiter, MysqlAvailabilityRateStore } from './appointments/rate-limit.js';

export function createRuntimeApp(env: NodeJS.ProcessEnv = process.env) {
const config = loadConfig(env);
const db = config.db;
const pool = createPool({ host: db.hostname, port: db.port ? Number(db.port) : 3306, user: decodeURIComponent(db.username), password: decodeURIComponent(db.password), database: decodeURIComponent(db.pathname.slice(1)), timezone: 'Z', ssl: config.tls ? { rejectUnauthorized: true } : undefined });
const authLimiter = new AuthRateLimiter(new MysqlRateLimitStore(pool), env.AUTH_LIMIT_SECRET ?? '');
const availabilityLimiter = new AvailabilityRateLimiter(new MysqlAvailabilityRateStore(pool), env.AUTH_LIMIT_SECRET ?? '');
return createApp({
  publicCatalog: publicCatalogRoutes(pool),
  memberships: new MysqlMembershipStore(pool),
  management: new ManagementService(new MysqlManagementStore(pool, env.AUTH_LIMIT_SECRET ?? '')),
  authLimiter,
  availabilityLimiter,
  store: new MysqlAuthStore(pool),
  allowedOrigin: config.origin,
  catalog: new CatalogService(new MysqlCatalogStore(pool)),
  invitations: new InvitationService(new MysqlInvitationStore(pool)),
  professionals: new ProfessionalService(new MysqlProfessionalsStore(pool)),
  appointments: {
    book: input => createBooking(pool, input),
    create: input => createAppointment(pool, input),
    agenda: input => listProfessionalAgenda(pool, input),
    mine: input => listCustomerAppointments(pool, input),
    availability: input => publicAvailability(pool, input),
  },
});
}

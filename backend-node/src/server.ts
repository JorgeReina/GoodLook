import { createPool } from 'mysql2/promise';
import { createApp } from './app.js';
import { MysqlAuthStore } from './auth/mysql-store.js';
import { loadConfig } from './config.js';
import { createAppointment, listProfessionalAgenda, type AppointmentPool } from './appointments/service.js';

const config = loadConfig(process.env);
const db = config.db;
const pool = createPool({ host: db.hostname, port: db.port ? Number(db.port) : 3306, user: decodeURIComponent(db.username), password: decodeURIComponent(db.password), database: decodeURIComponent(db.pathname.slice(1)), timezone: 'Z', ssl: config.tls ? { rejectUnauthorized: true } : undefined });
const appointmentsPool = pool as unknown as AppointmentPool;
createApp({ store: new MysqlAuthStore(pool), allowedOrigin: config.origin, appointments: { create: input => createAppointment(appointmentsPool, input), agenda: input => listProfessionalAgenda(appointmentsPool, input) } }).listen(config.port, () => console.log(`GoodLook API listening on port ${config.port}`));

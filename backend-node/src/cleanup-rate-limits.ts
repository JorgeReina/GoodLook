import { createPool } from 'mysql2/promise';
import { loadConfig } from './config.js';
import { MysqlRateLimitStore } from './auth/rate-limit.js';

// One bounded batch per invocation. This is an operator command, never a
// request handler; a scheduler can run it periodically with least privilege.
if (process.env.GOODLOOK_RATE_CLEANUP !== 'YES') throw new Error('Set GOODLOOK_RATE_CLEANUP=YES to run cleanup');
const config = loadConfig(process.env);
const db = config.db;
const pool = createPool({ host: db.hostname, port: db.port ? Number(db.port) : 3306, user: decodeURIComponent(db.username), password: decodeURIComponent(db.password), database: decodeURIComponent(db.pathname.slice(1)), timezone: 'Z', ssl: config.tls ? { rejectUnauthorized: true } : undefined, connectionLimit: 1 });
try {
  const removed = await new MysqlRateLimitStore(pool).cleanupExpired();
  console.log(`Removed ${removed} expired rate-limit buckets.`);
} catch {
  // Driver errors may contain connection details.
  console.error('Rate-limit cleanup failed.');
  process.exitCode = 1;
} finally {
  await pool.end();
}

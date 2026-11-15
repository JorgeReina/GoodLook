export function loadConfig(env: NodeJS.ProcessEnv) {
  const rawPort = env.PORT ?? '3000';
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535');
  const rawOrigin = env.APP_ORIGIN;
  if (!rawOrigin || !env.DATABASE_URL) throw new Error('APP_ORIGIN and DATABASE_URL are required');
  let origin: URL;
  let db: URL;
  try { origin = new URL(rawOrigin); db = new URL(env.DATABASE_URL); } catch { throw new Error('Invalid configuration URL'); }
  if (origin.origin !== rawOrigin || (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname)))) throw new Error('APP_ORIGIN must be an HTTPS origin or local HTTP origin');
  if (db.protocol !== 'mysql:' || !db.hostname || !db.username || !db.pathname.slice(1) || db.search || db.hash) throw new Error('Invalid DATABASE_URL');
  const tls = env.MYSQL_TLS === 'true';
  if (!tls && !(env.MYSQL_ALLOW_INSECURE_LOCAL === 'true' && ['localhost', '127.0.0.1', '[::1]'].includes(db.hostname))) throw new Error('MySQL TLS is required unless local plaintext is explicitly permitted');
  return { port, origin: rawOrigin, db, tls };
}

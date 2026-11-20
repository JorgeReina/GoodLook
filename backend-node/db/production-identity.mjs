import identity from '../config/production-database.json' with { type: 'json' };

function normalizedHost(value) {
  return String(value ?? '').trim().replace(/\.$/, '').toLowerCase();
}

function normalizedName(value) {
  return String(value ?? '').trim().toLowerCase();
}

/** Incomplete configuration is absent. The caller then fails closed. */
export function parseProductionDatabase(value) {
  if (!value || typeof value !== 'object') return null;
  const host = typeof value.host === 'string' ? value.host.trim() : '';
  const database = typeof value.database === 'string' ? value.database.trim() : '';
  const user = typeof value.user === 'string' ? value.user.trim() : '';
  if (!host || !database || !user) return null;
  return { host, database, user };
}

/** Single source of truth for the production database identity. Not a secret. */
export function readProductionDatabase() {
  return parseProductionDatabase(identity);
}

export function isLoopbackHost(host) {
  const name = normalizedHost(host).replace(/^\[|\]$/g, '');
  return name === 'localhost' || name === '127.0.0.1' || name === '::1';
}

/** True when host, database name, or user is the configured production identity. */
export function matchesProductionDatabase(candidate, production) {
  if (!production) return false;
  return normalizedHost(candidate.host) === normalizedHost(production.host)
    || normalizedName(candidate.database) === normalizedName(production.database)
    || normalizedName(candidate.user) === normalizedName(production.user);
}

const dataRoles = ['development', 'preview', 'production'];

function knownRole(value) {
  if (value === undefined || value === '') return undefined;
  if (!dataRoles.includes(value)) throw new Error('GOODLOOK_DATA_ENV or VERCEL_ENV is not development, preview, or production');
  return value;
}

/**
 * No default role. An empty or missing pair stays undeclared, which cannot
 * open a remote database. `VERCEL=1` alone is not a role.
 */
export function resolveDataRole(env) {
  const declared = knownRole(env.GOODLOOK_DATA_ENV);
  const vercelEnv = knownRole(env.VERCEL_ENV);
  if (declared && vercelEnv && (vercelEnv === 'preview' || vercelEnv === 'production') && declared !== vercelEnv) {
    throw new Error('GOODLOOK_DATA_ENV conflicts with VERCEL_ENV');
  }
  if (declared) return declared;
  if (vercelEnv) return vercelEnv;
  return 'undeclared';
}

/**
 * Refuse the production identity unless the role is explicitly production,
 * and refuse every non-loopback database when the role was not declared.
 * A missing production identity also refuses preview and any other
 * non-production remote connection. The thrown text never includes the URL.
 */
export function assertDatabaseIsolation(env, identity, production) {
  if (env.VERCEL !== undefined && env.VERCEL !== '' && env.VERCEL !== '1') {
    throw new Error('VERCEL must stay unset outside Vercel');
  }
  const role = resolveDataRole(env);
  if (isLoopbackHost(identity.host)) return role;
  const matches = matchesProductionDatabase(identity, production);
  if (matches && role === 'preview') throw new Error('Preview cannot use the production database identity');
  if (matches && env.VERCEL === '1' && env.VERCEL_ENV !== 'production') {
    throw new Error('VERCEL=1 outside a production deployment cannot use the production database identity');
  }
  if (matches && role === 'production') return role;
  if (matches && env.GOODLOOK_ALLOW_PRODUCTION_DATABASE === 'YES' && role !== 'preview') return role;
  if (matches) throw new Error('Only an explicit production role can use the production database identity');
  if (role === 'undeclared') throw new Error('Database role is not declared; refusing a non-loopback database');
  if (!production && role !== 'production') {
    throw new Error('Production database identity is not configured; refusing a non-loopback database');
  }
  return role;
}

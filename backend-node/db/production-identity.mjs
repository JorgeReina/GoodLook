import productionIdentity from '../config/production-database.json' with { type: 'json' };
import previewIdentity from '../config/preview-database.json' with { type: 'json' };

function normalizedHost(value) {
  return String(value ?? '').trim().replace(/\.$/, '').toLowerCase();
}

function normalizedName(value) {
  return String(value ?? '').trim().toLowerCase();
}

/** Incomplete configuration is absent. The caller then fails closed. */
export function parseDatabaseIdentity(value) {
  if (!value || typeof value !== 'object') return null;
  const host = typeof value.host === 'string' ? value.host.trim() : '';
  const database = typeof value.database === 'string' ? value.database.trim() : '';
  const user = typeof value.user === 'string' ? value.user.trim() : '';
  if (!host || !database || !user) return null;
  const engine = typeof value.engine === 'string' ? value.engine.trim().toLowerCase() : '';
  if (engine && engine !== 'mysql' && engine !== 'mariadb') return null;
  return engine ? { host, database, user, engine } : { host, database, user };
}

export function parseProductionDatabase(value) {
  return parseDatabaseIdentity(value);
}

/** Single source of truth for the production database identity. Not a secret. */
export function readProductionDatabase() {
  return parseDatabaseIdentity(productionIdentity);
}

/** Single source of truth for the preview database identity. Not a secret. */
export function readPreviewDatabase() {
  return parseDatabaseIdentity(previewIdentity);
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

/** True when host, database name, and user all match the configured identity. */
export function matchesDatabaseIdentity(candidate, expected) {
  if (!expected) return false;
  return normalizedHost(candidate.host) === normalizedHost(expected.host)
    && normalizedName(candidate.database) === normalizedName(expected.database)
    && normalizedName(candidate.user) === normalizedName(expected.user);
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
 * pin preview to the preview identity, and refuse every non-loopback
 * database when the role was not declared. A missing production identity
 * also refuses development remotes. A missing preview identity refuses
 * preview remotes. The thrown text never includes the URL.
 */
export function assertDatabaseIsolation(env, identity, production, preview = readPreviewDatabase()) {
  if (env.VERCEL !== undefined && env.VERCEL !== '' && env.VERCEL !== '1') {
    throw new Error('VERCEL must stay unset outside Vercel');
  }
  const role = resolveDataRole(env);
  if (isLoopbackHost(identity.host)) return role;
  const matchesProduction = matchesProductionDatabase(identity, production);
  if (role === 'preview') {
    if (matchesProduction) throw new Error('Preview cannot use the production database identity');
    if (!preview) throw new Error('Preview database identity is not configured; refusing a non-loopback database');
    if (!matchesDatabaseIdentity(identity, preview)) throw new Error('Preview can only use the preview database identity');
    return role;
  }
  if (matchesProduction && env.VERCEL === '1' && env.VERCEL_ENV !== 'production') {
    throw new Error('VERCEL=1 outside a production deployment cannot use the production database identity');
  }
  if (matchesProduction && role === 'production') return role;
  if (matchesProduction && env.GOODLOOK_ALLOW_PRODUCTION_DATABASE === 'YES' && role !== 'preview') return role;
  if (matchesProduction) throw new Error('Only an explicit production role can use the production database identity');
  if (role === 'undeclared') throw new Error('Database role is not declared; refusing a non-loopback database');
  if (!production && role !== 'production') {
    throw new Error('Production database identity is not configured; refusing a non-loopback database');
  }
  return role;
}

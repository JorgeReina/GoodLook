// Keep this object identical to PRODUCTION_DATABASE in db/production-identity.mjs.
export const productionDatabaseIdentity = {
  host: 'db80496.public.databaseasp.net',
  database: 'db80496',
  user: 'db80496',
} as const;

export type DataRole = 'development' | 'preview' | 'production';

const dataRoles: readonly DataRole[] = ['development', 'preview', 'production'];

export interface DatabaseIdentity {
  host: string;
  database: string;
  user: string;
}

function knownRole(value: string | undefined): DataRole | undefined {
  if (value === undefined || value === '') return undefined;
  if ((dataRoles as readonly string[]).includes(value)) return value as DataRole;
  throw new Error('GOODLOOK_DATA_ENV or VERCEL_ENV is not development, preview, or production');
}

/**
 * Preview is explicit (`GOODLOOK_DATA_ENV=preview`) or Vercel's own
 * `VERCEL_ENV=preview`. A declared role cannot contradict a platform
 * preview or production environment. `VERCEL=1` alone is not a role:
 * production deployments also receive it.
 */
export function resolveDataRole(env: NodeJS.ProcessEnv): DataRole {
  const declared = knownRole(env.GOODLOOK_DATA_ENV);
  const vercelEnv = knownRole(env.VERCEL_ENV);
  if (declared && vercelEnv && (vercelEnv === 'preview' || vercelEnv === 'production') && declared !== vercelEnv) {
    throw new Error('GOODLOOK_DATA_ENV conflicts with VERCEL_ENV');
  }
  if (declared) return declared;
  if (vercelEnv === 'preview' || vercelEnv === 'production') return vercelEnv;
  return 'development';
}

function normalizedHost(value: string): string {
  return value.trim().replace(/\.$/, '').toLowerCase();
}

function normalizedName(value: string): string {
  return value.trim().toLowerCase();
}

/** True when host, database name, or user is the production identity. */
export function matchesProductionDatabase(identity: DatabaseIdentity): boolean {
  return normalizedHost(identity.host) === productionDatabaseIdentity.host
    || normalizedName(identity.database) === productionDatabaseIdentity.database
    || normalizedName(identity.user) === productionDatabaseIdentity.user;
}

/**
 * Refuse to open the production database from preview, or from any process
 * that exports `VERCEL=1` without `VERCEL_ENV=production`. Vercel sets that
 * pair itself. A copied value would make the rate limiter trust
 * `x-vercel-forwarded-for` once that policy is deployed, and it must not
 * also be a path onto the production database.
 * The thrown text never includes the connection string.
 */
export function assertDatabaseIsolation(env: NodeJS.ProcessEnv, identity: DatabaseIdentity): DataRole {
  if (env.VERCEL !== undefined && env.VERCEL !== '' && env.VERCEL !== '1') {
    throw new Error('VERCEL must stay unset outside Vercel');
  }
  const role = resolveDataRole(env);
  if (!matchesProductionDatabase(identity)) return role;
  if (role === 'preview') throw new Error('Preview cannot use the production database identity');
  if (env.VERCEL === '1' && env.VERCEL_ENV !== 'production') {
    throw new Error('VERCEL=1 outside a production deployment cannot use the production database identity');
  }
  return role;
}

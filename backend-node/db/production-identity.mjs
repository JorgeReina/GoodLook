// Public identity of the MariaDB database that preview and production
// currently share. It is not a secret: the hostname is already documented.
// Keep this object identical to productionDatabaseIdentity in src/data-guard.ts.
// The parity test fails if the two copies diverge.

export const PRODUCTION_DATABASE = Object.freeze({
  host: 'db80496.public.databaseasp.net',
  database: 'db80496',
  user: 'db80496',
});

function normalizedHost(value) {
  return String(value ?? '').trim().replace(/\.$/, '').toLowerCase();
}

function normalizedName(value) {
  return String(value ?? '').trim().toLowerCase();
}

/** True when host, database name, or user is the production identity. */
export function matchesProductionDatabase({ host, database, user }) {
  return normalizedHost(host) === PRODUCTION_DATABASE.host
    || normalizedName(database) === PRODUCTION_DATABASE.database
    || normalizedName(user) === PRODUCTION_DATABASE.user;
}

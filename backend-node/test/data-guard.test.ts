import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import {
  assertDatabaseIsolation,
  parseDatabaseIdentity,
  parseProductionDatabase,
  readPreviewDatabase,
  readProductionDatabase,
} from '../db/production-identity.mjs';

const remote = { APP_ORIGIN: 'https://preview.example.test', MYSQL_TLS: 'true' };
const production = readProductionDatabase();
const preview = readPreviewDatabase();
if (!production) throw new Error('production database config must load');
if (!preview) throw new Error('preview database config must load');
const productionUrl = `mysql://${production.user}:super-secret-preview@${production.host}:3306/${production.database}`;
const previewUrl = `mysql://${preview.user}:another-secret@${preview.host}:3306/${preview.database}`;
const unknownUrl = 'mysql://db99999:another-secret@db99999.public.databaseasp.net:3306/db99999';
const connection = { host: production.host, database: production.database, user: production.user };
const previewIdentity = { host: preview.host, database: preview.database, user: preview.user };
const unknownIdentity = { host: 'db99999.example.test', database: 'db99999', user: 'db99999' };

test('the production and preview identities have one configured source each', () => {
  assert.equal(parseProductionDatabase({}), null);
  assert.equal(parseDatabaseIdentity({ host: production.host, database: '', user: production.user }), null);
  assert.deepEqual(readProductionDatabase(), production);
  assert.deepEqual(readPreviewDatabase(), preview);
  assert.equal(production.host, 'db80496.public.databaseasp.net');
  assert.equal(preview.host, 'db81522.public.databaseasp.net');
  assert.notEqual(production.host, preview.host);
  assert.notEqual(production.database, preview.database);
  assert.notEqual(production.user, preview.user);
});

test('preview accepts only the configured preview identity', () => {
  const previewEnv = { ...remote, VERCEL: '1', VERCEL_ENV: 'preview', GOODLOOK_DATA_ENV: 'preview' };
  assert.equal(loadConfig({ ...previewEnv, DATABASE_URL: previewUrl }).dataRole, 'preview');
  assert.equal(loadConfig({ ...remote, GOODLOOK_DATA_ENV: 'preview', DATABASE_URL: previewUrl }).dataRole, 'preview');
  assert.equal(assertDatabaseIsolation({ GOODLOOK_DATA_ENV: 'preview' }, previewIdentity, production, preview), 'preview');
});

test('preview refuses the production identity', () => {
  const previewEnv = { ...remote, VERCEL: '1', VERCEL_ENV: 'preview', GOODLOOK_DATA_ENV: 'preview' };
  for (const url of [
    productionUrl,
    `mysql://other:super-secret-preview@${production.host}/other`,
    `mysql://other:super-secret-preview@elsewhere.example.test/${production.database}`,
    `mysql://${production.user}:super-secret-preview@elsewhere.example.test/other`,
  ]) {
    assert.throws(() => loadConfig({ ...previewEnv, DATABASE_URL: url }), error => {
      return error instanceof Error && error.message === 'Preview cannot use the production database identity' && !error.message.includes('super-secret-preview');
    });
  }
  assert.throws(
    () => assertDatabaseIsolation({ GOODLOOK_DATA_ENV: 'preview' }, connection, production, preview),
    /production database identity/,
  );
});

test('an undeclared role cannot open production, preview, or any other remote database', () => {
  assert.throws(() => loadConfig({ ...remote, DATABASE_URL: productionUrl }), /explicit production role/);
  assert.throws(() => loadConfig({ ...remote, DATABASE_URL: previewUrl }), /role is not declared/);
  assert.throws(() => loadConfig({ ...remote, DATABASE_URL: unknownUrl }), /role is not declared/);
  assert.throws(() => loadConfig({ ...remote, GOODLOOK_DATA_ENV: '', VERCEL_ENV: '', DATABASE_URL: productionUrl }), /explicit production role/);
  assert.throws(() => loadConfig({ ...remote, GOODLOOK_DATA_ENV: 'development', DATABASE_URL: productionUrl }), /explicit production role/);
  const local = loadConfig({ ...remote, DATABASE_URL: 'mysql://u:p@127.0.0.1/db', MYSQL_ALLOW_INSECURE_LOCAL: 'true', MYSQL_TLS: undefined });
  assert.equal(local.dataRole, 'undeclared');
});

test('preview refuses an unknown remote host', () => {
  const previewEnv = { ...remote, GOODLOOK_DATA_ENV: 'preview' };
  assert.throws(() => loadConfig({ ...previewEnv, DATABASE_URL: unknownUrl }), /preview database identity/);
  assert.throws(
    () => assertDatabaseIsolation(previewEnv, unknownIdentity, production, preview),
    /preview database identity/,
  );
  assert.throws(
    () => loadConfig({ ...previewEnv, DATABASE_URL: `mysql://${preview.user}:another-secret@db99999.public.databaseasp.net:3306/${preview.database}` }),
    /preview database identity/,
  );
});

test('VERCEL=1 is not a preview switch and cannot open production outside the platform', () => {
  assert.equal(loadConfig({ ...remote, VERCEL: '1', VERCEL_ENV: 'production', DATABASE_URL: productionUrl }).dataRole, 'production');
  assert.throws(() => loadConfig({ ...remote, VERCEL: '1', DATABASE_URL: productionUrl }), /VERCEL=1 outside a production deployment/);
  assert.throws(() => loadConfig({ ...remote, VERCEL: '1', VERCEL_ENV: '', DATABASE_URL: productionUrl }), /VERCEL=1 outside a production deployment/);
  assert.throws(() => loadConfig({ ...remote, VERCEL: '1', VERCEL_ENV: 'development', DATABASE_URL: productionUrl }), /VERCEL=1 outside a production deployment/);
  assert.throws(() => loadConfig({ ...remote, VERCEL: '1', GOODLOOK_DATA_ENV: 'production', DATABASE_URL: productionUrl }), /VERCEL=1 outside a production deployment/);
  assert.equal(loadConfig({ ...remote, VERCEL: '1', VERCEL_ENV: 'preview', DATABASE_URL: previewUrl }).dataRole, 'preview');
  assert.throws(() => loadConfig({ ...remote, VERCEL: 'true', DATABASE_URL: previewUrl }), /VERCEL must stay unset/);
  assert.throws(() => loadConfig({ ...remote, GOODLOOK_DATA_ENV: 'development', VERCEL_ENV: 'preview', DATABASE_URL: previewUrl }), /conflicts with VERCEL_ENV/);
  assert.throws(() => loadConfig({ ...remote, GOODLOOK_DATA_ENV: 'staging', DATABASE_URL: previewUrl }), /not development, preview, or production/);
});

test('production identity opens only for an explicit production role or a local exception', () => {
  assert.equal(loadConfig({ ...remote, GOODLOOK_DATA_ENV: 'production', DATABASE_URL: productionUrl }).dataRole, 'production');
  assert.equal(loadConfig({ ...remote, GOODLOOK_DATA_ENV: 'development', GOODLOOK_ALLOW_PRODUCTION_DATABASE: 'YES', DATABASE_URL: productionUrl }).dataRole, 'development');
  assert.throws(() => loadConfig({
    ...remote, VERCEL_ENV: 'preview', GOODLOOK_ALLOW_PRODUCTION_DATABASE: 'YES', DATABASE_URL: productionUrl,
  }), /Preview cannot use the production database identity/);
});

test('a missing identity fails closed for preview and other remote roles', () => {
  const previewEnv = { GOODLOOK_DATA_ENV: 'preview' };
  assert.throws(() => assertDatabaseIsolation(previewEnv, unknownIdentity, null, preview), /preview database identity/);
  assert.throws(() => assertDatabaseIsolation(previewEnv, previewIdentity, production, null), /not configured/);
  assert.throws(() => assertDatabaseIsolation(previewEnv, connection, null, preview), /preview database identity/);
  assert.throws(() => assertDatabaseIsolation({ GOODLOOK_DATA_ENV: 'development' }, unknownIdentity, null, preview), /not configured/);
  assert.throws(() => assertDatabaseIsolation({}, unknownIdentity, production, preview), /role is not declared/);
  assert.equal(assertDatabaseIsolation(previewEnv, { host: '127.0.0.1', database: 'local', user: 'local' }, null, null), 'preview');
  assert.equal(assertDatabaseIsolation({ VERCEL_ENV: 'production' }, unknownIdentity, null, preview), 'production');
});

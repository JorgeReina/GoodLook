import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { assertDatabaseIsolation, parseProductionDatabase, readProductionDatabase } from '../db/production-identity.mjs';

const remote = { APP_ORIGIN: 'https://preview.example.test', MYSQL_TLS: 'true' };
const production = readProductionDatabase();
if (!production) throw new Error('production database config must load');
const productionUrl = `mysql://${production.user}:super-secret-preview@${production.host}:3306/${production.database}`;
const previewUrl = 'mysql://db99999:another-secret@db99999.public.databaseasp.net:3306/db99999';
const connection = { host: production.host, database: production.database, user: production.user };

test('the production identity has one configured source', () => {
  assert.equal(parseProductionDatabase({}), null);
  assert.equal(parseProductionDatabase({ host: production.host, database: '', user: production.user }), null);
  assert.deepEqual(readProductionDatabase(), production);
  assert.equal(assertDatabaseIsolation(
    { GOODLOOK_DATA_ENV: 'preview', MYSQL_TLS: 'true' },
    { host: 'db99999.example.test', database: 'db99999', user: 'db99999' },
    production,
  ), 'preview');
});

test('preview refuses the production host, database name, or user', () => {
  const preview = { ...remote, VERCEL: '1', VERCEL_ENV: 'preview', GOODLOOK_DATA_ENV: 'preview' };
  for (const url of [
    productionUrl,
    `mysql://other:super-secret-preview@${production.host}/other`,
    `mysql://other:super-secret-preview@elsewhere.example.test/${production.database}`,
    `mysql://${production.user}:super-secret-preview@elsewhere.example.test/other`,
  ]) {
    assert.throws(() => loadConfig({ ...preview, DATABASE_URL: url }), error => {
      return error instanceof Error && error.message === 'Preview cannot use the production database identity' && !error.message.includes('super-secret-preview');
    });
  }
  assert.equal(loadConfig({ ...preview, DATABASE_URL: previewUrl }).dataRole, 'preview');
  assert.equal(loadConfig({ ...remote, GOODLOOK_DATA_ENV: 'preview', DATABASE_URL: previewUrl }).dataRole, 'preview');
});

test('an undeclared role cannot open production or any other remote database', () => {
  assert.throws(() => loadConfig({ ...remote, DATABASE_URL: productionUrl }), /explicit production role/);
  assert.throws(() => loadConfig({ ...remote, DATABASE_URL: previewUrl }), /role is not declared/);
  assert.throws(() => loadConfig({ ...remote, GOODLOOK_DATA_ENV: '', VERCEL_ENV: '', DATABASE_URL: productionUrl }), /explicit production role/);
  assert.throws(() => loadConfig({ ...remote, GOODLOOK_DATA_ENV: 'development', DATABASE_URL: productionUrl }), /explicit production role/);
  const local = loadConfig({ ...remote, DATABASE_URL: 'mysql://u:p@127.0.0.1/db', MYSQL_ALLOW_INSECURE_LOCAL: 'true', MYSQL_TLS: undefined });
  assert.equal(local.dataRole, 'undeclared');
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

test('a missing production identity fails closed for preview and other remote roles', () => {
  const previewEnv = { GOODLOOK_DATA_ENV: 'preview' };
  const other = { host: 'db99999.example.test', database: 'db99999', user: 'db99999' };
  assert.throws(() => assertDatabaseIsolation(previewEnv, other, null), /not configured/);
  assert.throws(() => assertDatabaseIsolation(previewEnv, connection, null), /not configured/);
  assert.throws(() => assertDatabaseIsolation({ GOODLOOK_DATA_ENV: 'development' }, other, null), /not configured/);
  assert.throws(() => assertDatabaseIsolation({}, other, null), /role is not declared/);
  assert.equal(assertDatabaseIsolation(previewEnv, { host: '127.0.0.1', database: 'local', user: 'local' }, null), 'preview');
  assert.equal(assertDatabaseIsolation({ VERCEL_ENV: 'production' }, other, null), 'production');
});

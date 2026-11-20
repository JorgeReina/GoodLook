import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { matchesProductionDatabase as matchesInRuntime, productionDatabaseIdentity } from '../src/data-guard.js';
import { PRODUCTION_DATABASE, matchesProductionDatabase as matchesInMigrator } from '../db/production-identity.mjs';

const remote = { APP_ORIGIN: 'https://preview.example.test', MYSQL_TLS: 'true' };
const productionUrl = 'mysql://db80496:super-secret-preview@db80496.public.databaseasp.net:3306/db80496';
const previewUrl = 'mysql://db99999:another-secret@db99999.public.databaseasp.net:3306/db99999';

test('runtime and migrator agree on the production identity', () => {
  assert.deepEqual(productionDatabaseIdentity, PRODUCTION_DATABASE);
  const samples = [
    { host: 'db80496.public.databaseasp.net', database: 'other', user: 'other' },
    { host: 'DB80496.public.databaseasp.net.', database: 'other', user: 'other' },
    { host: 'other.example.test', database: 'db80496', user: 'other' },
    { host: 'other.example.test', database: 'other', user: 'DB80496' },
    { host: 'db80496.public.databaseasp.net.evil.test', database: 'other', user: 'other' },
    { host: 'db99999.public.databaseasp.net', database: 'db99999', user: 'db99999' },
  ];
  for (const sample of samples) assert.equal(matchesInRuntime(sample), matchesInMigrator(sample));
  assert.equal(matchesInRuntime(samples[0]), true);
  assert.equal(matchesInRuntime(samples[5]), false);
});

test('preview refuses the production host, database name, or user', () => {
  const preview = { ...remote, VERCEL: '1', VERCEL_ENV: 'preview', GOODLOOK_DATA_ENV: 'preview' };
  for (const url of [
    productionUrl,
    'mysql://other:super-secret-preview@db80496.public.databaseasp.net/other',
    'mysql://other:super-secret-preview@elsewhere.example.test/db80496',
    'mysql://db80496:super-secret-preview@elsewhere.example.test/other',
  ]) {
    assert.throws(() => loadConfig({ ...preview, DATABASE_URL: url }), error => {
      return error instanceof Error && error.message === 'Preview cannot use the production database identity' && !error.message.includes('super-secret-preview');
    });
  }
  assert.equal(loadConfig({ ...preview, DATABASE_URL: previewUrl }).dataRole, 'preview');
  assert.equal(loadConfig({ ...remote, GOODLOOK_DATA_ENV: 'preview', DATABASE_URL: previewUrl }).dataRole, 'preview');
});

test('VERCEL=1 is not a preview switch and cannot open production outside the platform', () => {
  assert.equal(loadConfig({ ...remote, VERCEL: '1', VERCEL_ENV: 'production', DATABASE_URL: productionUrl }).dataRole, 'production');
  assert.throws(() => loadConfig({ ...remote, VERCEL: '1', DATABASE_URL: productionUrl }), /VERCEL=1 outside a production deployment/);
  assert.throws(() => loadConfig({ ...remote, VERCEL: '1', VERCEL_ENV: 'development', DATABASE_URL: productionUrl }), /VERCEL=1 outside a production deployment/);
  assert.throws(() => loadConfig({ ...remote, VERCEL: '1', GOODLOOK_DATA_ENV: 'production', DATABASE_URL: productionUrl }), /VERCEL=1 outside a production deployment/);
  assert.equal(loadConfig({ ...remote, VERCEL: '1', VERCEL_ENV: 'preview', DATABASE_URL: previewUrl }).dataRole, 'preview');
  assert.throws(() => loadConfig({ ...remote, VERCEL: 'true', DATABASE_URL: previewUrl }), /VERCEL must stay unset/);
  assert.throws(() => loadConfig({ ...remote, GOODLOOK_DATA_ENV: 'development', VERCEL_ENV: 'preview', DATABASE_URL: previewUrl }), /conflicts with VERCEL_ENV/);
  assert.throws(() => loadConfig({ ...remote, GOODLOOK_DATA_ENV: 'staging', DATABASE_URL: previewUrl }), /not development, preview, or production/);
});

test('a local process can still name the production database', () => {
  assert.equal(loadConfig({ ...remote, DATABASE_URL: productionUrl }).dataRole, 'development');
  assert.equal(loadConfig({ ...remote, GOODLOOK_DATA_ENV: 'production', DATABASE_URL: productionUrl }).dataRole, 'production');
});

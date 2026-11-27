import { test } from 'node:test';
import assert from 'node:assert/strict';

test('remote migration refuses unsafe identity, TLS or nonempty schema before writing', async () => {
  const mod = await import('../monsterasp-lib.mjs').catch(() => null);
  assert.ok(mod, 'remote preflight must exist');
  assert.throws(() => mod.monsterConfig({ GOODLOOK_DB_PASSWORD: 'synthetic' }), /production/i);
  const config = mod.monsterConfig({ GOODLOOK_DB_PASSWORD: 'synthetic', GOODLOOK_ALLOW_PRODUCTION_MIGRATIONS: 'YES' });
  assert.equal(config.host, 'db80496.public.databaseasp.net');
  assert.equal(config.database, 'db80496');
  assert.equal(config.user, 'db80496');
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.throws(() => mod.monsterConfig({}));
  for (const bad of [
    { db: 'other', version: '10.11.19-MariaDB', cipher: 'TLS_AES', count: 0 },
    { db: 'db80496', version: '8.4.0', cipher: 'TLS_AES', count: 0 },
    { db: 'db80496', version: '10.11.19-MariaDB', cipher: '', count: 0 },
    { db: 'db80496', version: '10.11.19-MariaDB', cipher: 'TLS_AES', count: 1 },
  ]) assert.throws(() => mod.validatePreflight(bad));
  assert.doesNotThrow(() => mod.validatePreflight({ db: 'db80496', version: '10.11.19-MariaDB', cipher: 'TLS_AES', count: 0 }));
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
const base = { APP_ORIGIN:'https://example.test', DATABASE_URL:'mysql://u:p@mysql.example.test/db' };
test('remote MySQL rejects configurations without verified TLS', () => {
  assert.throws(() => loadConfig(base), /TLS/);
  assert.throws(() => loadConfig({...base, MYSQL_ALLOW_INSECURE_LOCAL:'true'}), /TLS/);
  assert.equal(loadConfig({...base, MYSQL_TLS:'true'}).tls, true);
});
test('local plaintext requires explicit opt-in', () => {
  const local = {...base, DATABASE_URL:'mysql://u:p@127.0.0.1/db'};
  assert.throws(() => loadConfig(local), /TLS/);
  assert.equal(loadConfig({...local, MYSQL_ALLOW_INSECURE_LOCAL:'true'}).tls, false);
});

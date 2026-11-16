import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimeApp } from '../src/runtime.js';

test('runtime exposes health and enforces origin without opening a listener itself', async () => {
  const app = createRuntimeApp({ APP_ORIGIN: 'https://pilot.example.test', DATABASE_URL: 'mysql://test:test@127.0.0.1/test', MYSQL_ALLOW_INSECURE_LOCAL: 'true', AUTH_LIMIT_SECRET: 'a'.repeat(64) });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.equal((await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { origin: 'https://other.example.test', 'content-type': 'application/json' }, body: '{}' })).status, 403);
  } finally { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())); }
});

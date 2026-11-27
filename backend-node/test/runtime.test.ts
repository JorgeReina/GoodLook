import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime, createRuntimeMysqlPool } from '../src/runtime.js';
import { loadConfig } from '../src/config.js';

const runtimeEnv = { APP_ORIGIN: 'https://pilot.example.test', DATABASE_URL: 'mysql://test:test@127.0.0.1/test', MYSQL_ALLOW_INSECURE_LOCAL: 'true', AUTH_LIMIT_SECRET: 'a'.repeat(64) };

test('runtime mysql pool caps connections and sets an idle timeout', async () => {
  const { db, tls } = loadConfig(runtimeEnv);
  const pool = createRuntimeMysqlPool(db, tls);
  try {
    const { connectionLimit, idleTimeout, maxIdle } = pool.pool.config;
    assert.equal(connectionLimit, 3);
    assert.equal(idleTimeout, 5_000);
    assert.equal(maxIdle, 2);
    assert.ok((maxIdle ?? connectionLimit) < (connectionLimit ?? 10));
  } finally {
    await pool.end();
  }
});

test('runtime exposes health and enforces origin without opening a listener itself', async () => {
  const { app, pool } = createRuntime(runtimeEnv);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;
    assert.equal((await fetch(`${base}/health`)).status, 200);
    const me = await fetch(`${base}/api/auth/me?source=pilot`);
    assert.equal(me.status, 401);
    assert.deepEqual(await me.json(), { error: 'Unauthorized' });
    assert.equal((await fetch(`${base}/api/unknown/deep`)).status, 404);
    assert.equal((await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { origin: 'https://other.example.test', 'content-type': 'application/json' }, body: '{}' })).status, 403);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    await pool.end();
  }
});

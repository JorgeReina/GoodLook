import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { app } from '../src/app.js';

const server = app.listen(0, '127.0.0.1');
let baseUrl = '';
before(async () => {
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));

test('GET /health responds with a JSON health status', async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /application\/json/);
  assert.deepEqual(await res.json(), { status: 'ok' });
});

test('unknown routes respond with a JSON 404', async () => {
  const res = await fetch(`${baseUrl}/missing`);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: 'Not found' });
});

test('malformed JSON receives a safe 400 response', async () => {
  const res = await fetch(`${baseUrl}/missing`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not-valid-secret',
  });
  assert.equal(res.status, 400);
  const text = await res.text();
  assert.deepEqual(JSON.parse(text), { error: 'Invalid JSON' });
  assert.doesNotMatch(text, /not-valid-secret|stack/i);
});

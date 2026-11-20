import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientAddress } from '../src/client-address.js';

const peer = (address: string | undefined, headers: Record<string, string | string[] | undefined> = {}) => ({
  socket: { remoteAddress: address },
  headers,
});

test('local and CI use the socket address and ignore every forwarding header', () => {
  const headers = {
    'x-forwarded-for': '203.0.113.9',
    'x-real-ip': '203.0.113.8',
    'x-vercel-forwarded-for': '203.0.113.7',
    forwarded: 'for=203.0.113.6',
  };
  assert.equal(clientAddress(peer('192.0.2.10', headers), {}), '192.0.2.10');
  assert.equal(clientAddress(peer('192.0.2.10', headers), { VERCEL: '' }), '192.0.2.10');
  assert.equal(clientAddress(peer('192.0.2.10', headers), { VERCEL: '0' }), '192.0.2.10');
  assert.equal(clientAddress(peer(undefined, headers), {}), null);
});

test('VERCEL=1 keys on the leftmost x-vercel-forwarded-for address only', () => {
  const headers = {
    'x-forwarded-for': '198.51.100.9',
    'x-real-ip': '198.51.100.8',
    forwarded: 'for=198.51.100.7',
    'x-vercel-forwarded-for': ' 203.0.113.10, 198.51.100.1 ',
  };
  assert.equal(clientAddress(peer('127.0.0.1', headers), { VERCEL: '1' }), '203.0.113.10');
  assert.equal(clientAddress(peer('127.0.0.1', { 'x-vercel-forwarded-for': ['2001:DB8::1', '198.51.100.1'] }), { VERCEL: '1' }), '2001:db8::1');
});

test('VERCEL=1 fails closed without falling back to the socket or to other headers', () => {
  const env = { VERCEL: '1' };
  assert.equal(clientAddress(peer('127.0.0.1', { 'x-forwarded-for': '203.0.113.10', 'x-real-ip': '203.0.113.10' }), env), null);
  assert.equal(clientAddress(peer('127.0.0.1', { 'x-vercel-forwarded-for': 'not-an-ip' }), env), null);
  assert.equal(clientAddress(peer('127.0.0.1', { 'x-vercel-forwarded-for': '203.0.113.10, not-an-ip' }), env), null);
  assert.equal(clientAddress(peer('127.0.0.1', { 'x-vercel-forwarded-for': '203.0.113.10:443' }), env), null);
  assert.equal(clientAddress(peer('127.0.0.1', {}), env), null);
});

test('equivalent IPv4 forms share one address', () => {
  assert.equal(clientAddress(peer('::ffff:192.0.2.10'), {}), '192.0.2.10');
  assert.equal(clientAddress(peer('10.0.0.8', { 'x-vercel-forwarded-for': '::ffff:203.0.113.10' }), { VERCEL: '1' }), '203.0.113.10');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, parsePageLimit } from '../src/http/pagination.js';

test('pagination defaults to the first page with a bounded page size', () => {
  assert.deepEqual(parsePageLimit(undefined), { page: 1, limit: DEFAULT_PAGE_SIZE, offset: 0 });
  assert.deepEqual(parsePageLimit({}), { page: 1, limit: DEFAULT_PAGE_SIZE, offset: 0 });
  assert.equal(DEFAULT_PAGE_SIZE, 50);
  assert.equal(MAX_PAGE_SIZE, 100);
});

test('pagination accepts explicit page and limit and computes offset', () => {
  assert.deepEqual(parsePageLimit({ page: '3', limit: '10' }), { page: 3, limit: 10, offset: 20 });
  assert.deepEqual(parsePageLimit({ page: 2, limit: 100 }), { page: 2, limit: 100, offset: 100 });
});

test('pagination rejects unsafe or out-of-range values', () => {
  for (const query of [
    { page: '0' }, { page: '-1' }, { page: '1.5' }, { page: 'abc' }, { page: '' }, { page: '01' },
    { limit: '0' }, { limit: '101' }, { limit: '-5' }, { limit: '1.5' }, { limit: 'foo' },
    { page: ['1'] }, { limit: ['10'] }, { page: { value: 1 } }, [],
  ]) {
    assert.equal(parsePageLimit(query), null);
  }
});

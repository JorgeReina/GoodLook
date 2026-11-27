import test from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'mysql2/promise';
import { ProfessionalService, ProfessionalError } from '../src/professionals/service.js';
import { MysqlProfessionalsStore } from '../src/professionals/mysql-store.js';

const business = '10000000-0000-4000-8000-000000000001';
const actor = '20000000-0000-4000-8000-000000000001';

test('validates names and IDs before touching store', async () => {
  let touched = false;
  const store = { listActive: async () => { touched = true; return []; }, create: async () => { touched = true; return null; } };
  const service = new ProfessionalService(store);
  await assert.rejects(() => service.create(actor, business, '  '), ProfessionalError);
  await assert.rejects(() => service.create(actor, business, 'x'.repeat(121)), ProfessionalError);
  await assert.rejects(() => service.listActive('not-an-id'), ProfessionalError);
  await assert.rejects(() => service.create('not-an-id', business, 'Pepa'), ProfessionalError);
  assert.equal(touched, false);
});

test('denies creation when store reports no active administrator membership', async () => {
  const service = new ProfessionalService({ listActive: async () => [], create: async () => null });
  await assert.rejects(() => service.create(actor, business, 'Pepa'), (error: unknown) => error instanceof ProfessionalError && error.code === 'forbidden');
});

function fakePool(role: string | null = 'owner') {
  const calls: { sql: string; params: unknown[] }[] = [];
  const lifecycle: string[] = [];
  const conn = {
    beginTransaction: async () => { lifecycle.push('begin'); },
    commit: async () => { lifecycle.push('commit'); },
    rollback: async () => { lifecycle.push('rollback'); },
    release: () => { lifecycle.push('release'); },
    query: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      return [[], []];
    },
    execute: async (sql: string, params: unknown[]) => {
      calls.push({ sql, params });
      return sql.startsWith('SELECT') ? [role ? [{ role }] : [], []] : [{ affectedRows: 1 }, []];
    },
  };
  return { calls, lifecycle, pool: { getConnection: async () => conn, execute: async (sql: string, params: unknown[]) => { calls.push({ sql, params }); return [[], []]; } } as unknown as Pool };
}

test('creation locks membership, scopes it to actor and business, then commits', async () => {
  const mock = fakePool('admin');
  const service = new ProfessionalService(new MysqlProfessionalsStore(mock.pool));
  const created = await service.create(actor, business, '  Pepa  ');
  assert.equal(created.displayName, 'Pepa');
  assert.equal(created.businessId, business);
  assert.deepEqual(mock.calls[0].params, [business]);
  assert.match(mock.calls[0].sql, /FROM businesses.*FOR UPDATE/i);
  assert.deepEqual(mock.calls[1].params, [business, actor]);
  assert.match(mock.calls[1].sql, /FOR UPDATE/i);
  assert.match(mock.calls[1].sql, /status\s*=\s*'active'/i);
  assert.deepEqual(mock.calls[2].params.slice(1), [business, 'Pepa']);
  assert.deepEqual(mock.lifecycle, ['begin', 'commit', 'release']);
});

test('professional role or missing membership cannot create a professional', async () => {
  for (const role of ['professional', null]) {
    const mock = fakePool(role);
    const service = new ProfessionalService(new MysqlProfessionalsStore(mock.pool));
    await assert.rejects(() => service.create(actor, business, 'Pepa'), (error: unknown) => error instanceof ProfessionalError && error.code === 'forbidden');
    assert.equal(mock.calls.length, 2);
    assert.deepEqual(mock.lifecycle, ['begin', 'rollback', 'release']);
  }
});

test('listing restricts SQL to requested business and active professionals', async () => {
  const mock = fakePool();
  await new ProfessionalService(new MysqlProfessionalsStore(mock.pool)).listActive(business);
  assert.deepEqual(mock.calls[0].params, [business]);
  assert.match(mock.calls[0].sql, /business_id\s*=\s*\?/i);
  assert.match(mock.calls[0].sql, /active\s*=\s*(?:1|TRUE)/i);
});
test('public professionals list excludes unpublished businesses', async()=>{const mock=fakePool();await new MysqlProfessionalsStore(mock.pool).listActive(business);assert.match(mock.calls[0].sql,/is_public\s*=\s*(?:TRUE|1)/i);});

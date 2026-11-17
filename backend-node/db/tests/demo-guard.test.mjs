import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateDemoTarget } from '../demo-guard.mjs';

const target = {
  containerId: '0123456789abcdef'.repeat(4),
  hostname: '0123456789ab',
  database: 'goodlook_disposable_test',
  host: '127.0.0.1',
  port: 33317,
};

test('accepts the exact disposable target', () => {
  assert.doesNotThrow(() => validateDemoTarget(target));
});

for (const [field, value] of [
  ['containerId', '0123456789ab'],
  ['containerId', 'g'.repeat(64)],
  ['containerId', target.containerId + '\n'],
  ['hostname', 'another-host'],
  ['database', 'another_database'],
  ['host', 'localhost'],
  ['host', 'remote.example.invalid'],
  ['port', 3306],
  ['port', '33317'],
]) {
  test(`rejects a mismatched ${field} (${JSON.stringify(value)})`, () => {
    assert.throws(() => validateDemoTarget({ ...target, [field]: value }), /demo local/i);
  });
}

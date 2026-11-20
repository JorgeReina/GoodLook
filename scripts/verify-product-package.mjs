import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const output = new URL('../FrontEndGoodLook/dist/front-end-good-look/', import.meta.url);
const pilot = await readFile(new URL('index.html', output), 'utf8');
const product = new URL('producto/', output);
const shell = await readFile(new URL('index.html', product), 'utf8');
const manifest = JSON.parse(await readFile(new URL('manifest.product.webmanifest', product), 'utf8'));
const worker = JSON.parse(await readFile(new URL('ngsw.json', product), 'utf8'));

assert.match(pilot, /<base href="\/"/);
assert.doesNotMatch(pilot, /manifest\.product\.webmanifest|ngsw-worker/);
assert.match(shell, /<base href="\/producto\/"/);
assert.match(shell, /href="manifest\.product\.webmanifest"/);
assert.equal(manifest.display, 'standalone');
const mount = new URL('https://build.example.test/producto/');
assert.equal(new URL(manifest.start_url, mount).href, mount.href);
assert.equal(new URL(manifest.scope, mount).href, mount.href);
assert.equal(worker.index, '/producto/index.html');
assert.deepEqual(worker.dataGroups, [], 'the service worker must not cache API responses');

for (const path of Object.keys(worker.hashTable)) {
  assert.ok(path.startsWith('/producto/'), 'cache entry outside the product: ' + path);
  assert.ok(!path.startsWith('/producto/api/'), 'API entry in the static cache: ' + path);
}
assert.ok(Object.keys(worker.hashTable).some(path => /\/main\.[a-z0-9]+\.js$/.test(path)));
assert.ok((await readFile(new URL('ngsw-worker.js', product))).length > 0);

for (const size of [192, 512]) {
  const icon = manifest.icons.find(entry => entry.sizes.split(' ').includes(size + 'x' + size) &&
    (!entry.purpose || entry.purpose.split(' ').includes('any')));
  assert.ok(icon, 'missing ' + size + 'px install icon');
  const url = new URL(icon.src, mount);
  assert.ok(url.href.startsWith(mount.href), 'install icon outside the product');
  const bytes = await readFile(new URL(url.pathname.slice(mount.pathname.length), product));
  assert.equal(bytes.subarray(12, 16).toString('ascii'), 'IHDR');
  assert.equal(bytes.readUInt32BE(16), size);
  assert.equal(bytes.readUInt32BE(20), size);
  assert.ok(Object.hasOwn(worker.hashTable, url.pathname), 'install icon outside the offline cache');
}
console.log('GoodLook package verified: pilot, product, app manifest, icons and static-only worker.');

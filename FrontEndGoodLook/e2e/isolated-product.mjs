import { randomBytes } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { extname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from '../../backend-node/node_modules/express/index.js';
import { migrateDemo } from '../../backend-node/db/demo-guard.mjs';
import { withNewDemo } from '../../backend-node/db/demo-runtime.mjs';

const outputDir = fileURLToPath(new URL('../dist/front-end-good-look/producto/', import.meta.url));

export async function startIsolatedProduct() {
  await stat(join(outputDir, 'index.html'));
  const { createRuntimeApp } = await import('../../backend-node/dist/runtime.js');
  const ready = Promise.withResolvers();
  const stop = Promise.withResolvers();
  const lifetime = withNewDemo('mysql', async capability => {
    await migrateDemo(capability);
    const host = express();
    let api;
    let activeDir = outputDir;
    let assets = express.static(activeDir);
    host.use((req, res, next) => req.path.startsWith('/api/') ? api(req, res, next) : next());
    host.use('/producto', (req, res, next) => {
      res.set('Cache-Control', 'no-store');
      assets(req, res, next);
    });
    host.get('/producto/{*path}', (req, res, next) => {
      if (extname(req.path)) return next();
      res.sendFile('index.html', { root: activeDir });
    });

    const server = host.listen(0, '127.0.0.1');
    try {
      await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
      });
      const origin = 'http://127.0.0.1:' + server.address().port;
      api = createRuntimeApp({
        APP_ORIGIN: origin,
        DATABASE_URL: 'mysql://goodlook_test:local_test_only_password@127.0.0.1:33317/goodlook_disposable_test',
        MYSQL_ALLOW_INSECURE_LOCAL: 'true',
        AUTH_LIMIT_SECRET: randomBytes(32).toString('hex'),
      });
      ready.resolve({
        origin, url: origin + '/producto/', outputDir,
        setOutputDir(path) {
          if (!isAbsolute(path)) throw new Error('A product build must use an absolute path.');
          activeDir = path;
          assets = express.static(path);
        },
        async close() { stop.resolve(); await lifetime; },
      });
      await stop.promise;
    } finally {
      if (server.listening) {
        await new Promise((resolve, reject) => {
          server.close(error => error ? reject(error) : resolve());
          server.closeAllConnections();
        });
      }
    }
  });
  void lifetime.catch(ready.reject);
  return ready.promise;
}

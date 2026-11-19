import { resolve } from 'node:path';
import { setInterval } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { withNewDemo } from './demo-runtime.mjs';
import { migrateDemo } from './demo-guard.mjs';
import { seedDemo, openDemoConnection } from './demo-seed.mjs';

async function run(dialect, mode, signal) {
  if (!['test', 'interactive'].includes(mode)) throw new Error('Demo local: invalid mode.');
  await withNewDemo(dialect, async capability => {
    await migrateDemo(capability);
    if (mode === 'test') {
      const { verifyDemoSeed } = await import('../test/integration/demo-seed.ts');
      await verifyDemoSeed(capability);
      console.log('Demo local: isolated seed integration passed (' + dialect + ').');
    } else {
      const connection = await openDemoConnection(capability);
      try {
        await seedDemo(connection, capability);
      } finally {
        await connection.end();
      }
      console.log('Demo local: isolated ' + dialect + ' database ready at 127.0.0.1:33317 with sample data.');
      console.log('Press Ctrl+C to remove the local demo resources.');
      for await (const _tick of setInterval(1000, undefined, { signal })) {
        // Keep the demo alive until interrupted.
      }
    }
  }, { signal });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  try {
    if (process.argv.length !== 4) throw new Error('Demo local: expected dialect and mode.');
    await run(process.argv[2], process.argv[3], controller.signal);
  } catch (error) {
    if (error?.name !== 'AbortError') {
      const message = error?.message?.startsWith('Demo local:') ? error.message : 'Demo local: setup, database operation or cleanup failed.';
      console.error(message);
      process.exitCode = 1;
    }
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  }
}

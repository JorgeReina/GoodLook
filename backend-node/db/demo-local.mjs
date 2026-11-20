import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { withNewDemo } from './demo-runtime.mjs';
import { migrateDemo } from './demo-guard.mjs';
import { seedDemo, openDemoConnection } from './demo-seed.mjs';

async function waitForDemoStop(signal) {
  if (signal.aborted) return;
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  const close = () => terminal.close();
  signal.addEventListener('abort', close, { once: true });
  try {
    await new Promise(resolve => {
      terminal.once('close', resolve);
      terminal.once('line', close);
      terminal.once('SIGINT', close);
      if (signal.aborted) close();
    });
  } finally {
    signal.removeEventListener('abort', close);
  }
}

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
      console.log('Press Enter to stop and remove the local demo resources.');
      await waitForDemoStop(signal);
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

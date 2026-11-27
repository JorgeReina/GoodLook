import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  timeout: 90_000,
  forbidOnly: Boolean(process.env.CI),
  reporter: 'list',
  use: {
    browserName: 'chromium',
    actionTimeout: 12_000,
    navigationTimeout: 15_000,
    serviceWorkers: 'allow',
    viewport: { width: 390, height: 850 },
    screenshot: 'off',
    video: 'off',
    trace: 'off',
  },
});

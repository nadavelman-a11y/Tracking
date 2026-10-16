import { defineConfig } from '@playwright/test';
import config from './playwright.config.js';

export default defineConfig({
  ...config,
  testMatch: 'shared.spec.js',
  use: { ...config.use, baseURL: 'http://127.0.0.1:5174' },
  webServer: [
    {
      command: 'npm run notes:dev',
      url: 'http://127.0.0.1:8787/health',
      reuseExistingServer: !process.env.CI,
      env: { WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: '/tmp/nina-wrangler-test.log', XDG_CONFIG_HOME: '/tmp/nina-wrangler-test-config' },
    },
    {
      command: 'npm run dev -- --port 5174 --strictPort',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: !process.env.CI,
      env: { VITE_SHARED_NOTES_URL: 'http://127.0.0.1:8787' },
    },
  ],
});

// Playwright, for the lobby's end-to-end smoke test (`e2e/`). It runs against the dev server (`npm run dev:client`),
// once in Chromium and once in WebKit as an iPhone 13, the engine every iPhone and iPad browser uses.
// The gateway address is a closed port, so the test sees what a player sees when the gateway is down.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const flyffwebRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const CLIENT_URL = 'http://localhost:5174/';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  reporter: 'list',
  use: { baseURL: CLIENT_URL },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'npm run dev:client -- --port 5174 --strictPort',
    url: CLIENT_URL,
    cwd: flyffwebRoot,
    env: { VITE_GATEWAY_URL: 'ws://127.0.0.1:9' },
    // Another dev server on this port would not have the closed gateway address.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});

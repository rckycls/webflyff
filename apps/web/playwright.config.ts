// Playwright for the admin panel's page (`npm run test:e2e:admin`). It runs against the demo server
// (apps/web/scripts/adminDemo.ts: made-up accounts in memory, no SQL Server, no game servers) in Chromium, on a desktop
// and as a phone held on its side. One login (the `setup` project) is shared: an authenticator code works only once,
// so every new login waits for a new code (e2e/codes.ts).

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const flyffwebRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const ADMIN_E2E_PORT = Number(process.env.E2E_ADMIN_PORT ?? '8099');
/** The demo's site Support / VIP API listens on the port below the panel's and takes POSTs from this origin (vip.spec.ts). */
export const SITE_E2E_ORIGIN = 'http://site.e2e.test';
const URL = `http://127.0.0.1:${ADMIN_E2E_PORT}`;
const STATE = path.join(flyffwebRoot, 'node_modules/.cache/admin-e2e/state.json');

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  use: { baseURL: URL },
  projects: [
    { name: 'setup', testMatch: /login\.setup\.ts/ },
    { name: 'chromium', testMatch: /\.spec\.ts/, dependencies: ['setup'], use: { ...devices['Desktop Chrome'], storageState: STATE } },
    { name: 'phone', testMatch: /\.spec\.ts/, dependencies: ['setup'], use: { ...devices['Pixel 7 landscape'], storageState: STATE } },
  ],
  webServer: {
    command: `node --import tsx apps/web/scripts/adminDemo.ts --port ${ADMIN_E2E_PORT} --site-port ${ADMIN_E2E_PORT - 1} --site-origin ${SITE_E2E_ORIGIN}`,
    cwd: flyffwebRoot,
    url: `${URL}/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});

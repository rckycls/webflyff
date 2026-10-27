// Playwright, for the client's end-to-end tests (`e2e/`). It runs against the dev server (`npm run dev:client`),
// twice in Chromium: on a desktop (`chromium`, with the mouse) and as a phone (`phone`, a Pixel 7 with touch), held on its
// side, as the game is played (Piece 4 spec §3.10: upright, a cover hides the page). Safari is not tested.
// The gateway address is a closed port, so the test sees what a player sees when the gateway is down.
//
// The world tests (`world.spec.ts`) also need the converter's output, `dist/assets`, which the dev server serves as the
// viewer's does (`serveDist`); they say so when it is missing. Chromium draws with SwiftShader (software WebGL), so their
// picture does not depend on the machine's GPU; there is one baseline per test file and name, for every platform, taken
// on the desktop.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const flyffwebRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const CLIENT_URL = 'http://localhost:5174/';
const SOFTWARE_GL = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

export default defineConfig({
  testDir: './e2e',
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
  timeout: 30_000,
  // Ruling R31: at most 4 tests at once. Each world test draws Flaris in software WebGL (SwiftShader in Chromium) on the
  // CPU, and with the default of half the logical cores (8 on the owner's 16) up to 8 worlds drawn side by side saturate
  // them: pages then ran no animation frame for tens of seconds, so clicks never saw an element stable and key events hung
  // (Task 26's full runs B, C, E and its control run).
  workers: 4,
  reporter: 'list',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  use: { baseURL: CLIENT_URL },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: { args: SOFTWARE_GL } } },
    { name: 'phone', use: { ...devices['Pixel 7 landscape'], launchOptions: { args: SOFTWARE_GL } } },
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

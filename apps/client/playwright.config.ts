// Playwright, for the client's end-to-end tests (`e2e/`). It runs against the dev server (`npm run dev:client`),
// twice in Chromium: on a desktop (`chromium`, with the mouse) and as a phone (`phone`, a Pixel 7 with touch), held on its
// side, as the game is played (Piece 4 spec §3.10: upright, a cover hides the page). Safari is not tested.
// The gateway address is a closed port, so the test sees what a player sees when the gateway is down.
//
// The world tests (`world.spec.ts`) also need the converter's output, `dist/assets`, which the dev server serves as the
// viewer's does (`serveDist`); they say so when it is missing.
//
// Two renderers (Piece 6 M5, Task 3): the tests draw on the machine's GPU, and only the pictures (tests tagged @picture,
// the `pictures` project, on the desktop) draw with SwiftShader (software WebGL), so that their baselines do not depend
// on the GPU: one baseline per test file and name, for every platform. SwiftShader drew every test before; on the owner's
// laptop (a 15 W Ryzen 7 5700U) it kept every core busy, the boost gave out after about 20 s, and a world of ~0.9 million
// triangles a frame then drew at 1-2 fps even alone: screenshots and frame waits timed out (the M5 ledger's probes). On
// its GPU the same four worlds draw at 20-24 fps. `E2E_SOFTWARE_GL=1` draws every test with SwiftShader again, for a
// machine with no usable GPU.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const flyffwebRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const CLIENT_URL = 'http://localhost:5174/';
const SOFTWARE_GL = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const GPU_GL = process.env.E2E_SOFTWARE_GL === '1' ? SOFTWARE_GL
  : [...(process.platform === 'win32' ? ['--use-angle=d3d11'] : []), '--enable-gpu', '--ignore-gpu-blocklist'];

export default defineConfig({
  testDir: './e2e',
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
  timeout: 30_000,
  // Ruling R31: at most 4 tests at once. With every world drawn in software WebGL on the CPU, the default of half the
  // logical cores (8 on the owner's 16) saturated them: pages then ran no animation frame for tens of seconds, so clicks
  // never saw an element stable and key events hung (Task 26's full runs B, C, E and its control run).
  workers: 4,
  reporter: 'list',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  use: { baseURL: CLIENT_URL },
  projects: [
    { name: 'chromium', grepInvert: /@picture/, use: { ...devices['Desktop Chrome'], launchOptions: { args: GPU_GL } } },
    { name: 'phone', grepInvert: /@picture/, use: { ...devices['Pixel 7 landscape'], launchOptions: { args: GPU_GL } } },
    { name: 'pictures', grep: /@picture/, use: { ...devices['Desktop Chrome'], launchOptions: { args: SOFTWARE_GL } } },
  ],
  webServer: {
    command: 'npm run dev:client -- --port 5174 --strictPort',
    url: CLIENT_URL,
    cwd: flyffwebRoot,
    // GATEWAY_PROXY emptied: one left in the owner's window would stop the dev server (both set), and empty is unset.
    env: { VITE_GATEWAY_URL: 'ws://127.0.0.1:9', GATEWAY_PROXY: '' },
    // Another dev server on this port would not have the closed gateway address.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});

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
// triangles a frame then drew at 1-2 fps even alone: screenshots and frame waits timed out (docs/piece6-m5-checkpoint.md). On
// its GPU the same four worlds draw at 20-24 fps. `E2E_SOFTWARE_GL=1` draws every test with SwiftShader again, for a
// machine with no usable GPU.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const flyffwebRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const CLIENT_URL = 'http://localhost:5174/';
const PREVIEW_URL = 'http://localhost:4174/';
/**
 * Where the `prod` project's build goes, relative to the client's root: a build with `VITE_TEST_HOOKS=1` must never be
 * `apps/client/dist`, the one the hosting guide publishes.
 */
const TEST_BUILD = '../../node_modules/.cache/client-firstload';
const SOFTWARE_GL = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const GPU_GL = process.env.E2E_SOFTWARE_GL === '1' ? SOFTWARE_GL
  : [...(process.platform === 'win32' ? ['--use-angle=d3d11'] : []), '--enable-gpu', '--ignore-gpu-blocklist'];

/** The projects `--project <name>` / `--project=<name>` name in `argv`, or null when none is named (all run). */
function namedProjects(argv: readonly string[]): Set<string> | null {
  const names = new Set<string>();
  argv.forEach((arg, i) => {
    if (arg === '--project' && argv[i + 1] !== undefined) names.add(argv[i + 1]!);
    else if (arg.startsWith('--project=')) names.add(arg.slice('--project='.length));
  });
  return names.size > 0 ? names : null;
}

// Playwright starts every `webServer` it is given, whatever the project: only the servers of the projects named on the
// command line are given (as the viewer's config does), all of them when none is named.
const named = namedProjects(process.argv);
const runs = (...projects: string[]): boolean => named === null || projects.some((p) => named.has(p));
/**
 * Tests of their own projects, never in the browser suite: the soak test's 10 minutes (`npm run test:soak:client`) and
 * the first-load budget on a production build (`npm run test:firstload:client`).
 */
const OWN_PROJECT = /@picture|@soak|@prod/;

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
    { name: 'chromium', grepInvert: OWN_PROJECT, use: { ...devices['Desktop Chrome'], launchOptions: { args: GPU_GL } } },
    { name: 'phone', grepInvert: OWN_PROJECT, use: { ...devices['Pixel 7 landscape'], launchOptions: { args: GPU_GL } } },
    { name: 'pictures', grep: /@picture/, use: { ...devices['Desktop Chrome'], launchOptions: { args: SOFTWARE_GL } } },
    // Piece 6 M5: the world's memory over ten minutes. Chromium gets precise heap numbers and `gc()`, so the heap read is
    // what is held, not what is waiting to be collected (as the viewer's soak project).
    {
      name: 'soak',
      grep: /@soak/,
      timeout: 20 * 60_000,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { args: [...GPU_GL, '--enable-precise-memory-info', '--js-flags=--expose-gc'] },
      },
    },
    // Piece 6 M5: the bytes a device downloads before the character is on screen, which only a production build shows.
    { name: 'prod', grep: /@prod/, use: { ...devices['Desktop Chrome'], baseURL: PREVIEW_URL, launchOptions: { args: GPU_GL } } },
  ],
  webServer: [
    ...(runs('chromium', 'phone', 'pictures', 'soak')
      ? [{
          command: 'npm run dev:client -- --port 5174 --strictPort',
          url: CLIENT_URL,
          cwd: flyffwebRoot,
          // GATEWAY_PROXY emptied: one left in the owner's window would stop the dev server (both set), and empty is unset.
          env: { VITE_GATEWAY_URL: 'ws://127.0.0.1:9', GATEWAY_PROXY: '' },
          // Another dev server on this port would not have the closed gateway address.
          reuseExistingServer: false,
          timeout: 120_000,
        }]
      : []),
    ...(runs('prod')
      ? [{
          command: `npm run build:client -- --outDir ${TEST_BUILD} --emptyOutDir && npm run preview:client -- --outDir ${TEST_BUILD} --port 4174 --strictPort`,
          url: PREVIEW_URL,
          cwd: flyffwebRoot,
          // the test hooks and the closed gateway address are built in; GATEWAY_PROXY is the dev server's only
          env: { VITE_TEST_HOOKS: '1', VITE_GATEWAY_URL: 'ws://127.0.0.1:9', GATEWAY_PROXY: '' },
          // never an older build: the one just made from these sources
          reuseExistingServer: false,
          timeout: 300_000,
        }]
      : []),
  ],
});

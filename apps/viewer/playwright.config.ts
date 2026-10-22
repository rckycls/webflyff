// Playwright, for the viewer's end-to-end tests (`e2e/`). Three projects:
//   dev   the dev server (`npm run dev:viewer`): every test not tagged @prod or @soak
//   soak  the same server: tests tagged @soak, 20 minutes each (`npm run test:soak`); Chromium also gets precise heap
//         numbers and `gc()`, so the memory the soak test reads is what is held, not what is waiting to be collected
//   prod  a production build (`vite build`, then `vite preview`): tests tagged @prod. Download sizes are only what a
//         device would get from minified code, so the first-load budget is measured here.
// Chromium draws with SwiftShader (software WebGL), so the pictures do not depend on the machine's GPU.
//
// Playwright starts every `webServer` it is given, whatever the project; so only the servers of the projects named on
// the command line (`--project dev`) are given, or both when none is named.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const viewerRoot = path.dirname(fileURLToPath(import.meta.url));
const flyffwebRoot = path.resolve(viewerRoot, '../..');

const DEV_URL = 'http://localhost:5173/';
const PREVIEW_URL = 'http://localhost:4173/';
const SOFTWARE_GL = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

/** The projects `--project <name>` / `--project=<name>` name in `argv`, or null when none is named (all run). */
function namedProjects(argv: readonly string[]): Set<string> | null {
  const names = new Set<string>();
  argv.forEach((arg, i) => {
    if (arg === '--project' && argv[i + 1] !== undefined) names.add(argv[i + 1]!);
    else if (arg.startsWith('--project=')) names.add(arg.slice('--project='.length));
  });
  return names.size > 0 ? names : null;
}

const named = namedProjects(process.argv);
const runs = (...projects: string[]): boolean => named === null || projects.some((p) => named.has(p));

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // One baseline per test file and name, for every platform: `e2e/__screenshots__/character.spec.ts/<name>.png`.
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
  timeout: 120_000,
  reporter: 'list',
  expect: {
    timeout: 30_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.01 },
  },
  use: {
    browserName: 'chromium',
    viewport: { width: 1280, height: 720 },
    launchOptions: { args: SOFTWARE_GL },
  },
  projects: [
    { name: 'dev', grepInvert: /@prod|@soak/, use: { baseURL: DEV_URL } },
    {
      name: 'soak',
      grep: /@soak/,
      timeout: 20 * 60_000,
      use: {
        baseURL: DEV_URL,
        launchOptions: { args: [...SOFTWARE_GL, '--enable-precise-memory-info', '--js-flags=--expose-gc'] },
      },
    },
    { name: 'prod', grep: /@prod/, use: { baseURL: PREVIEW_URL } },
  ],
  webServer: [
    ...(runs('dev', 'soak')
      ? [
          {
            command: 'npm run dev:viewer -- --port 5173 --strictPort',
            url: DEV_URL,
            cwd: flyffwebRoot,
            // A dev server always serves the current sources, so one already running will do.
            reuseExistingServer: true,
            timeout: 120_000,
          },
        ]
      : []),
    ...(runs('prod')
      ? [
          {
            command: 'npm run build:viewer && npm run preview:viewer -- --port 4173 --strictPort',
            url: PREVIEW_URL,
            cwd: flyffwebRoot,
            // Never an older build: the build has to be the one just made from these sources.
            reuseExistingServer: false,
            timeout: 300_000,
          },
        ]
      : []),
  ],
});

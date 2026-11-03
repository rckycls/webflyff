// The first-load budget (Piece 6 M5, spec §3.6: "≤ 15 MB downloaded before the character is on screen, counted
// compressed"), on a production build (the `prod` project: `vite build`, then `vite preview`), as the viewer's
// `character.spec.ts` checks its own. The bytes are each finished request's body as it came over the wire (Playwright's
// `responseBodySize`: the compressed size, as serveDist sends JSON, binaries and models), workers' requests included,
// from the page's first byte to `ready()`; what is still coming then (the town's music, streaming) is not counted. The
// page's own Resource Timing misses some (a texture worker's, an image the lobby asked for twice), so it only checks the
// other way: nothing the page timed escaped the listener.

import { expect, test } from '@playwright/test';
import type { Request } from '@playwright/test';
import { enterFlaris, playGateway } from './worldHarness';

const BUDGET = 15 * 1024 * 1024;

test('first load stays under 15 MB until the character is on screen', { tag: '@prod' }, async ({ page, baseURL }) => {
  await page.addInitScript(() => performance.setResourceTimingBufferSize(100_000));
  const origin = new URL(baseURL!).origin;
  const finished: Request[] = [];
  const requested = new Set<string>();
  page.on('request', (request) => requested.add(request.url()));
  page.on('requestfinished', (request) => { if (new URL(request.url()).origin === origin) finished.push(request); });
  await playGateway(page);
  await enterFlaris(page);

  const counted = [...finished];
  const sizes = await Promise.all(counted.map(async (request) => (await request.sizes()).responseBodySize));
  const bytes = sizes.reduce((sum, size) => sum + size, 0);
  const urls = new Set(counted.map((request) => request.url()));
  const timed = await page.evaluate(() => [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')]
    .map((entry) => entry.name).filter((name) => name.startsWith(location.origin)));
  test.info().annotations.push({ type: 'first load', description: `${bytes} bytes in ${urls.size} files` });
  // what the bytes are, by the folder under /assets/ (models, textures, data, music ...) or the build's own (client)
  const kinds = new Map<string, number>();
  counted.forEach((request, i) => {
    const kind = new URL(request.url()).pathname.split('/').filter(Boolean).slice(0, 2).join('/');
    kinds.set(kind, (kinds.get(kind) ?? 0) + sizes[i]!);
  });
  const byKind = [...kinds].sort((a, b) => b[1] - a[1]).map(([kind, size]) => `${kind} ${(size / 1048576).toFixed(1)} MB`);
  console.log(`first load: ${bytes} bytes in ${urls.size} files (${counted.length} requests): ${byKind.join(', ')}`);
  expect(timed.filter((name) => !requested.has(name)), 'files the page timed that the listener missed').toEqual([]);
  expect(bytes).toBeLessThanOrEqual(BUDGET);
  expect((await page.evaluate(() => window.__client!.perf())).errors).toEqual([]);
});

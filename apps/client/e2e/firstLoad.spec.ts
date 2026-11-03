// The first-load budget (Piece 6 M5, spec §3.6: "≤ 15 MB downloaded before the character is on screen, counted
// compressed"), on a production build (the `prod` project: `vite build`, then `vite preview`), as the viewer's
// `character.spec.ts` checks its own (15 MB read as 15 MiB, as there).
//
// What counts: every request to the site the page or its workers started before `ready()` (the character on screen),
// at its whole body as it came over the wire (Playwright's `responseBodySize`: the compressed size, as serveDist sends
// JSON, binaries and models), waited for if it was still coming. Media streams are not counted: the music streams
// while it plays (spec §9), and whether a track's request had ended at `ready()` was a race worth 2 MB. The page's own
// Resource Timing misses some (a worker's requests, an image the lobby asked for twice), so it checks the other way:
// every file it timed from before `ready()` was counted.

import { expect, test } from '@playwright/test';
import type { Request } from '@playwright/test';
import { enterFlaris, playGateway } from './worldHarness';

const BUDGET = 15 * 1024 * 1024;
/** The longest a request started before `ready()` may take to end afterwards. */
const FINISH_MS = 60_000;

test('first load stays under 15 MB until the character is on screen', { tag: '@prod' }, async ({ page, baseURL }) => {
  await page.addInitScript(() => performance.setResourceTimingBufferSize(100_000));
  const site = new URL(baseURL!).origin + '/';
  const started: Request[] = [];
  page.on('request', (request) => { if (request.url().startsWith(site)) started.push(request); });
  await playGateway(page);
  await enterFlaris(page);
  const readyAt = await page.evaluate(() => performance.timeOrigin + performance.now());

  const streams = started.filter((request) => request.resourceType() === 'media');
  const counted = started.filter((request) => request.resourceType() !== 'media');
  const sizes = await Promise.all(counted.map(async (request) => {
    const response = await request.response();
    if (response !== null) {
      const ended = await Promise.race([response.finished().then(() => true), new Promise<false>((r) => setTimeout(() => r(false), FINISH_MS))]);
      if (!ended) throw new Error(`${request.url()} had not ended ${FINISH_MS / 1000} s after the character was on screen`);
    }
    // a body Playwright cannot size (a failed request) is 0; responseBodySize is encodedDataLength less the headers, and
    // can come out a few bytes below 0
    return Math.max(0, (await request.sizes()).responseBodySize);
  }));
  const bytes = sizes.reduce((sum, size) => sum + size, 0);
  const urls = new Set(counted.map((request) => request.url()));

  // what the bytes are, by the folder under /assets/ (models, textures, data ...) or the build's own (client)
  const kinds = new Map<string, number>();
  counted.forEach((request, i) => {
    const kind = new URL(request.url()).pathname.split('/').filter(Boolean).slice(0, 2).join('/');
    kinds.set(kind, (kinds.get(kind) ?? 0) + sizes[i]!);
  });
  const mib = (n: number): string => (n / 1048576).toFixed(2);
  const byKind = [...kinds].sort((a, b) => b[1] - a[1]).map(([kind, size]) => `${kind} ${mib(size)}`);
  test.info().annotations.push({ type: 'first load', description: `${bytes} bytes (${mib(bytes)} MiB) in ${urls.size} files` });
  console.log(`first load: ${bytes} bytes (${mib(bytes)} MiB) in ${urls.size} files, ${streams.length} media streams not counted; MiB by kind: ${byKind.join(', ')}`);

  const timed = await page.evaluate((at) => performance.getEntriesByType('resource')
    .filter((entry) => performance.timeOrigin + entry.startTime < at && entry.name.startsWith(location.origin + '/'))
    .filter((entry) => !['audio', 'video'].includes((entry as PerformanceResourceTiming).initiatorType))
    .map((entry) => entry.name), readyAt);
  expect(timed.filter((name) => !urls.has(name)), 'files the page timed before ready() that the count missed').toEqual([]);
  expect((await page.evaluate(() => window.__client!.perf())).errors).toEqual([]);
  expect(bytes).toBeLessThanOrEqual(BUDGET);
});

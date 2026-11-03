// The first-load budget (Piece 6 M5, spec §3.6: "≤ 15 MB downloaded before the character is on screen, counted
// compressed"), on a production build (the `prod` project: `vite build`, then `vite preview`), as the viewer's
// `character.spec.ts` checks its own (15 MB read as 15 MiB, as there).
//
// What counts: every request to the site the page or its workers started before the world was first drawn, the
// character on screen (the client's `onScreenAt`, taken right after that frame), at its whole body as it came over the
// wire (Playwright's `responseBodySize`: the compressed size, as serveDist sends JSON, binaries and models), waited for
// if it was still coming. Not what was asked for after that frame, even while it still downloads: the ring of tiles
// around the 3 x 3 starts the frame after (Piece 6 M5, part B), and the moment the test noticed `ready()`, tens of ms
// later, counted it. Media streams are not counted: the music streams while it plays (spec §9), and whether a track's
// request had ended at `ready()` was a race worth 2 MB. The page's own Resource Timing misses some (a worker's requests,
// an image the lobby asked for twice), so it checks the other way: every file it timed from before that frame was
// counted.

import { expect, test } from '@playwright/test';
import type { Request } from '@playwright/test';
import { enterFlaris, playGateway } from './worldHarness';

const BUDGET = 15 * 1024 * 1024;
/** The longest a request started before the world was drawn may take to end afterwards. */
const FINISH_MS = 60_000;
/** Time for the request events of what started before the frame to reach the test (the network's events come apart from the page's). */
const EVENTS_MS = 1_000;

/**
 * The requests of `started` that began before `at` (ms since 1970, as `onScreenAt`). Playwright fills `timing()` in only
 * when a response comes (its `startTime` is 0 until then), so each response is waited for first, up to FINISH_MS: a
 * request still unanswered would otherwise read as begun at 0. One that failed has no start time and counts no bytes.
 */
async function startedBefore(started: readonly Request[], at: number): Promise<Request[]> {
  await Promise.all(started.map((request) =>
    Promise.race([request.response(), new Promise<null>((resolve) => setTimeout(() => resolve(null), FINISH_MS))])));
  return started.filter((request) => {
    const { startTime } = request.timing();
    return startTime > 0 && startTime < at;
  });
}

/** A tile of Flaris' ring: two tiles from Webby's, 13_6. */
function ringTile(url: string): boolean {
  const match = /\/worlds\/wdmadrigal\/tiles\/(\d+)_(\d+)\./.exec(url);
  return match !== null && Math.max(Math.abs(Number(match[1]) - 13), Math.abs(Number(match[2]) - 6)) === 2;
}

test('a request asked for after the first frame is not counted, even while its answer has not come', { tag: '@prod' }, async ({ page, baseURL }) => {
  const site = new URL(baseURL!).origin + '/';
  const started: Request[] = [];
  page.on('request', (request) => { if (request.url().startsWith(site)) started.push(request); });
  // the ring's tiles answer 5 s late: their requests are still waiting when they are sorted
  await page.route((url) => ringTile(url.href), async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    await route.continue();
  });
  await playGateway(page);
  await enterFlaris(page);
  const readyAt = (await page.evaluate(() => window.__client!.perf())).onScreenAt!;
  await page.waitForTimeout(EVENTS_MS);
  expect(started.filter((request) => ringTile(request.url())).length, 'the ring was asked for').toBeGreaterThan(0);
  const counted = await startedBefore(started, readyAt);
  expect(counted.filter((request) => ringTile(request.url())).map((request) => request.url())).toEqual([]);
});

test('first load stays under 15 MB until the character is on screen', { tag: '@prod' }, async ({ page, baseURL }) => {
  await page.addInitScript(() => performance.setResourceTimingBufferSize(100_000));
  const site = new URL(baseURL!).origin + '/';
  const started: Request[] = [];
  page.on('request', (request) => { if (request.url().startsWith(site)) started.push(request); });
  await playGateway(page);
  await enterFlaris(page);
  const readyAt = (await page.evaluate(() => window.__client!.perf())).onScreenAt!;
  expect(readyAt).not.toBeNull();
  await page.waitForTimeout(EVENTS_MS);

  const before = await startedBefore(started, readyAt);
  const streams = before.filter((request) => request.resourceType() === 'media');
  const counted = before.filter((request) => request.resourceType() !== 'media');
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
  console.log(`first load: ${bytes} bytes (${mib(bytes)} MiB) in ${urls.size} files, ${streams.length} media streams `
    + `and ${started.length - before.length} requests after the first frame not counted; MiB by kind: ${byKind.join(', ')}`);

  const timed = await page.evaluate((at) => performance.getEntriesByType('resource')
    .filter((entry) => performance.timeOrigin + entry.startTime < at && entry.name.startsWith(location.origin + '/'))
    .filter((entry) => !['audio', 'video'].includes((entry as PerformanceResourceTiming).initiatorType))
    .map((entry) => entry.name), readyAt);
  expect(timed.filter((name) => !urls.has(name)), 'files the page timed before the first frame that the count missed').toEqual([]);
  expect((await page.evaluate(() => window.__client!.perf())).errors).toEqual([]);
  expect(bytes).toBeLessThanOrEqual(BUDGET);
});

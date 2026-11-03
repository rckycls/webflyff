// The frame at a phone's speed (Piece 6 M5, part B; spec §3.6: "≥ 30 fps in Flaris town, standing and running, with the
// HUD open and monsters and players in view"). Chromium in the phone view with its CPU slowed 4x stands in for a weak
// phone's CPU, not its GPU: the frame was measured CPU-bound there, three.js' own render() taking most of it
// (docs/superpowers/plans/2026-11-03-piece6-m5b-fixes.md). The owner's device readings decide; this check is what the
// builder measures each fix with.
//
// Webby stands on Flaris' square with the soak's crowd (six Aibatts and three players), then runs forward. The fps and
// the frame's own work (`cpu`) are the Stats panel's, read every half second and averaged; the draw calls and triangles
// are the last read. Then, at full speed, the page's allocations over 10 s (Chromium's sampling heap profiler, objects
// collected by either GC included), in all and by function: what the per-frame allocation fixes are measured by.

import { expect, test } from '@playwright/test';
import type { CDPSession, Page } from '@playwright/test';
import type { ClientPerf } from '../src/testHooks';
import { crowdScript, enterFlaris, playGateway } from './worldHarness';

/** The CPU slowdown that stands in for a weak phone's CPU. */
const PHONE_CPU = 4;
const TARGET_FPS = 30;
/** Time for the tiles around the square, and the ring around them, to arrive. */
const SETTLE_MS = 5_000;
/** Time for the frame to settle after the slowdown or the first step. */
const EASE_MS = 3_000;
const SAMPLE_MS = 3_000;
const READ_EVERY_MS = 500;
const ALLOCATION_MS = 10_000;

interface Reading { fps: number; cpuMs: number; drawCalls: number; triangles: number }

const perfOf = (page: Page): Promise<ClientPerf> => page.evaluate(() => window.__client!.perf());

/** The Stats panel's fps and cpu averaged over `SAMPLE_MS`, and the last draw calls and triangles. */
async function read(page: Page): Promise<Reading> {
  const perfs: ClientPerf[] = [];
  for (let t = 0; t < SAMPLE_MS; t += READ_EVERY_MS) {
    await page.waitForTimeout(READ_EVERY_MS);
    perfs.push(await perfOf(page));
  }
  const mean = (values: number[]): number => values.reduce((sum, v) => sum + v, 0) / values.length;
  const last = perfs.at(-1)!;
  return {
    fps: mean(perfs.map((p) => p.fps)),
    cpuMs: mean(perfs.map((p) => p.cpuMs ?? 0)),
    drawCalls: last.drawCalls ?? 0,
    triangles: last.triangles ?? 0,
  };
}

interface ProfileNode { callFrame: { functionName: string; url: string; lineNumber: number }; selfSize: number; children: ProfileNode[] }

/** The bytes allocated per second over `ALLOCATION_MS`, in all and by function (`name file:line`), largest first. */
async function allocations(cdp: CDPSession): Promise<{ total: number; top: Array<[string, number]> }> {
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.startSampling', {
    samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true,
  });
  await new Promise((resolve) => setTimeout(resolve, ALLOCATION_MS));
  const { profile } = await cdp.send('HeapProfiler.stopSampling') as unknown as { profile: { head: ProfileNode } };
  const byFunction = new Map<string, number>();
  let total = 0;
  const walk = (node: ProfileNode): void => {
    const { functionName, url, lineNumber } = node.callFrame;
    const name = `${functionName || '(anonymous)'} ${url.split('/').pop()!.split('?')[0]}:${lineNumber + 1}`;
    total += node.selfSize;
    if (node.selfSize > 0) byFunction.set(name, (byFunction.get(name) ?? 0) + node.selfSize);
    node.children.forEach(walk);
  };
  walk(profile.head);
  const seconds = ALLOCATION_MS / 1000;
  const top = [...byFunction].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, bytes]): [string, number] => [name, bytes / seconds]);
  return { total: total / seconds, top };
}

const mbs = (bytesPerSecond: number): string => (bytesPerSecond / 1048576).toFixed(2);

test('a phone-speed CPU keeps 30 fps in Flaris, standing and running, with a crowd in view', { tag: '@perf' }, async ({ page }) => {
  await playGateway(page, crowdScript());
  await enterFlaris(page);
  await page.waitForTimeout(SETTLE_MS);
  const cdp = await page.context().newCDPSession(page);

  await cdp.send('Emulation.setCPUThrottlingRate', { rate: PHONE_CPU });
  await page.waitForTimeout(EASE_MS);
  const standing = await read(page);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1_000);
  const running = await read(page);
  await page.keyboard.up('KeyW');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  const allocated = await allocations(cdp);
  const line = `frame rate: standing ${standing.fps.toFixed(1)} fps (cpu ${standing.cpuMs.toFixed(1)} ms), `
    + `running ${running.fps.toFixed(1)} fps (cpu ${running.cpuMs.toFixed(1)} ms), draws ${standing.drawCalls}, `
    + `triangles ${standing.triangles}; allocations ${mbs(allocated.total)} MB/s`;
  console.log([line, ...allocated.top.map(([name, rate]) => `  ${mbs(rate)} MB/s ${name}`)].join('\n'));
  test.info().annotations.push({ type: 'frame rate', description: line });

  expect((await perfOf(page)).errors).toEqual([]);
  expect(standing.fps, `standing, CPU ${PHONE_CPU}x slower`).toBeGreaterThanOrEqual(TARGET_FPS);
  expect(running.fps, `running, CPU ${PHONE_CPU}x slower`).toBeGreaterThanOrEqual(TARGET_FPS);
});

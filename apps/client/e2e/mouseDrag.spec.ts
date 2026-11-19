// 2026-11-20 (mouse-drag, docs/2026-11-20-mouse-drag.md): V15's mouse on a computer: the wheel's zoom, a right drag
// that turns the camera from its first pixel, a left press on the ground that walks as it goes down (held past the old
// 300 ms tap), and both buttons pressed together jumping. The phone keeps its own gestures (controls.spec.ts).

import { expect, test } from '@playwright/test';
import { PacketType } from '@flyffweb/protocol';
import { enterFlaris, movedState, ownAt, playGateway, sentOf } from './worldHarness';

test.setTimeout(120_000);

type Vec3 = [number, number, number];
const apart = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('V15 mouse: wheel zoom, right drag from the first pixel, a walk at the press, both buttons jump', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a mouse');
  const gateway = await playGateway(page);
  await enterFlaris(page);
  await page.evaluate(() => window.__client!.pause());
  await page.evaluate(() => window.__client!.step(5));
  const size = page.viewportSize()!;
  const camera = (): Promise<Vec3> => page.evaluate(() => window.__client!.camera() as [number, number, number]);
  const at = await ownAt(page);

  // the wheel rolled toward the player: in, 1 m a notch (OnMouseWheel)
  const far = apart(await camera(), at);
  await page.mouse.move(size.width * .5, size.height * .3);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, 100);
  await page.evaluate(() => window.__client!.step(60));
  const near = apart(await camera(), at);
  expect(near).toBeLessThan(far - 3);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -100);
  await page.evaluate(() => window.__client!.step(60));
  expect(apart(await camera(), at)).toBeCloseTo(far, 0);

  // a right drag of 5 px turns the camera (no 8 px wait)
  const before = await camera();
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(size.width * .5 + 5, size.height * .3);
  await page.mouse.up({ button: 'right' });
  await page.evaluate(() => window.__client!.step(30));
  expect(apart(await camera(), before)).toBeGreaterThan(.05);

  // a left press on the ground held 400 ms walks as it went down (a SNAPSHOT with DESTPOS before the let-go)
  const walks = sentOf(gateway, PacketType.SNAPSHOT).length;
  await page.mouse.move(size.width * .5, size.height * .72);
  await page.mouse.down();
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__client!.step(2));
  await expect.poll(() => sentOf(gateway, PacketType.SNAPSHOT).length).toBeGreaterThan(walks);
  await page.mouse.up();
  await page.evaluate(() => window.__client!.step(240));

  // both buttons pressed together: a jump (ControlGround, WndWorldControlPlayer.cpp:499-506)
  const jumps = (): number => sentOf(gateway, PacketType.PLAYERBEHAVIOR).filter((p) => (movedState(p) & 0xf000) === 0x5000).length;
  const jumped = jumps();
  await page.mouse.move(size.width * .5, size.height * .3);
  await page.mouse.down({ button: 'right' });
  await page.mouse.down({ button: 'left' });
  await page.evaluate(() => window.__client!.step(1));
  await expect.poll(jumps).toBeGreaterThan(jumped);
  await page.mouse.up({ button: 'left' });
  await page.mouse.up({ button: 'right' });
  await page.screenshot({ path: test.info().outputPath('mouse-drag.png') });
});

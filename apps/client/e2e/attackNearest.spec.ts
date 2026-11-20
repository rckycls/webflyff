// custom (owner 2026-11-20): the phone Attack button with nothing selected takes the nearest monster outside town, 15 m
// round the player (combat/attackNearest.ts); in town (V15's RA_TOWN, combat/townRegions.ts) it is as before. Phone only:
// the desktop has no Attack button. The servers, Flaris and the helpers are worldHarness.ts's.

import { expect, test } from '@playwright/test';
import type { Vec3 } from '@flyffweb/protocol';
import { PacketType } from '@flyffweb/protocol';
import { createWorldScript, writeAddMonster, writeAddSelf } from '@flyffweb/testkit';
import {
  MADRIGAL, MONSTER_AT, MONSTER_ID, ON_FRAMES, SELF_ID, SQUARE, aibatt, enterFlaris, groundAt, playGateway, self, sentOf,
  tapMover, targetsOf,
} from './worldHarness';
import type { Gateway } from './worldHarness';

test.describe.configure({ timeout: 120_000 });

/** Outside Flaris's RA_TOWN rects, 82 m south of its square, facing south (D3D -z) as there. */
const FIELD: Vec3 = [6968, groundAt(6968, 3410), 3410];
/** 6 m ahead of the player on the field and 2.5 m to the side, as MONSTER_AT is on the square. */
const NEAR: Vec3 = [6965.5, groundAt(6965.5, 3404), 3404];
/** 20 m ahead: past the button's 15 m. */
const FAR: Vec3 = [6968, groundAt(6968, 3390), 3390];
const NEAR_ID = MONSTER_ID + 10;

/** The MELEE_ATTACKs the page sent at `targetId`. */
const swingsAt = (gateway: Gateway, targetId: number) =>
  sentOf(gateway, PacketType.MELEE_ATTACK).filter((s) => s.body.readUInt32LE(12) === targetId);

test('outside town, nothing selected: greyed with the only Aibatt 20 m off; one 6 m off comes, Attack takes it and fights it', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the Attack button is the phone\'s');
  const script = createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: FIELD,
    self: writeAddSelf(SELF_ID, { ...self, pos: FIELD }), others: [writeAddMonster(MONSTER_ID, { ...aibatt, pos: FAR })],
  });
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  const attack = page.locator('.hud-attack');
  await expect(attack).toBeVisible();
  await page.waitForTimeout(1500); // frames run: nothing within 15 m, the button stays greyed
  await expect(attack).toBeDisabled();
  expect(targetsOf(gateway)).toEqual([]);

  gateway.pushCache(script.later([writeAddMonster(NEAR_ID, { ...aibatt, objectId: NEAR_ID, pos: NEAR })]));
  await expect(attack).toBeEnabled(ON_FRAMES);
  await attack.tap();
  // selected as a tap selects it (SETTARGET, the target bar), the near one, then attacked
  await expect.poll(() => targetsOf(gateway).map(([id]) => id), ON_FRAMES).toContain(NEAR_ID);
  expect(targetsOf(gateway).some(([id]) => id === MONSTER_ID)).toBe(false);
  await expect(page.locator('.hud-target')).toBeVisible(ON_FRAMES);
  await expect(page.locator('.hud-target-name')).toContainText('Aibatt', ON_FRAMES);
  await expect.poll(() => swingsAt(gateway, NEAR_ID).length, ON_FRAMES).toBeGreaterThan(0);
  expect(swingsAt(gateway, MONSTER_ID)).toEqual([]);
  expect((await page.evaluate(() => window.__client!.stats())).errors).toEqual([]);
});

test('in town (Flaris\'s square), nothing selected: Attack stays greyed with an Aibatt 6 m off; a tap on it first, as before', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the Attack button is the phone\'s');
  const script = createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, self), others: [writeAddMonster(MONSTER_ID, { ...aibatt, pos: MONSTER_AT })],
  });
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  const attack = page.locator('.hud-attack');
  await expect(attack).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(attack).toBeDisabled();
  expect(targetsOf(gateway)).toEqual([]);

  // as before: a tap on the Aibatt selects it, and the button attacks it
  await tapMover(page, MONSTER_ID);
  await expect.poll(() => targetsOf(gateway).some(([id]) => id === MONSTER_ID), ON_FRAMES).toBe(true);
  await expect(attack).toBeEnabled(ON_FRAMES);
  await attack.tap();
  await expect.poll(() => swingsAt(gateway, MONSTER_ID).length, ON_FRAMES).toBeGreaterThan(0);
  expect((await page.evaluate(() => window.__client!.stats())).errors).toEqual([]);
});

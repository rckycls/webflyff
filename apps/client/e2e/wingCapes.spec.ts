// 2026-11-17 (wing capes, a custom item of this server): the 11 flying wings copied as cloaks (II_ARM_S_CLO_WING_*,
// 20250-20260, Resource/defineItem.h), worn on the back. Webby wears the Angelic Wings Cape from the character list, and
// eleven players of both bodies stand in a row in front of it, one cape each, their backs to the camera; a twelfth flies
// by on a Hover Board, its cape hidden. Running plays the wings' walk. The bag's preview and character select show them
// too (pictures). The capes are Resource-only items: the catalog needs the gear sync after `npm run convert -- --only data`
// (`npx tsx tools/sync_resource_gear_catalog.ts`); without them the tests are skipped.

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { AssetIndex, WebItemProp } from '@flyffweb/formats';
import type { AddedMover, Vec3, WornPart } from '@flyffweb/protocol';
import { NULL_ID } from '@flyffweb/protocol';
import { createWorldScript, newVagrantOwn, writeAddPlayer, writeAddSelf } from '@flyffweb/testkit';
import {
  BASE, FEMALE_VAGRANT, MADRIGAL, MALE_VAGRANT, MI_FEMALE, MI_MALE, ON_FRAMES, SELF_ID, SELF_PLAYER, SQUARE, enterFlaris,
  groundAt, logIn, playGateway, readAsset, self,
} from './worldHarness';

test.setTimeout(180_000);

/** `II_ARM_S_CLO_WING_FEATHER01` .. `_BUTTERFLY05` (Resource/defineItem.h): the eleven wing capes. */
const WING_CAPES = [20250, 20251, 20252, 20253, 20254, 20255, 20256, 20257, 20258, 20259, 20260];
/** `II_ARM_S_CLO_WING_ANGEL01`, the Angelic Wings Cape: Webby's. */
const ANGELIC = 20252;
/** `PARTS_CLOAK`, `PARTS_RIDE` (`Resource/defineNeuz.h`), `OBJSTAF_FLY` and the Hover Board (`II_RID_RID_BOA_HOVER`). */
const PARTS_CLOAK = 8;
const PARTS_RIDE = 13;
const FLY = 8;
const HOVER_BOARD = 5101;
const FLIER_ID = 9300;

const isTouch = (): boolean => test.info().project.use.hasTouch === true;

const catalog = (): WebItemProp[] => readAsset<WebItemProp[]>(readAsset<AssetIndex>('index.json').files['data/itemProps.json']!);
const hasCapes = (): boolean => catalog().some((item) => item.id === ANGELIC);

const ground = (x: number, z: number): Vec3 => [x, groundAt(x, z), z];
const clothes = (female: boolean): WornPart[] =>
  female ? FEMALE_VAGRANT : MALE_VAGRANT.map((itemId, i) => ({ part: [2, 4, 5][i]!, itemId, flag: 0 }));

/** A player wearing `cape`, its back to the camera (angle 0, as Webby's). */
function wearer(objectId: number, female: boolean, cape: number, pos: Vec3, extra: Partial<AddedMover> = {}): AddedMover {
  return {
    ...BASE, index: female ? MI_FEMALE : MI_MALE, pos, angle: 0, objectId, isPlayer: true, ...extra,
    player: {
      ...SELF_PLAYER, self: false, sex: female ? 1 : 0, name: `Cape${objectId}`, playerId: objectId, hairMesh: female ? 2 : 0,
      equipmentObjectIds: [], worn: [...clothes(female), { part: PARTS_CLOAK, itemId: cape, flag: 0 }],
      ...(extra.stateFlag === FLY ? { fuel: 1200 } : {}),
    },
  };
}

/** The row: eleven players 1.1 m apart, 4 m in front of Webby, men and women by turns. */
const ROW: AddedMover[] = WING_CAPES.map((cape, i) => wearer(9200 + i, i % 2 === 1, cape, ground(SQUARE[0] - 5.5 + 1.1 * i, SQUARE[2] - 4)));
/** A woman flying 6 m up on a Hover Board, in her cape. */
const FLIER = (() => {
  const at = ground(SQUARE[0] + 2, SQUARE[2] - 7);
  const flier = wearer(FLIER_ID, true, WING_CAPES[6]!, [at[0], at[1] + 6, at[2]], { stateFlag: FLY });
  flier.player!.worn = [...flier.player!.worn, { part: PARTS_RIDE, itemId: HOVER_BOARD, flag: 0 }];
  return flier;
})();

const LISTED = { listed: { level: 15, equipment: [...MALE_VAGRANT, ANGELIC] } };
/** The cape's place in Webby's bag. */
const CAPE_OBJECT = 46;
/** Webby with a new Vagrant's bag and the cape: worn are the suit, gauntlets and boots (objects 0, 42, 43) and the cape. */
function webby(): AddedMover {
  const own = newVagrantOwn();
  own.inventory!.push({ objectId: CAPE_OBJECT, itemId: ANGELIC, count: 1 });
  const wornAt: Record<number, number> = { 2: 0, 4: 42, 5: 43, [PARTS_CLOAK]: CAPE_OBJECT };
  const equipmentObjectIds = Array.from({ length: 31 }, (_, part) => wornAt[part] ?? NULL_ID);
  return { ...self, player: { ...SELF_PLAYER, own, equipmentObjectIds } };
}
const script = () => createWorldScript({
  playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE, self: writeAddSelf(SELF_ID, webby()),
  others: [...ROW, FLIER].map((p) => writeAddPlayer(p.objectId, p)),
});

const capesOf = async (page: Page) => page.evaluate(() => window.__client!.wingCapes?.() ?? []);

test.beforeEach(() => {
  test.skip(!hasCapes(), 'the catalog lacks the wing capes: run the gear sync after `npm run convert -- --only data`');
});

test('wing capes: drawn on the backs of Webby and of eleven players of both bodies, standing; a flier\'s is hidden', async ({ page }, info) => {
  await playGateway(page, script(), LISTED);
  await enterFlaris(page);
  await expect.poll(async () => (await capesOf(page)).length, ON_FRAMES).toBe(13);
  const capes = await capesOf(page);
  expect(capes.find((c) => c.objectId === SELF_ID)).toMatchObject({ itemId: ANGELIC, drawn: true, playing: 'stand' });
  for (const [i, mover] of ROW.entries()) {
    expect(capes.find((c) => c.objectId === mover.objectId)).toMatchObject({ itemId: WING_CAPES[i], drawn: true, playing: 'stand' });
  }
  expect(capes.find((c) => c.objectId === FLIER_ID)).toMatchObject({ drawn: false });
  await page.waitForTimeout(1500); // the wings flap a little
  await page.screenshot({ path: info.outputPath('standing.png') });
  expect((await page.evaluate(() => window.__client!.stats())).errors).toEqual([]);
});

test('wing capes: running plays the wings\' walk, standing again their stand', async ({ page }, info) => {
  test.skip(isTouch(), "W is the PC's key; the phone's pictures are of the capes standing");
  await playGateway(page, script(), LISTED);
  await enterFlaris(page);
  const own = async () => (await capesOf(page)).find((c) => c.objectId === SELF_ID);
  await expect.poll(own, ON_FRAMES).toMatchObject({ playing: 'stand' });
  await page.keyboard.down('w');
  await expect.poll(async () => (await own())?.playing, ON_FRAMES).toBe('walk');
  await page.waitForTimeout(600);
  await page.screenshot({ path: info.outputPath('running.png') });
  await page.keyboard.up('w');
  await expect.poll(async () => (await own())?.playing, ON_FRAMES).toBe('stand');
  expect((await page.evaluate(() => window.__client!.stats())).errors).toEqual([]);
});

test('wing capes: the bag\'s preview shows Webby\'s', async ({ page }, info) => {
  await playGateway(page, script(), LISTED);
  await enterFlaris(page);
  const bag = page.locator('.hud-inventory');
  if (isTouch()) await page.getByRole('button', { name: 'Bag', exact: true }).tap();
  else await page.keyboard.press('i');
  await expect(bag).toBeVisible();
  await page.waitForTimeout(3000); // the preview comes back from the GPU's asynchronous read
  await bag.screenshot({ path: info.outputPath('bag.png') });
});

test('wing capes: character select shows Webby\'s', async ({ page }, info) => {
  await playGateway(page, script(), LISTED);
  await page.goto('/play/');
  await logIn(page);
  await page.getByRole('button', { name: /Channel 1/ }).click();
  await expect(page.locator('.cs-portrait canvas').first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: info.outputPath('select.png') });
});

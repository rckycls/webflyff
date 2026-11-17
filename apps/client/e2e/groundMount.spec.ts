// 2026-11-18: the ground mount prototype (src/world/mount/groundMount.ts), played against a scripted world server on the
// desktop (the bag's double-click) and on the phone (the bag's Use): the Grey Wolf Mount's DOUSEITEM, the server's cast and
// buff, the wolf under the own male rider and under a female rider in view, the run with the mount for another player,
// getting off while running (no cast, no "stand up" refusal), and the wolf gone. Each step leaves a picture in the
// test's output folder.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { NULL_ID, PacketType } from '@flyffweb/protocol';
import type { AddedMover, Vec3 } from '@flyffweb/protocol';
import {
  createWorldScript, newVagrantOwn, writeAddPlayer, writeAddSelf, writeMoverMoved, writeRemoveSkillInfluence,
  writeSetDestParam, writeSetSkillState, writeStateMode,
} from '@flyffweb/testkit';
import type { WorldScript } from '@flyffweb/testkit';
import {
  ANILOOP_LOOP, BASE, FEMALE_VAGRANT, MADRIGAL, MI_FEMALE, MTI_RUN, OBJSTA_FMOVE, ON_FRAMES, SELF_ID, SELF_PLAYER, SQUARE,
  enterFlaris, groundAt, playGateway, readAsset, self, sentOf,
} from './worldHarness';
import type { Gateway } from './worldHarness';

test.setTimeout(150_000);

const MOUNT = 20270;
const BUFF_ITEM = 0;
const MOUNT_TIME = 999_999_999;
const DST_SPEED = 11;
/** STATE_BASEMOTION_MODE, and STATEMODE's ON and OFF flags (the cast). */
const BASEMOTION = 4;
const ON = 0;
const OFF = 1;
const RIDER_ID = 9050;
const RIDER_AT: Vec3 = [SQUARE[0] - 4, groundAt(SQUARE[0] - 4, SQUARE[2] - 3), SQUARE[2] - 3];

const isPhone = (): boolean => test.info().project.use.hasTouch === true;

/** A female player ahead on the right, side on (facing east), dressed as a vagrant. */
const rider: AddedMover = {
  ...BASE, index: MI_FEMALE, pos: RIDER_AT, angle: 90, objectId: RIDER_ID, isPlayer: true,
  player: { ...SELF_PLAYER, self: false, name: 'Rider', playerId: 602, level: 30, equipmentObjectIds: [], worn: FEMALE_VAGRANT },
};

/** Webby (male) with the Grey Wolf Mount at bag slot 3. */
function scriptOf(): WorldScript {
  const own = newVagrantOwn();
  own.inventory!.push({ objectId: 3, itemId: MOUNT, count: 1 });
  own.inventory!.sort((a, b) => a.objectId - b.objectId);
  return createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE,
    self: writeAddSelf(SELF_ID, { ...self, player: { ...SELF_PLAYER, own, equipmentObjectIds: Array(31).fill(NULL_ID) } }),
    others: [writeAddPlayer(RIDER_ID, rider)],
  });
}

/** The bag's item objects of the DOUSEITEMs sent. */
const used = (gateway: Gateway): number[] => sentOf(gateway, PacketType.DOUSEITEM).map((s) => s.body.readUInt32LE(8) >>> 16);
const mounts = (page: Page) => page.evaluate(() => window.__client!.mounts!());
const drawnIds = async (page: Page): Promise<number[]> => (await mounts(page)).filter((m) => m.drawn).map((m) => m.objectId).sort();

/** Opens the bag (I on the PC, its button on the phone). */
async function openBag(page: Page): Promise<void> {
  if (isPhone()) await page.getByRole('button', { name: 'Bag', exact: true }).click();
  else await page.keyboard.press('i');
  await expect(page.locator('.hud-inventory [data-bag-slot="3"]')).toBeVisible(ON_FRAMES);
}

/** Uses the mount at bag slot 3: a double-click on the PC, a tap and Use on the phone. */
async function useMount(page: Page): Promise<void> {
  const bag = page.locator('.hud-inventory');
  const cell = bag.locator('[data-bag-slot="3"]');
  if (isPhone()) {
    await cell.click();
    await bag.locator('[data-item-action="use"]').click();
  } else {
    await cell.dblclick();
  }
}

async function closeBag(page: Page): Promise<void> {
  const bag = page.locator('.hud-inventory');
  await bag.locator('.hud-window-close').click();
  await expect(bag).toBeHidden();
}

test('the Grey Wolf Mount: used, cast, ridden by both bodies, faster, and off again while running', async ({ page }, info) => {
  // the pictures: the whole screen, and a close-up round the riders; the stats panel hidden (shown in a worktree whose
  // older assets lack newer UI pictures)
  const shot = async (name: string): Promise<void> => {
    await page.addStyleTag({ content: '#overlay { display: none !important; }' });
    await page.waitForTimeout(400);
    await page.screenshot({ path: info.outputPath(`${name}.png`) });
    const view = page.viewportSize()!;
    const at = await page.evaluate((ids) => ids.map((id) => window.__client!.screenOf(id)), [SELF_ID, RIDER_ID]);
    const shown = at.filter((p): p is [number, number] => p !== null && p.every((share) => share >= 0 && share <= 1));
    if (shown.length === 0 || isPhone()) return; // the phone's picture is sharp enough whole
    const cx = (shown.reduce((s, p) => s + p[0], 0) / shown.length) * view.width;
    const cy = (shown.reduce((s, p) => s + p[1], 0) / shown.length) * view.height;
    const width = Math.min(view.width, 520), height = Math.min(view.height, 300);
    const x = Math.max(0, Math.min(view.width - width, cx - width / 2));
    const y = Math.max(0, Math.min(view.height - height, cy - height / 2));
    await page.screenshot({ path: info.outputPath(`${name}-zoom.png`), clip: { x, y, width, height } });
  };
  const script = scriptOf();
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  const movers = readAsset<{ files: Record<string, string> }>('index.json').files['data/movers.json']!;
  const female = readAsset<Array<{ index: number; speed: number }>>(movers).find((m) => m.index === MI_FEMALE)!;

  // the other player mounted: its wolf, and its run with +50%
  gateway.pushCache(script.later([writeSetSkillState(RIDER_ID, RIDER_ID, BUFF_ITEM, MOUNT, 1, MOUNT_TIME)]));
  await expect.poll(() => drawnIds(page), ON_FRAMES).toEqual([RIDER_ID]);
  const riderSpeed = (await mounts(page)).find((m) => m.objectId === RIDER_ID)!.speed;
  expect(riderSpeed).toBeCloseTo(Math.fround(female.speed * 1.5), 5);

  // the item: DOUSEITEM for its object; the server's 1 s cast, then the buff and the run
  await openBag(page);
  await useMount(page);
  await expect.poll(() => used(gateway)).toEqual([3]);
  gateway.pushCache(script.later([writeStateMode(SELF_ID, BASEMOTION, ON, MOUNT)]));
  await page.waitForTimeout(1000);
  gateway.pushCache(script.later([
    writeStateMode(SELF_ID, 0, OFF), writeSetSkillState(SELF_ID, SELF_ID, BUFF_ITEM, MOUNT, 1, MOUNT_TIME),
    writeSetDestParam(SELF_ID, DST_SPEED, 50, -1),
  ]));
  await expect.poll(() => drawnIds(page), ON_FRAMES).toEqual([SELF_ID, RIDER_ID].sort());
  await closeBag(page);
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(350);
  await page.keyboard.up('ArrowLeft');
  await shot('mounted-standing');

  // both run south side by side (the same run with the mount), the camera swung round to their side
  const ahead: Vec3 = [RIDER_AT[0], RIDER_AT[1], RIDER_AT[2] - 30];
  gateway.pushCache(script.later([writeMoverMoved(RIDER_ID, {
    pos: ahead, delta: [0, 0, 0], angle: 0, state: OBJSTA_FMOVE, stateFlag: 0, motion: MTI_RUN, motionEx: 0, loop: ANILOOP_LOOP,
    motionOption: 0, tick: 123456789n,
  })]));
  await page.keyboard.down('w');
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(700);
  await page.keyboard.up('ArrowLeft');
  await shot('mounted-running');

  // off while running: DOUSEITEM again at once (no cast, no refusal), then the buff's end takes the wolf away
  await openBag(page);
  await useMount(page);
  await expect.poll(() => used(gateway)).toEqual([3, 3]);
  await page.keyboard.up('w');
  gateway.pushCache(script.later([writeRemoveSkillInfluence(SELF_ID, BUFF_ITEM, MOUNT)]));
  await expect.poll(() => drawnIds(page), ON_FRAMES).toEqual([RIDER_ID]);
  await closeBag(page);
  await shot('dismounted');
  // the mount's own files only: a worktree's older assets may lack newer UI pictures
  const errors = (await page.evaluate(() => window.__client!.stats())).errors;
  expect(errors.filter((e) => /mount|lawolf|genfstand1-c|genfrunning1-c/i.test(String(e)))).toEqual([]);
});

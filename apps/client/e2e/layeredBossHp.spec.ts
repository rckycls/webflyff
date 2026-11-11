// 2026-11-11: layered boss HP (a server addition, HP_LAYER 0x9A00, world/hpLayer.ts), against a scripted world server on
// the desktop (clicks) and the phone (taps). The messages are in the order the patched world server sends them: the hit's
// DAMAGE (CAttackArbiter::OnDamaged), SETPOINTPARAM of the new bar's HP (EndPVP) and HP_LAYER (FlushHpLayer); HP_LAYER
// right after ADD_OBJ for a viewer the boss comes into view of (CUser::AddAddObj). The target bar shows "xN", the bars
// left with the current one, right of its gauge; a normal monster shows none. Each step leaves a picture in the test's
// output folder.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { AttackFlag, DstParam } from '@flyffweb/protocol';
import type { AddedMover, Vec3 } from '@flyffweb/protocol';
import {
  createWorldScript, newVagrantOwn, writeAddMonster, writeAddSelf, writeDamage, writeHpLayer, writeMoverDeath,
  writeSetPointParam,
} from '@flyffweb/testkit';
import type { ScriptMessage } from '@flyffweb/testkit';
import {
  MADRIGAL, MONSTER_ID, OBJMSG_DAMAGE, ON_FRAMES, SELF_ID, SELF_PLAYER, SQUARE, aibatt, enterFlaris, groundAt, playGateway,
  self, tapMover,
} from './worldHarness';

test.setTimeout(150_000);

/** `MI_AIBATT1`: the Small Aibatt, `dwAddHp` 120 (propMover.txt), the boss here; one bar is 120 HP. */
const MI_AIBATT1 = 20;
const BAR = 120;
const PLAIN_ID = 9301;
const LATE_ID = 9302;
const at = (x: number, z: number): Vec3 => [x, groundAt(x, z), z];

const webby: AddedMover = { ...self, hitPoint: 230, player: { ...SELF_PLAYER, own: newVagrantOwn() } };
const boss: AddedMover = { ...aibatt, index: MI_AIBATT1, pos: at(6965, 3324), hitPoint: BAR };
const plain: AddedMover = { ...aibatt, objectId: PLAIN_ID, pos: at(6970, 3322) };
const late: AddedMover = { ...boss, objectId: LATE_ID, pos: at(6972.5, 3322), hitPoint: 75 };

const isPhone = (): boolean => test.info().project.use.hasTouch === true;
const hit = (objectId: number, damage: number): ScriptMessage => writeDamage(objectId, SELF_ID, damage, AttackFlag.GENERIC);

test('layered boss HP: xN through a hit, an exact bar, a multi-bar overflow, a reset, the last bar and a late joiner', async ({ page }, info) => {
  const script = createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE, self: writeAddSelf(SELF_ID, webby),
    // the boss's ADD_OBJ and, right after it, its bars (CUser::AddAddObj); the plain monster has none
    others: [writeAddMonster(MONSTER_ID, boss), writeHpLayer(MONSTER_ID, 5, 5, BAR, BAR), writeAddMonster(PLAIN_ID, plain)],
  });
  const gateway = await playGateway(page, script);
  await enterFlaris(page);
  const target = page.locator('.hud-target');
  const bars = target.locator('.hud-target-bars');
  const hp = target.locator('.hud-target-info');
  const push = (messages: ScriptMessage[]) => gateway.pushCache(script.later(messages));
  const shot = async (name: string) => {
    await page.waitForTimeout(300);
    await page.screenshot({ path: info.outputPath(`${name}.png`) });
  };
  const state = async (): Promise<[string, string]> => [(await hp.textContent()) ?? '', (await bars.isVisible()) ? (await bars.textContent()) ?? '' : ''];

  // a normal monster: no xN
  await tapMover(page, PLAIN_ID);
  await expect(target).toBeVisible(ON_FRAMES);
  await expect(bars).toBeHidden();

  // the boss: five bars, the first full
  await tapMover(page, MONSTER_ID);
  await expect(bars).toHaveText('x5', ON_FRAMES);
  await expect(hp).toHaveText(`${BAR} / ${BAR}`);
  await phoneChecks(page);
  await shot('x5');

  // a hit under the bar: 50 off, still five bars
  push([hit(MONSTER_ID, 50)]);
  await expect.poll(state, ON_FRAMES).toEqual(['70 / 120', 'x5']);

  // the exact bar: 70 of 70, then a full fourth bar (no death)
  push([hit(MONSTER_ID, 70), writeSetPointParam(MONSTER_ID, DstParam.HP, BAR), writeHpLayer(MONSTER_ID, 4, 5, BAR, BAR)]);
  await expect.poll(state, ON_FRAMES).toEqual(['120 / 120', 'x4']);

  // a multi-bar overflow: 300 at 120 empties this bar and one more, and takes 60 of the next: x2, 60 / 120
  push([hit(MONSTER_ID, 300), writeSetPointParam(MONSTER_ID, DstParam.HP, 60), writeHpLayer(MONSTER_ID, 2, 5, BAR, 60)]);
  await expect.poll(state, ON_FRAMES).toEqual(['60 / 120', 'x2']);
  await shot('x2');

  // the leash reset: every bar back (CAIMonster::DoReturnToBegin: ResetHpLayers, SetPointParam( max ), FlushHpLayer)
  push([writeSetPointParam(MONSTER_ID, DstParam.HP, BAR), writeHpLayer(MONSTER_ID, 5, 5, BAR, BAR)]);
  await expect.poll(state, ON_FRAMES).toEqual(['120 / 120', 'x5']);

  // the last bar, then the kill: the death is the ordinary one (MOVERDEATH), and the own kill clears the target
  push([writeHpLayer(MONSTER_ID, 1, 5, BAR, 40)]);
  await expect.poll(state, ON_FRAMES).toEqual(['40 / 120', 'x1']);
  await shot('x1');
  push([hit(MONSTER_ID, 40), writeMoverDeath(MONSTER_ID, SELF_ID, OBJMSG_DAMAGE), writeSetPointParam(MONSTER_ID, DstParam.HP, 0)]);
  await expect(target).toBeHidden(ON_FRAMES);

  // a late joiner's view: a boss comes into view mid-fight, its ADD_OBJ with the bars it has now
  push([writeAddMonster(LATE_ID, late), writeHpLayer(LATE_ID, 2, 3, BAR, 75)]);
  await expect.poll(() => page.evaluate((id) => window.__client!.screenOf(id) !== null, LATE_ID), ON_FRAMES).toBe(true);
  await tapMover(page, LATE_ID);
  await expect.poll(state, ON_FRAMES).toEqual(['75 / 120', 'x2']);
  await phoneChecks(page);
  await shot('late');
});

/** The phone's rules, as drawn (the bar is scaled): "xN" 14 px or more, and on the screen. */
async function phoneChecks(page: Page): Promise<void> {
  if (!isPhone()) return;
  const bars = page.locator('.hud-target-bars');
  const drawn = await bars.evaluate((e) => {
    const box = e.getBoundingClientRect();
    return { px: parseFloat(getComputedStyle(e).fontSize) * (box.height / (e as HTMLElement).offsetHeight), box: box.toJSON() as DOMRect };
  });
  expect(drawn.px).toBeGreaterThanOrEqual(14);
  const view = page.viewportSize()!;
  expect(drawn.box.x >= 0 && drawn.box.y >= 0 && drawn.box.right <= view.width && drawn.box.bottom <= view.height).toBe(true);
}

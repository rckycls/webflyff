// The first jobs against the pretend world server (Piece 7 M2): the job change, the wand's charge and shot, the bow's
// arrows and their refusal, and another player's wand shot. Webby is on Flaris' square with the Aibatt about 6.5 m away,
// within a wand's and a bow's 15 m: no walk. The shots' packets are read off the cache connection as the world server
// reads them (`[R §5]`): MAGIC_ATTACK or RANGE_ATTACK when the shot starts, SFX_ID at its hit frame, SFX_HIT as the
// missile lands. The servers, Flaris and the helpers are worldHarness.ts's.

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { NULL_ID, PacketType } from '@flyffweb/protocol';
import type { AddedMover, InventoryItem, OwnCharacter, SkillSlot } from '@flyffweb/protocol';
import {
  createWorldScript, newVagrantOwn, writeAddMonster, writeAddPlayer, writeAddSelf, writeDoEquip, writeMagicAttack,
  writeSetDestParam, writeSetJobSkill, writeSetSkillState, writeUseSkill,
} from '@flyffweb/testkit';
import type { WorldScript } from '@flyffweb/testkit';
import type { ClientMover } from '../src/testHooks';
import { ObjSta } from '../src/world/sim/constants';
import {
  BASE, MADRIGAL, MALE_VAGRANT, MI_MALE, MONSTER_ID, ON_FRAMES, SELF_ID, SELF_PLAYER, SQUARE, aibatt, enterFlaris,
  hudTexts, playGateway, recordHudTexts, self, sentOf, tapMover, targetsOf,
} from './worldHarness';
import type { Gateway, Sent } from './worldHarness';

test.describe.configure({ timeout: 180_000 });

/** `II_WEA_WAN_SEAL`, `II_WEA_BOW_WOODNE` and `II_WEA_SEC_ACR_ARROW` (`Resource/defineItem.h:130`, :222, :877). */
const SEAL_WAND = 231;
const WOODNESS_BOW = 431;
const ARROW = 2028;
/** `PARTS_RWEAPON` and `PARTS_BULLET` (`Resource/defineNeuz.h`). */
const RWEAPON = 10;
const BULLET = 25;
/** The hand item's place in the inventory (the Wooden Sword's in a new Vagrant's), and the arrows'. */
const WEAPON_OBJECT = 44;
const ARROW_OBJECT = 3; // a bag slot: 42 and up are the equipment's (m_apIndex)
/** `JOB_MAGICIAN` and `SI_MAG_MAG_MENTALSTRIKE` (`Resource/defineJob.h`, `defineSkill.h:64`). */
const JOB_MAGICIAN = 4;
const MENTAL_STRIKE = 121;
/** `OBJMSG_ATK_MAGIC1` (`_AIInterface/ActionMover.h`). */
const OBJMSG_ATK_MAGIC1 = 36;
/** `AF_GENERIC | AF_RANGE`: the bow's SFX_ID type (`MoverActEvent.cpp:739-741`). */
const AF_BOW = 0x4001;
const OTHER_ID = 9050;
/** `SI_ASS_CHEER_HEAPUP` and `SI_MAG_FIRE_BOOMERANG` (`Resource/defineSkill.h:44`, :56); `BUFF_SKILL`; `DST_STA`. */
const HEAP_UP = 49;
const BOOMERANG = 64;
const BUFF_SKILL = 1;
const DST_STA = 4;

/** Webby at level 15 holding `weapon`, with arrows in the bag unless none (they are not worn). */
function armed(weapon: number, arrows = 0): OwnCharacter {
  const own = newVagrantOwn();
  const inventory: InventoryItem[] = (own.inventory ?? []).map((item) => (item.objectId === WEAPON_OBJECT ? { ...item, itemId: weapon } : item));
  if (arrows > 0) inventory.push({ objectId: ARROW_OBJECT, itemId: ARROW, count: arrows });
  // the inventory is listed in rising object ID (writeAddSelf)
  return { ...own, inventory: inventory.sort((a, b) => a.objectId - b.objectId) };
}

/** Webby on the square with the Aibatt (and `others`): its own `own`, the weapon worn in the right hand. */
function jobsScript(own: OwnCharacter, others: AddedMover[] = []): WorldScript {
  const equipmentObjectIds = SELF_PLAYER.equipmentObjectIds.map((id, part) =>
    (part === RWEAPON ? WEAPON_OBJECT : part === 2 ? 0 : part === 4 ? 42 : part === 5 ? 43 : id));
  const webby: AddedMover = {
    ...self, hitPoint: 230, player: { ...SELF_PLAYER, level: 15, sta: own.sta, dex: own.dex, own, equipmentObjectIds },
  };
  return createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE, self: writeAddSelf(SELF_ID, webby),
    others: [writeAddMonster(MONSTER_ID, aibatt), ...others.map((m) => writeAddPlayer(m.objectId, m))],
  });
}

const listed = (weapon: number) => ({ level: 15, equipment: [...MALE_VAGRANT, weapon] });
const isTouch = (): boolean => test.info().project.use.hasTouch === true;
const errorsOf = async (page: Page): Promise<string[]> => (await page.evaluate(() => window.__client!.stats())).errors;
const moverOf = async (page: Page, objectId: number): Promise<ClientMover | undefined> =>
  (await page.evaluate(() => window.__client!.movers())).find((m) => m.objectId === objectId);
/** An i32 of a packet's body after the DPID and the type. */
const field = (sent: Sent, i: number): number => sent.body.readInt32LE(8 + 4 * i);
const shotsOf = (gateway: Gateway) => ({
  magic: sentOf(gateway, PacketType.MAGIC_ATTACK), range: sentOf(gateway, PacketType.RANGE_ATTACK),
  sfxId: sentOf(gateway, PacketType.SFX_ID), sfxHit: sentOf(gateway, PacketType.SFX_HIT),
});

/**
 * A press on the Aibatt and its let-go, made on the page itself: on the canvas where the Aibatt is drawn (the mouse, or on
 * the phone a finger), or on the phone's Attack button (`'button'`). The press went down `before` ms ago; the page waits
 * `wait` ms; then the let-go comes, `held` ms after the press. The client goes by the events' own times, so the press
 * lasts `held` ms however late a busy page runs this, where a hold timed from the test lasts longer under load. The
 * pointer is the mouse's id, which every page has, so that the canvas can keep it.
 */
async function pressAibatt(page: Page, on: 'canvas' | 'button', { before = 0, wait = 0, held }: { before?: number; wait?: number; held: number }): Promise<void> {
  const touch = isTouch();
  const at = on === 'button' ? [0.5, 0.5] : (await page.evaluate((id) => window.__client!.screenOf(id), MONSTER_ID))!;
  await page.evaluate(async ({ touch, selector, at, before, wait, held }) => {
    const target = document.querySelector(selector)!;
    const box = target.getBoundingClientRect();
    const init = {
      pointerType: touch ? 'touch' : 'mouse', pointerId: 1, isPrimary: true, button: 0, bubbles: true, cancelable: true,
      clientX: box.left + box.width * at[0]!, clientY: box.top + box.height * at[1]!,
    };
    const stamped = (event: Event, timeStamp: number): Event => Object.defineProperty(event, 'timeStamp', { value: timeStamp });
    const down = performance.now() - before;
    target.dispatchEvent(stamped(new PointerEvent('pointerdown', { ...init, buttons: 1 }), down));
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    target.dispatchEvent(stamped(new PointerEvent('pointerup', init), down + held));
  }, { touch, selector: on === 'button' ? '.hud-attack' : '.world-view canvas', at, before, wait, held });
}

/**
 * Holds a press on the Aibatt `ms` ms, the rules running meanwhile, then lets go: the mouse on the desktop; on the phone
 * the Attack button, held with a finger (plan Decisions 4).
 */
async function holdOnAibatt(page: Page, ms: number): Promise<void> {
  if (isTouch()) await expect(page.locator('.hud-attack')).toBeEnabled(ON_FRAMES);
  await pressAibatt(page, isTouch() ? 'button' : 'canvas', { wait: ms, held: ms });
}

test.describe('the first jobs against the pretend world server (Piece 7 M2)', () => {
  test('the job change updates the Character and Skill windows', async ({ page }) => {
    const script = jobsScript(armed(SEAL_WAND));
    const gateway = await playGateway(page, script, { listed: listed(SEAL_WAND) });
    await enterFlaris(page);
    await recordHudTexts(page);
    const skills: SkillSlot[] = newVagrantOwn().skills.map((slot, i) => (i === 3 ? { skill: MENTAL_STRIKE, level: 0 } : slot));
    gateway.pushCache(script.later([writeSetJobSkill(SELF_ID, JOB_MAGICIAN, skills)]));
    await expect.poll(async () => (await hudTexts(page))?.lines, ON_FRAMES).toContain('Welcome to the wonderful world of Magicians!');

    await page.getByRole('button', { name: 'Start' }).click();
    await page.getByRole('menuitem', { name: 'Character' }).click();
    await expect(page.locator('.hud-character [data-value="job"]')).toHaveText('Magician');
    await page.getByRole('button', { name: 'Start' }).click();
    await page.getByRole('menuitem', { name: 'Skills' }).click();
    const tree = page.locator('.hud-skills');
    await expect(tree).toBeVisible();
    await expect(tree.locator(`.hud-skill[data-skill="${MENTAL_STRIKE}"]`)).toBeVisible();
    if (!isTouch()) await expect(tree.locator('.hud-skills-job-panel')).toHaveAttribute('src', /back_ma/);
    expect(await errorsOf(page)).toEqual([]);
  });

  test('a wand: hold, the gauge, release, MAGIC_ATTACK, SFX_ID, SFX_HIT', async ({ page }) => {
    const gateway = await playGateway(page, jobsScript(armed(SEAL_WAND)), { listed: listed(SEAL_WAND) });
    await enterFlaris(page);
    await tapMover(page, MONSTER_ID);
    await page.waitForTimeout(700); // m_timerFocusAttack runs out (WndWorld.cpp:571)
    await expect(page.locator('.charge-gauge')).toBeVisible(ON_FRAMES);
    await holdOnAibatt(page, 900);
    // a charge of 0.9 s is level 2 (GetGaugePower: 675 to 1124 ms)
    await expect.poll(() => shotsOf(gateway).magic.length, ON_FRAMES).toBe(1);
    const [shot] = shotsOf(gateway).magic;
    expect([field(shot!, 0), field(shot!, 1), field(shot!, 4), field(shot!, 5)]).toEqual([OBJMSG_ATK_MAGIC1, MONSTER_ID, 2, 0]);
    // the hit frame's SFX_ID (AF_MAGIC), then the missile's SFX_HIT with the same id and the charge
    await expect.poll(() => shotsOf(gateway).sfxId.length, ON_FRAMES).toBe(1);
    const [id] = shotsOf(gateway).sfxId;
    expect([field(id!, 0), field(id!, 1), field(id!, 2), field(id!, 3) >>> 0]).toEqual([MONSTER_ID, 1, 0x8, NULL_ID]);
    await expect.poll(() => shotsOf(gateway).sfxHit.length, ON_FRAMES).toBe(1);
    const [hit] = shotsOf(gateway).sfxHit;
    expect([field(hit!, 0), field(hit!, 1), field(hit!, 3)]).toEqual([1, 2, SELF_ID]);

    // then a quick tap on it as a new target, let go 100 ms after its press and handled 700 ms later by a busy page: its
    // let-go is judged at its own time, within the new target's 500 ms of m_timerFocusAttack (OnLButtonUp,
    // WndWorld.cpp:6484-6503), so it shoots nothing, however late the next rules step comes. Escape lets the focus go
    // before (the tap selects anew) and after; once the second Escape's SETTARGET is in, so is all the page sent before.
    const cleared = () => targetsOf(gateway).filter(([id]) => id === NULL_ID).length;
    await page.keyboard.press('Escape');
    await expect.poll(cleared, ON_FRAMES).toBe(1);
    await expect(page.locator('.charge-gauge')).toBeHidden(ON_FRAMES);
    await pressAibatt(page, 'canvas', { before: 800, held: 100 });
    await expect.poll(() => targetsOf(gateway).at(-1), ON_FRAMES).toEqual([MONSTER_ID, 2]);
    // the gauge back is a frame drawn after the tap; ten more make sure the rules stepped on
    await expect(page.locator('.charge-gauge')).toBeVisible(ON_FRAMES);
    await page.evaluate(() => new Promise<void>((resolve) => {
      let frames = 0;
      const frame = (): void => { if (++frames >= 10) resolve(); else requestAnimationFrame(frame); };
      requestAnimationFrame(frame);
    }));
    await page.keyboard.press('Escape');
    await expect.poll(cleared, ON_FRAMES).toBe(2);
    expect(shotsOf(gateway).magic).toHaveLength(1);
    expect(await errorsOf(page)).toEqual([]);
  });

  test('a bow without arrows refuses; with arrows it shoots', async ({ page }) => {
    const script = jobsScript(armed(WOODNESS_BOW, 100));
    const gateway = await playGateway(page, script, { listed: listed(WOODNESS_BOW) });
    await enterFlaris(page);
    await recordHudTexts(page);
    await tapMover(page, MONSTER_ID);
    await page.waitForTimeout(700);
    await tapMover(page, MONSTER_ID);
    await expect.poll(async () => (await hudTexts(page))?.lines, ON_FRAMES).toContain('Equip arrows first.');
    expect(shotsOf(gateway).range).toEqual([]);

    // the server puts the arrows on (DOEQUIP to PARTS_BULLET): the next press shoots, a level-0 shot of the auto-attack
    gateway.pushCache(script.later([writeDoEquip(SELF_ID, ARROW_OBJECT, ARROW, true, BULLET)]));
    await page.waitForTimeout(300);
    await tapMover(page, MONSTER_ID);
    await expect.poll(() => shotsOf(gateway).range.length, ON_FRAMES).toBeGreaterThan(0);
    const [shot] = shotsOf(gateway).range;
    expect([field(shot!, 1), field(shot!, 2)]).toEqual([MONSTER_ID, 0]);
    await expect.poll(() => shotsOf(gateway).sfxId.length, ON_FRAMES).toBeGreaterThan(0);
    expect(field(shotsOf(gateway).sfxId[0]!, 2)).toBe(AF_BOW);
    expect(await errorsOf(page)).toEqual([]);
  });

  test("another player's magic attack is seen", async ({ page }) => {
    const mage: AddedMover = {
      ...BASE, index: MI_MALE, pos: [SQUARE[0] + 2, SQUARE[1], SQUARE[2]], angle: 0, objectId: OTHER_ID, isPlayer: true,
      player: {
        ...SELF_PLAYER, self: false, name: 'Mage', playerId: 501, sta: 15, dex: 15, worn: [{ part: RWEAPON, itemId: SEAL_WAND, flag: 0 }],
        equipmentObjectIds: [],
      },
    };
    const script = jobsScript(armed(SEAL_WAND), [mage]);
    const gateway = await playGateway(page, script, { listed: listed(SEAL_WAND) });
    await enterFlaris(page);
    gateway.pushCache(script.later([writeMagicAttack(OTHER_ID, OBJMSG_ATK_MAGIC1, MONSTER_ID, 2, 0)]));
    await expect.poll(async () => ((await moverOf(page, OTHER_ID))?.state ?? 0) & ObjSta.ATK_ALL, ON_FRAMES).toBe(ObjSta.ATK_MAGIC1);
    // its missile flies and lands with no packet of the own client's
    await page.waitForTimeout(3000);
    expect(shotsOf(gateway)).toEqual({ magic: [], range: [], sfxId: [], sfxHit: [] });
    expect(await errorsOf(page)).toEqual([]);
  });
});

test.describe('the first jobs\' skills against the pretend world server (Piece 7 M2, Part B)', () => {
  test("the server's buff shows, and its STA counts", async ({ page }) => {
    const script = jobsScript(armed(SEAL_WAND));
    const gateway = await playGateway(page, script, { listed: listed(SEAL_WAND) });
    await enterFlaris(page);
    await page.getByRole('button', { name: 'Start' }).click();
    await page.getByRole('menuitem', { name: 'Character' }).click();
    const sta = page.locator('.hud-character [data-value="sta"]');
    await expect(sta).not.toHaveText('');
    const before = Number(await sta.textContent());
    // Heap Up on Webby for 60 s, then the server's ApplyParam: STA + 2 (SETSKILLSTATE applies nothing of itself)
    gateway.pushCache(script.later([
      writeSetSkillState(SELF_ID, SELF_ID, BUFF_SKILL, HEAP_UP, 1, 60000), writeSetDestParam(SELF_ID, DST_STA, 2, -1),
    ]));
    const icon = page.locator('.hud-buffs .hud-buff');
    await expect(icon).toHaveCount(1, ON_FRAMES);
    await expect(icon).toHaveAttribute('title', /Heap Up/);
    await expect(sta).toHaveText(String(before + 2), ON_FRAMES);
    expect(await errorsOf(page)).toEqual([]);
  });

  test("another player's Boomerang casts, and nothing is sent", async ({ page }) => {
    const mage: AddedMover = {
      ...BASE, index: MI_MALE, pos: [SQUARE[0] + 2, SQUARE[1], SQUARE[2]], angle: 0, objectId: OTHER_ID, isPlayer: true,
      player: { ...SELF_PLAYER, self: false, name: 'Mage', playerId: 501, sta: 15, dex: 15, worn: [], equipmentObjectIds: [] },
    };
    const script = jobsScript(armed(SEAL_WAND), [mage]);
    const gateway = await playGateway(page, script, { listed: listed(SEAL_WAND) });
    await enterFlaris(page);
    // USESKILL KT_MAGIC with a cast of 9 (600 ms): MAGICCASTING on every client
    gateway.pushCache(script.later([writeUseSkill(OTHER_ID, BOOMERANG, 1, MONSTER_ID, 0, 9)]));
    const casting: number[] = [ObjSta.ATK_CASTING1, ObjSta.ATK_CASTING2, ObjSta.ATK_MAGICSKILL];
    await expect.poll(async () => casting.includes(((await moverOf(page, OTHER_ID))?.state ?? 0) & ObjSta.ATK_ALL), ON_FRAMES).toBe(true);
    await page.waitForTimeout(3000);
    expect(shotsOf(gateway)).toEqual({ magic: [], range: [], sfxId: [], sfxHit: [] });
    expect(await errorsOf(page)).toEqual([]);
  });
});

// Fighting against the pretend world server (Piece 4 spec §5): the new character, a Vagrant of level 1 with the Wooden
// Sword in its hand, enters Flaris' square with a Small Aibatt 5 m away. The world server is the testkit's script
// (`createWorldScript`), which answers the browser's packets as the world server would (`on`): a swing (MELEE_ATTACK)
// with its DAMAGE, the lodestar's revival with the points and the position, the stat points with SETSTATE. The tests
// read what was played through the test hooks (`played`: the damage numbers are a layer over the canvas, and under
// SwiftShader a number lives two or three frames) and what the windows show; the pictures are the desktop's, as
// world.spec.ts's. The servers, Flaris and the helpers are worldHarness.ts's.

import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { AttackFlag, DstParam, NULL_ID, PacketType } from '@flyffweb/protocol';
import type { AddedMover, OwnCharacter, Vec3 } from '@flyffweb/protocol';
import {
  createWorldScript, newVagrantOwn, writeAddMonster, writeAddSelf, writeDamage, writeMeleeAttack, writeMoverDeath,
  writeRevivalToLodestar, writeSetExperience, writeSetGrowthLearningPoint, writeSetPointParam, writeSetPos, writeSetState,
} from '@flyffweb/testkit';
import type { ScriptMessage, WorldScript } from '@flyffweb/testkit';
import type { ClientMover, ClientPlayed } from '../src/testHooks';
import { Xi } from '../src/world/fx/EffectManager';
import { Mti, ObjSta } from '../src/world/sim/constants';
import {
  MADRIGAL, MALE_VAGRANT, MONSTER_ID, OBJMSG_ATK1, OBJMSG_DAMAGE, ON_FRAMES, SELF_ID, SELF_PLAYER, SQUARE, aibatt,
  enterFlaris, groundAt, hpOf, hudTexts, movedState, ownAt, playGateway, recordHudTexts, self, sentOf, tapMover, targetsOf,
} from './worldHarness';
import type { Gateway, Listed, Sent } from './worldHarness';

// Entering, loading Flaris and drawing it with SwiftShader take much longer than a lobby screen. The waits on the frame
// loop (the swings, what a frame plays, the windows it draws, a screenshot) are `ON_FRAMES` (ruling R28).
test.describe.configure({ timeout: 120_000 });

/** `MI_AIBATT1` (`Resource/defineObj.h:959`): the Small Aibatt, level 1, `dwAddHp` 120, `nExpValue` 2 (propMover.txt). */
const MI_AIBATT1 = 20;
const AIBATT_HP = 120;
/** `II_WEA_SWO_WOODEN` (`Resource/defineItem.h:32`): the new Vagrant's Wooden Sword, `fAttackSpeed` 0.085 (propItem.txt). */
const WOODEN_SWORD = 21;
/** `AF_GENERIC | AF_CRITICAL1 | AF_CRITICAL2` (`_AIInterface/ActionMover.h:27-44`): the plan's critical, 0xC1. */
const CRITICAL = AttackFlag.GENERIC | AttackFlag.CRITICAL1 | AttackFlag.CRITICAL2;
/**
 * `MAKELONG( 0, (WORD)nError )` with `AF_GENERIC`: the `nParam3` of a monster's MELEE_ATTACK
 * (`CUserMng::AddMeleeAttack`, `_AIInterface/AIMonster.cpp:1298`).
 */
const MONSTER_PARAM3 = 0x00010000;

/** The Small Aibatt 5 m from Webby, 4 m south and 3 m west (on the screen, to the right of the player and ahead). */
const AIBATT_AT: Vec3 = [6965, groundAt(6965, 3324), 3324];
const smallAibatt: AddedMover = { ...aibatt, index: MI_AIBATT1, pos: AIBATT_AT, hitPoint: AIBATT_HP };

/**
 * Flaris' lodestar: the revival region of its square (`WdMadrigal.rgn`, the `region3` of `RI_REVIVAL` (13) keyed
 * "flaris" there), where `OnRevivalLodestar` sends a player killed in Flaris (`GetNearRevivalPos`,
 * `WORLDSERVER/DPSrvr.cpp:11408-11416`), 0.9 m from where Webby enters.
 */
const LODESTAR: Vec3 = [6968.384766, 100, 3328.863037];

/** The new character in the character list: level 1, the vagrant's clothes and the Wooden Sword. */
const NEW_CHARACTER: Listed = { level: 1, equipment: [...MALE_VAGRANT, WOODEN_SWORD] };

/** Webby's own ADD_OBJ: a new Vagrant's numbers (`newVagrantOwn`) at `level`, with `BASE_VALUE_TBL`'s 230 HP. */
function newCharacter(level: number, own: OwnCharacter): AddedMover {
  return { ...self, hitPoint: 230, player: { ...SELF_PLAYER, level, sta: own.sta, dex: own.dex, own } };
}

/** Webby on the square with the Small Aibatt; a script of its own for each test, which answers what the test says. */
function fight(level = 1, own: OwnCharacter = newVagrantOwn()): WorldScript {
  return createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE, self: writeAddSelf(SELF_ID, newCharacter(level, own)),
    others: [writeAddMonster(MONSTER_ID, smallAibatt)],
  });
}

/** The Aibatt's swing at Webby (`AddMeleeAttack`) and its DAMAGE of `hit` (`AddDamage`). */
const aibattHits = (hit: number): ScriptMessage[] => [
  writeMeleeAttack(MONSTER_ID, OBJMSG_ATK1, SELF_ID, 0, MONSTER_PARAM3),
  writeDamage(SELF_ID, MONSTER_ID, hit, AttackFlag.GENERIC),
];

const played = (page: Page): Promise<ClientPlayed> => page.evaluate(() => window.__client!.played());
const moverOf = async (page: Page, objectId: number): Promise<ClientMover | undefined> =>
  (await page.evaluate(() => window.__client!.movers())).find((m) => m.objectId === objectId);
/** The effects of `xi` played. */
const effectsOf = (p: ClientPlayed, xi: number): ClientPlayed['effects'] => p.effects.filter((e) => e.xi === xi);
const countOf = (p: ClientPlayed, xi: number): number => effectsOf(p, xi).length;
const swingsOf = (gateway: Gateway): Sent[] => sentOf(gateway, PacketType.MELEE_ATTACK);
/** The test hooks' paused rules (`pause`) run `steps` steps, at once (`step`). */
const stepRules = (page: Page, steps: number): Promise<void> => page.evaluate((n) => window.__client!.step(n), steps);

/** A row of the status window: `hp`, `mp`, `fp`, `exp`. */
const statusRow = (page: Page, row: string): Locator => page.locator(`.hud-status [data-text="${row}"]`);

/** Opens the Character window from the Start menu, as both a mouse and a finger can. */
async function openCharacterWindow(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Start' }).click();
  await page.getByRole('menuitem', { name: 'Character' }).click();
  const character = page.locator('.hud-character');
  await expect(character).toBeVisible();
  return character;
}

test.describe('fighting against the pretend world server', () => {
  test('auto-attack resumes after jumping and sends swings while rendering is stopped in another tab', async ({ page, isMobile }) => {
    await page.addInitScript(() => {
      const raf = window.requestAnimationFrame.bind(window);
      const state = { stopped: false, frames: 0 };
      Object.assign(window, { combatRenderProbe: state });
      window.requestAnimationFrame = (callback) => raf((time) => {
        if (state.stopped) return;
        state.frames++; callback(time);
      });
    });
    const script = fight();
    const gateway = await playGateway(page, script, { listed: NEW_CHARACTER });
    await enterFlaris(page);
    await tapMover(page, MONSTER_ID);
    await tapMover(page, MONSTER_ID);
    await expect.poll(() => swingsOf(gateway).length, ON_FRAMES).toBeGreaterThan(0);
    const beforeJump = swingsOf(gateway).length;
    if (isMobile) await page.getByRole('button', { name: 'Jump', exact: true }).tap();
    else await page.keyboard.press('Space');
    await expect.poll(() => sentOf(gateway, PacketType.PLAYERBEHAVIOR).some((packet) =>
      (movedState(packet) & ObjSta.JUMP_ALL) !== 0), ON_FRAMES).toBe(true);
    await expect.poll(async () => ((await moverOf(page, SELF_ID))!.state & ObjSta.JUMP_ALL), ON_FRAMES).toBe(0);
    await expect.poll(() => swingsOf(gateway).length, ON_FRAMES).toBeGreaterThan(beforeJump);
    await page.evaluate(() => {
      (window as unknown as { combatRenderProbe: { stopped: boolean } }).combatRenderProbe.stopped = true;
      window.dispatchEvent(new Event('blur'));
    });
    const frozenFrames = await page.evaluate(() =>
      (window as unknown as { combatRenderProbe: { frames: number } }).combatRenderProbe.frames);
    const beforeBackground = swingsOf(gateway).length;
    const otherTab = await page.context().newPage();
    await otherTab.goto('about:blank');
    await otherTab.bringToFront();
    // The gateway is outside the page: this observes packets before returning to the game.
    await expect.poll(() => swingsOf(gateway).length, ON_FRAMES).toBeGreaterThan(beforeBackground + 1);
    expect(await page.evaluate(() =>
      (window as unknown as { combatRenderProbe: { frames: number } }).combatRenderProbe.frames)).toBe(frozenFrames);
    expect((await page.evaluate(() => window.__client!.stats())).errors).toEqual([]);
    await otherTab.close();
  });

  // Spec §3.4, §3.5, §3.6: a tap selects the Aibatt and the next one attacks it; the world server answers each swing,
  // the Aibatt hits back, and the kill takes Webby to level 2
  test('tapping the Aibatt twice fights it: hits, a critical, a miss and a blow back, then the kill that levels Webby up', async ({ page }) => {
    const script = fight();
    // the world server's answer to each swing, in turn: DAMAGE(10), a critical, a miss with the Aibatt's blow back after
    // it; the kill waits for the checks, and the swings in between have no answer
    const answers: ScriptMessage[][] = [
      [writeDamage(MONSTER_ID, SELF_ID, 10, AttackFlag.GENERIC)],
      [writeDamage(MONSTER_ID, SELF_ID, 25, CRITICAL)],
      [writeDamage(MONSTER_ID, SELF_ID, 0, AttackFlag.MISS), ...aibattHits(12)],
    ];
    script.on('meleeAttack', () => answers.shift() ?? []);
    const gateway = await playGateway(page, script, { listed: NEW_CHARACTER });
    await enterFlaris(page);
    const glyphs = page.locator('.world-damage-numbers > div');
    await expect(statusRow(page, 'hp')).toHaveText('230 / 230');

    // the target bar is drawn by the frame loop (drawHud), not as the press goes down
    await tapMover(page, MONSTER_ID);
    await expect.poll(() => targetsOf(gateway)).toEqual([[MONSTER_ID, 2]]);
    await expect(page.locator('.hud-target-name')).toHaveText('Small Aibatt <Lvl 1>', ON_FRAMES);
    await expect(page.locator('.hud-target-info')).toHaveText('120 / 120', ON_FRAMES);
    await tapMover(page, MONSTER_ID);

    // the first swing, with the Wooden Sword's fAttackSpeed; its DAMAGE's number is drawn in the numbers layer (the
    // glyphs' elements stay once it has gone)
    await expect.poll(() => swingsOf(gateway).length, ON_FRAMES).toBeGreaterThan(0);
    expect(swingsOf(gateway)[0]!.body.readFloatLE(24)).toBe(Math.fround(0.085));
    await expect.poll(() => glyphs.count(), ON_FRAMES).toBeGreaterThanOrEqual(2);

    // the critical (25, its banner) and the miss (its banner, no number), then the Aibatt's swing and its 12 on Webby
    await expect.poll(async () => (await played(page)).swings, ON_FRAMES)
      .toMatchObject([{ attackerId: MONSTER_ID, motion: Mti.ATK1 }]);
    await expect.poll(async () => (await played(page)).numbers, ON_FRAMES).toMatchObject([
      { value: 10, ownHurt: false }, { value: 25, ownHurt: false }, { value: 12, ownHurt: true },
    ]);
    const hits = await played(page);
    expect([countOf(hits, Xi.HIT_CRITICAL01), countOf(hits, Xi.HIT_MISS01)]).toEqual([1, 1]);
    expect(hits.effects.findIndex((e) => e.xi === Xi.HIT_CRITICAL01))
      .toBeLessThan(hits.effects.findIndex((e) => e.xi === Xi.HIT_MISS01));
    // the hit frames of Webby's swings: the Wooden Sword's spark (dwSfxObj3) on the Aibatt
    await expect.poll(async () => countOf(await played(page), Xi.HIT_SWORD01), ON_FRAMES).toBeGreaterThan(0);
    // the target bar's HP down by 10 and 25 (the miss took nothing), and Webby's by the Aibatt's 12
    expect(await hpOf(page, MONSTER_ID)).toBe(85);
    await expect(page.locator('.hud-target-info')).toHaveText('85 / 120', ON_FRAMES);
    await expect(statusRow(page, 'hp')).toHaveText('218 / 230', ON_FRAMES);

    // the next swing kills (CAttackArbiter::OnDied): SET_GROWTH_LEARNING_POINT and SETEXPERIENCE of the level up
    // (LevelUpSetting, then AddSetExperience, Mover.cpp:6245-6254), 2 EXP into level 2, then MOVERDEATH (DoDie)
    await recordHudTexts(page);
    answers.push([
      writeSetGrowthLearningPoint(SELF_ID, 2), writeSetExperience(SELF_ID, 2n, 2, 0, 0),
      writeMoverDeath(MONSTER_ID, SELF_ID, OBJMSG_DAMAGE),
    ]);
    // the level up: its effect on Webby, once (no new skill points), its lines and its caption as they were added (they
    // fade by the clock)
    await expect.poll(async () => countOf(await played(page), Xi.GEN_LEVEL_UP01), ON_FRAMES).toBe(1);
    await expect.poll(() => hudTexts(page), ON_FRAMES).toEqual({
      lines: ['Level up! You can increase your stats in your character window.', 'You are learning new attack patterns!'],
      captions: ['Congratulations! Level up!'],
    });
    // the death motion, held on its last frame while the body stays in view
    await expect.poll(async () => (await moverOf(page, MONSTER_ID))?.motion, ON_FRAMES).toBe(Mti.DIE1);
    const swings = swingsOf(gateway).length;
    const body = (await moverOf(page, MONSTER_ID))!;
    expect([body.hp, body.state & ObjSta.DIE_ALL]).toEqual([0, ObjSta.DEAD]);
    // the own kill clears the focus, the Aibatt released first (OnMoverDeath, DPClient.cpp:1956-1963), and the bar goes
    await expect.poll(() => targetsOf(gateway)).toEqual([[MONSTER_ID, 2], [MONSTER_ID, 1], [NULL_ID, 2]]);
    await expect(page.locator('.hud-target')).toBeHidden(ON_FRAMES);
    // the bars at the new maxima
    await expect(page.locator('.hud-status .hud-window-title')).toHaveText('Webby - Lv: 2', ON_FRAMES);
    await expect(statusRow(page, 'hp')).toHaveText('230 / 230', ON_FRAMES);
    await expect(statusRow(page, 'mp')).toHaveText('63 / 63');
    await expect(statusRow(page, 'fp')).toHaveText('32 / 32');
    await expect(statusRow(page, 'exp')).toHaveText('10.00%');
    // the last number is the HP the Aibatt had (OnMoverDeath, DPClient.cpp:2003-2007)
    expect((await played(page)).numbers.at(-1)).toMatchObject({ value: 85, ownHurt: false });

    // the attack is over: 120 rules steps (2 s of the game) after the kill, held and stepped by the test hooks, bring no
    // swing, and the level up has played once
    await page.evaluate(() => window.__client!.pause());
    await stepRules(page, 120);
    expect(swingsOf(gateway)).toHaveLength(swings);
    expect(countOf(await played(page), Xi.GEN_LEVEL_UP01)).toBe(1);
    expect(await page.evaluate(() => window.__client!.own())).toEqual({ hp: 230, level: 2, actionPoint: null });
    expect((await page.evaluate(() => window.__client!.stats())).errors).toEqual([]);
  });

  // The live server's DAMAGE comes at its own copy's hit, mostly after the client's swing has played its hit frame. The
  // script holds each swing's DAMAGE until the next swing's MELEE_ATTACK (`on`'s `until`), so it comes after the hit
  // frame whatever the frames take: the spark first, then the number and the HP drop
  test("a swing's DAMAGE that comes after its hit frame: the spark first, then the number and the HP drop", async ({ page }) => {
    const script = fight();
    const answers: ScriptMessage[][] = [[writeDamage(MONSTER_ID, SELF_ID, 10, AttackFlag.GENERIC)]];
    script.on('meleeAttack', () => answers.shift() ?? [], { until: 'meleeAttack' });
    const gateway = await playGateway(page, script, { listed: NEW_CHARACTER });
    await enterFlaris(page);
    await tapMover(page, MONSTER_ID);
    await expect.poll(() => targetsOf(gateway)).toEqual([[MONSTER_ID, 2]]);
    await tapMover(page, MONSTER_ID);

    // the second swing brings the first's DAMAGE: its number, after the first swing's spark
    await expect.poll(async () => (await played(page)).numbers, ON_FRAMES).toMatchObject([{ value: 10, ownHurt: false }]);
    const p = await played(page);
    const [spark] = effectsOf(p, Xi.HIT_SWORD01);
    expect(spark).toBeDefined();
    expect(p.numbers[0]!.step).toBeGreaterThan(spark!.step);
    expect(swingsOf(gateway).length).toBeGreaterThanOrEqual(2);
    // and the HP drop, the one DAMAGE there was
    expect(await hpOf(page, MONSTER_ID)).toBe(110);
    await expect(page.locator('.hud-target-info')).toHaveText('110 / 120', ON_FRAMES);
    expect((await page.evaluate(() => window.__client!.stats())).errors).toEqual([]);
  });

  // Spec §3.5: the Aibatt attacks Webby where it stands, then kills it; Lodestar brings it back where the server says
  test("the Aibatt's swing and an own-hurt number, then the own death and the lodestar's revival", async ({ page, isMobile }) => {
    const script = fight();
    // OnRevivalLodestar (WORLDSERVER/DPSrvr.cpp:11296-11416, __VER >= 9): REVIVAL_TO_LODESTAR, the points at 20 % of their
    // maxima (230, 63, 32: (int) 46, 12, 6), then the lodestar (a REPLACE in the same world, which is a SETPOS)
    script.on('revivalToLodestar', () => [
      writeRevivalToLodestar(SELF_ID), writeSetPointParam(SELF_ID, DstParam.HP, 46),
      writeSetPointParam(SELF_ID, DstParam.MP, 12), writeSetPointParam(SELF_ID, DstParam.FP, 6), writeSetPos(SELF_ID, LODESTAR),
    ]);
    const gateway = await playGateway(page, script, { listed: NEW_CHARACTER });
    await enterFlaris(page);

    // the Aibatt's MELEE_ATTACK swings it (MTI_ATK1, a monster's own set), and its DAMAGE is a number in the own colours
    gateway.pushCache(script.later(aibattHits(12)));
    await expect.poll(async () => (await played(page)).swings, ON_FRAMES)
      .toMatchObject([{ attackerId: MONSTER_ID, motion: Mti.ATK1 }]);
    await expect.poll(async () => (await played(page)).numbers, ON_FRAMES).toMatchObject([{ value: 12, ownHurt: true }]);
    await expect(statusRow(page, 'hp')).toHaveText('218 / 230', ON_FRAMES);

    // the killing blow: MOVERDEATH (no DAMAGE: CAttackArbiter::OnDied), its number the HP Webby had; its line as it was
    // added (lines fade by the clock)
    await recordHudTexts(page);
    gateway.pushCache(script.later([writeMoverDeath(SELF_ID, MONSTER_ID, OBJMSG_DAMAGE)]));
    const revive = page.locator('.hud-revive');
    await expect(revive).toBeVisible(ON_FRAMES);
    await expect.poll(async () => (await hudTexts(page))?.lines, ON_FRAMES)
      .toEqual(['Press ESC and go back to Lodestar(Town) or Lodelight(Field) for resurrecting.']);
    await expect(statusRow(page, 'hp')).toHaveText('0 / 230', ON_FRAMES);
    expect((await played(page)).numbers).toMatchObject([{ value: 12, ownHurt: true }, { value: 218, ownHurt: true }]);
    const dead = (await moverOf(page, SELF_ID))!;
    expect([dead.motion, dead.state & ObjSta.DIE_ALL]).toEqual([Mti.DIE1, ObjSta.DEAD]);
    // Revive here needs a resurrection scroll (Piece 5): greyed
    await expect(revive.locator('[data-button="stand"]')).toBeDisabled();

    // Lodestar: one REVIVAL_TO_LODESTAR, and the server's answer: alive, the points at 20 %, at the lodestar
    await page.locator('[data-button="lodestar"]').click();
    await expect(revive).toBeHidden();
    await expect.poll(() => sentOf(gateway, PacketType.REVIVAL_TO_LODESTAR).length).toBe(1);
    await expect.poll(async () => (await page.evaluate(() => window.__client!.own()))?.hp).toBe(46);
    await expect(statusRow(page, 'hp')).toHaveText('46 / 230', ON_FRAMES);
    await expect(statusRow(page, 'mp')).toHaveText('12 / 63');
    await expect(statusRow(page, 'fp')).toHaveText('6 / 32');
    const at = await ownAt(page);
    expect([at[0], at[2]]).toEqual([Math.fround(LODESTAR[0]), Math.fround(LODESTAR[2])]);
    expect(at[1]).toBeCloseTo(groundAt(LODESTAR[0], LODESTAR[2]), 1);
    expect((await moverOf(page, SELF_ID))!.state & ObjSta.DIE_ALL).toBe(0);
    // alive, Escape no longer opens the revive window: with nothing to clear, the Start menu (WndManager.cpp:3421-3427)
    // 2026-11-09: on the desktop the chat is a window Escape closes, the one on top: it goes first (Neuz's GetWndBase)
    if (!isMobile) { await page.keyboard.press('Escape'); await expect(page.locator('.hud-neuz-chat')).toBeHidden(); }
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toBeVisible();
    await expect(revive).toBeHidden();
    expect(sentOf(gateway, PacketType.REVIVAL_TO_LODESTAR)).toHaveLength(1);
    expect((await page.evaluate(() => window.__client!.stats())).errors).toEqual([]);
  });

  // Spec §3.6: Webby at level 2 with its 2 stat points places them in the Character window; Apply asks, sends
  // MODIFY_STATUS, and the server's SETSTATE is the window's new numbers
  test('stat points: Apply sends MODIFY_STATUS, and the SETSTATE that answers it updates the window', async ({ page }) => {
    const script = fight(2, { ...newVagrantOwn(), remainGP: 2 });
    // CDPSrvr::OnModifyStatus (WORLDSERVER/DPSrvr.cpp:8341): the points added to the stats, then AddSetState
    script.on('modifyStatus', (p) => (p.type !== 'modifyStatus' ? [] : [
      writeSetState(SELF_ID, 15 + p.str, 15 + p.sta, 15 + p.dex, 15 + p.int, 2 - (p.str + p.sta + p.dex + p.int)),
    ]));
    const gateway = await playGateway(page, script, { listed: { ...NEW_CHARACTER, level: 2 } });
    await enterFlaris(page);
    const character = await openCharacterWindow(page);
    const value = (name: string): Locator => character.locator(`[data-value="${name}"]`);
    if (test.info().project.name === 'phone') {
      await expect(character).toHaveClass(/hud-character-landscape/);
      const base = (await character.locator('[data-label="base"]').boundingBox())!;
      const stats = (await value('str').boundingBox())!;
      expect(stats.x).toBeGreaterThan(base.x);
      const box = (await character.boundingBox())!;
      const hud = (await page.locator('.world-hud').boundingBox())!;
      const bar = (await page.locator('.hud-taskbar-strip').boundingBox())!;
      expect(Math.abs(box.x + box.width / 2 - (hud.x + hud.width / 2))).toBeLessThanOrEqual(1);
      expect(Math.abs(box.y + box.height / 2 - (hud.y + bar.y) / 2)).toBeLessThanOrEqual(1);
      expect(box.width).toBeGreaterThan(box.height * 1.4);
      await expect(character).not.toHaveAttribute('data-scrolls');
      await page.screenshot({ path: test.info().outputPath('mobile-character.png') });
    }
    const apply = character.locator('[data-button="apply"]');
    await expect(value('level')).toHaveText('2');
    await expect(value('str')).toHaveText('15');
    await expect(value('sta')).toHaveText('15');
    await expect(value('points')).toHaveText('2');
    await expect(apply).toBeDisabled();

    // a point on STR and one on STA, then Apply and the confirm box's Yes (CWndStateConfirm)
    await character.locator('[data-button="str-plus"]').click();
    await character.locator('[data-button="sta-plus"]').click();
    await expect(value('points')).toHaveText('0', ON_FRAMES);
    await apply.click();
    const confirm = page.getByRole('group', { name: 'Change State', exact: true });
    await expect(confirm).toBeVisible();
    expect(sentOf(gateway, PacketType.MODIFY_STATUS)).toEqual([]);
    await confirm.locator('[data-button="yes"]').click();
    await expect(confirm).toBeHidden();

    // CDPClient::SendModifyStatus: the points for STR, STA, DEX and INT, once
    await expect.poll(() => sentOf(gateway, PacketType.MODIFY_STATUS).length).toBe(1);
    const modify = sentOf(gateway, PacketType.MODIFY_STATUS)[0]!.body;
    expect([modify.readInt32LE(8), modify.readInt32LE(12), modify.readInt32LE(16), modify.readInt32LE(20)]).toEqual([1, 1, 0, 0]);
    // SETSTATE: the stats and the points are the server's, and the bars are full at the new maxima (OnSetState): STA 16
    // at level 2 is 240 HP and 34 FP
    await expect(value('str')).toHaveText('16', ON_FRAMES);
    await expect(value('sta')).toHaveText('16');
    await expect(value('points')).toHaveText('0');
    await expect(apply).toBeDisabled();
    await expect(statusRow(page, 'hp')).toHaveText('240 / 240', ON_FRAMES);
    await expect(statusRow(page, 'fp')).toHaveText('34 / 34');
    expect(sentOf(gateway, PacketType.MODIFY_STATUS)).toHaveLength(1);
    expect((await page.evaluate(() => window.__client!.stats())).errors).toEqual([]);
  });

  // Spec §5's pictures: a fight in Flaris (the status window, the target bar, the corners, a damage number and a hit
  // effect), and the Character window, each a test of its own: a screenshot waits on the frame loop, and two of them take
  // much of a test's time with the other files' worlds drawn beside it. The rules are paused, and the fight stepped to a
  // known tick (the test hooks' `step`): a number lives under a second, and the frames SwiftShader draws come at no fixed
  // time.
  test('a picture of the fight: the windows, the corners, a number and the critical banner', { tag: '@picture' }, async ({ page }) => {
    test.skip(test.info().project.use.hasTouch === true, "pictures are the desktop's only: one baseline a name (SwiftShader)");
    const script = fight();
    const gateway = await playGateway(page, script, { listed: NEW_CHARACTER });
    await enterFlaris(page);
    await tapMover(page, MONSTER_ID);
    await expect.poll(() => targetsOf(gateway)).toEqual([[MONSTER_ID, 2]]);
    await expect(page.locator('.hud-target-info')).toHaveText('120 / 120', ON_FRAMES);

    // paused, the critical's DAMAGE is played at the next frame (its number and banner made), and stepped 9 ticks: the
    // number has risen its 80 px and not begun its shake (whose way goes by how many frames were drawn before), and the
    // banner is up
    await page.evaluate(() => window.__client!.pause());
    gateway.pushCache(script.later([writeDamage(MONSTER_ID, SELF_ID, 25, CRITICAL)]));
    await expect.poll(() => played(page), ON_FRAMES).toMatchObject({
      numbers: [{ value: 25, ownHurt: false }], effects: [{ xi: Xi.HIT_CRITICAL01 }], swings: [],
    });
    await stepRules(page, 9);
    await expect(page.locator('.hud-target-info')).toHaveText('95 / 120');
    expect((await page.evaluate(() => window.__client!.stats())).errors).toEqual([]);
    // the face comes back from the GPU's asynchronous read (Piece 6 M5), under SwiftShader seconds after it is drawn
    await expect(page.locator('.hud-status-face canvas')).toHaveCount(1, ON_FRAMES);
    // The overlay's numbers (fps, heap) change from frame to frame, so it is masked. A screenshot waits on the frame loop:
    // with other worlds drawn beside it a frame takes about a second, and two that match took over 30 s (ON_FRAMES).
    await expect(page).toHaveScreenshot('fight-scene.png', { mask: [page.locator('#overlay')], ...ON_FRAMES });
  });

  // The new character's Character window (spec §3.6) over the paused world: its name, job, level, server and channel,
  // ATK 21, DEF 4, Critical 1% and A.Speed 42% with the Wooden Sword and the clothes, and the stats with no points
  test('a picture of the Character window', { tag: '@picture' }, async ({ page }) => {
    test.skip(test.info().project.use.hasTouch === true, "pictures are the desktop's only: one baseline a name (SwiftShader)");
    await playGateway(page, fight(), { listed: NEW_CHARACTER });
    await enterFlaris(page);
    await page.evaluate(() => window.__client!.pause());
    const character = await openCharacterWindow(page);
    const value = (name: string): Locator => character.locator(`[data-value="${name}"]`);
    await expect(value('name')).toHaveText('Webby');
    expect(await Promise.all(['atk', 'def', 'critical', 'speed'].map((name) => value(name).textContent())))
      .toEqual(['21', '4', '1%', '42%']);
    expect((await page.evaluate(() => window.__client!.stats())).errors).toEqual([]);
    // a screenshot waits on the frame loop (ON_FRAMES, as the fight's picture)
    await expect(character).toHaveScreenshot('fight-character-window.png', ON_FRAMES);
  });
});

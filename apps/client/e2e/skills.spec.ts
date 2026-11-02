// Skills against the pretend world server (Piece 4 spec §3.11, milestone 2): Webby, a Vagrant with the Wooden Sword in its
// hand, on Flaris' square with a Small Aibatt 5 m away. The world server is the testkit's script (`createWorldScript`),
// which answers the browser's skill packets as the world server would (`on`): the skill points' DOUSESKILLPOINT, a
// skill's USESKILL (or its refusal), and the action slot's chain, which the test drives with the messages the server
// sends as each skill ends (`later`). The tests use the windows as a player does: with the mouse and the keys on the
// desktop (K, a drag, a double click, F4, C), with a finger on the phone (the Start menu, a tap on a skill then on a
// slot, a tap on a slot, the action slot's button). What was played they read through the test hooks (`played`: a
// skill's effect lives under a second, and SwiftShader draws a frame when it can). The servers, Flaris and the helpers
// are worldHarness.ts's.

import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { AttackFlag, NULL_ID, PacketType, ShortcutKind, decodeWorldPacket } from '@flyffweb/protocol';
import type { AddedMover, OwnCharacter, TaskBar, Vec3, WorldPacket } from '@flyffweb/protocol';
import {
  createWorldScript, newVagrantOwn, writeAddMonster, writeAddPlayer, writeAddSelf, writeClearUseSkill, writeCreateSfxObj,
  writeDamage, writeDefinedText, writeDoUseSkillPoint, writeEndSkillQueue, writeSetActionPoint, writeTaskBar, writeUseSkill,
} from '@flyffweb/testkit';
import type { ScriptMessage, WorldScript } from '@flyffweb/testkit';
import type { ClientMover, ClientPlayed } from '../src/testHooks';
import { Xi } from '../src/world/fx/EffectManager';
import { Mti, ObjSta, Sut } from '../src/world/sim/constants';
import {
  BASE, MADRIGAL, MALE_VAGRANT, MI_MALE, MONSTER_ID, ON_FRAMES, SELF_ID, SELF_PLAYER, SQUARE, aibatt, enterFlaris, groundAt,
  hpOf, hudTexts, playGateway, recordHudTexts, self, sentOf, tapMover, targetsOf,
} from './worldHarness';
import type { Gateway, Listed } from './worldHarness';

// Entering, loading Flaris and drawing it with SwiftShader take much longer than a lobby screen. The waits on the frame
// loop (a walk up to the Aibatt, a skill's motion to its hit frame, what a frame plays or draws) are `ON_FRAMES` (ruling
// R28). A test here waits on more of them than a fight does (the action slot's three skills one after the other), with
// the other files' worlds drawn beside it: 180 s.
test.describe.configure({ timeout: 180_000 });

/** `MI_AIBATT1` (`Resource/defineObj.h:959`): the Small Aibatt, level 1, `dwAddHp` 120 (propMover.txt). */
const MI_AIBATT1 = 20;
const AIBATT_HP = 120;
/** `II_WEA_SWO_WOODEN` (`Resource/defineItem.h:32`): the Vagrant's Wooden Sword, a one-handed sword. */
const WOODEN_SWORD = 21;
/** The Small Aibatt 5 m from Webby, 4 m south and 3 m west, as fight.spec.ts has it. */
const AIBATT_AT: Vec3 = [6965, groundAt(6965, 3324), 3324];
const smallAibatt: AddedMover = { ...aibatt, index: MI_AIBATT1, pos: AIBATT_AT, hitPoint: AIBATT_HP };

/**
 * `SI_VAG_ONE_CLEANHIT`, `SI_VAG_ONE_BRANDISH` (Flurry) and `SI_VAG_ONE_OVERCUTTER` (Over Cut), `Resource/defineSkill.h:19-21`:
 * slots 0, 1 and 2 of a Vagrant's `m_aJobSkill` (`newVagrantOwn`, `BASE_VALUE_TBL`).
 */
const CLEAN_HIT = 1;
const FLURRY = 2;
const OVER_CUT = 3;
/** `XI_SYS_EXCHAN01` (`Resource/defineObj.h:176`): the effect a skill-point spend plays where the player stands. */
const XI_SYS_EXCHAN01 = 108;
/** `TID_GAME_REQFP` (`Resource/defineText.h:233`): "Not enough FP.". */
const TID_GAME_REQFP = 615;
/** A `KT_SKILL`'s casting time on the server: 1 (`CMover::DoUseSkill`, `_Common/MoverSkill.cpp:271-274`). */
const SKILL_CASTING_TIME = 1;
/** The slot of the first bar Clean Hit goes on: F4. */
const F4_SLOT = 3;

/** Webby's own data: a new Vagrant's (`newVagrantOwn`), its three skills at `levels`, `skillPoint` points unspent. */
function vagrant(levels: readonly [number, number, number], skillPoint: number, fatiguePoint = 32): OwnCharacter {
  const own = newVagrantOwn();
  const skills = own.skills.map((slot, i) => (i < levels.length ? { ...slot, level: levels[i]! } : slot));
  return { ...own, skills, skillPoint, fatiguePoint };
}

/** Webby at `level` in the character list: the vagrant's clothes and the Wooden Sword in the hand. */
const listedAt = (level: number): Listed => ({ level, equipment: [...MALE_VAGRANT, WOODEN_SWORD] });

/** Webby on the square with the Small Aibatt (and `others` after its own ADD_OBJ), a script of its own for each test. */
function skillsScript(level: number, own: OwnCharacter, others: ScriptMessage[] = []): WorldScript {
  const webby: AddedMover = { ...self, hitPoint: 230, player: { ...SELF_PLAYER, level, sta: own.sta, dex: own.dex, own } };
  return createWorldScript({
    playerObjectId: SELF_ID, worldId: MADRIGAL, pos: SQUARE, self: writeAddSelf(SELF_ID, webby),
    others: [...others, writeAddMonster(MONSTER_ID, smallAibatt)],
  });
}

type UseSkillPacket = Extract<WorldPacket, { type: 'useSkill' }>;

/**
 * The world server's USESKILL for the browser's `p` once `DoUseSkill` has begun it (`CDPSrvr::OnUseSkill`,
 * `WORLDSERVER/DPSrvrLux.cpp:32-99`, then `CUserMng::AddUseSkill`, `_Common/MoverSkill.cpp:887`): the skill of slot `p.index`
 * of `own` with its level, at `p`'s target, with `p`'s use type and a skill's casting time.
 */
function useSkillAnswer(own: OwnCharacter, p: UseSkillPacket): ScriptMessage {
  const slot = own.skills[p.index]!;
  return writeUseSkill(SELF_ID, slot.skill, slot.level, p.targetId, p.useType, SKILL_CASTING_TIME);
}

/** The browser's packets these tests read, by `decodeWorldPacket`'s name, and their types. */
const READ = {
  useSkill: PacketType.USESKILL, doUseSkillPoint: PacketType.DOUSESKILLPOINT, addItemTaskBar: PacketType.ADDITEMTASKBAR,
  skillTaskBar: PacketType.SKILLTASKBAR, playerSetDestObj: PacketType.PLAYERSETDESTOBJ,
} as const;

/** The packets of `name` the page sent on the cache connection so far, read as the world server reads them. */
function packetsOf<T extends keyof typeof READ>(gateway: Gateway, name: T): Array<Extract<WorldPacket, { type: T }>> {
  return sentOf(gateway, READ[name])
    .map((s) => decodeWorldPacket(new Uint8Array(s.body)))
    .filter((p): p is Extract<WorldPacket, { type: T }> => p.type === name);
}

const played = (page: Page): Promise<ClientPlayed> => page.evaluate(() => window.__client!.played());
const moverOf = async (page: Page, objectId: number): Promise<ClientMover | undefined> =>
  (await page.evaluate(() => window.__client!.movers())).find((m) => m.objectId === objectId);
const countOf = (p: ClientPlayed, xi: number): number => p.effects.filter((e) => e.xi === xi).length;
/** The rules step at which the effect `xi` was first played. */
const firstStepOf = (p: ClientPlayed, xi: number): number | undefined => p.effects.find((e) => e.xi === xi)?.step;
/** The test hooks' paused rules (`pause`) run `steps` steps, at once (`step`). */
const stepRules = (page: Page, steps: number): Promise<void> => page.evaluate((n) => window.__client!.step(n), steps);
const errorsOf = async (page: Page): Promise<string[]> => (await page.evaluate(() => window.__client!.stats())).errors;

const isTouch = (): boolean => test.info().project.use.hasTouch === true;
/** A press as the project's player makes it: a finger's tap on the phone, the mouse's click on the desktop. */
const press = (target: Locator): Promise<void> => (isTouch() ? target.tap() : target.click());

const skillWindow = (page: Page): Locator => page.locator('.hud-skills');
/** The skill `skillId` in the skill tree window (WIDC_CUSTOM2-4). */
const skillIn = (tree: Locator, skillId: number): Locator => tree.locator(`.hud-skill[data-skill="${skillId}"]`);
/** Slot `slot` of the task bar's item row (the bar shown), or of its action slot. */
const itemSlot = (page: Page, slot: number): Locator => page.locator(`.hud-slot[data-row="item"][data-slot="${slot}"]`);
const queueSlot = (page: Page, slot: number): Locator => page.locator(`.hud-slot[data-row="queue"][data-slot="${slot}"]`);

/** Opens the skill tree window: K on the desktop (APP_SKILL3's hotkey), the Start menu's Skills on the phone. */
async function openSkillWindow(page: Page): Promise<Locator> {
  if (isTouch()) {
    await press(page.getByRole('button', { name: 'Start' }));
    await press(page.getByRole('menuitem', { name: 'Skills' }));
  } else {
    await page.keyboard.press('k');
  }
  const tree = skillWindow(page);
  await expect(tree).toBeVisible();
  return tree;
}

/** Closes it, with no points placed: K again on the desktop, its close button on the phone. */
async function closeSkillWindow(page: Page): Promise<void> {
  if (isTouch()) await press(skillWindow(page).locator('.hud-window-close'));
  else await page.keyboard.press('k');
  await expect(skillWindow(page)).toBeHidden();
}

/**
 * A skill of the window carried to a slot of the bar: dragged with the mouse on the desktop (`CWndSkillTreeEx::OnMouseMove`,
 * then `CWndTaskBar::OnDropIcon`), tapped then the slot tapped with a finger on the phone.
 */
async function carry(page: Page, skill: Locator, slot: Locator): Promise<void> {
  if (isTouch()) {
    await skill.tap();
    await slot.tap();
    return;
  }
  const centre = async (target: Locator): Promise<{ x: number; y: number }> => {
    const box = (await target.boundingBox())!;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const from = await centre(skill);
  const to = await centre(slot);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

/** Uses slot `slot` of the bar shown: its F-key on the desktop, a tap on it on the phone. */
async function useSlot(page: Page, slot: number): Promise<void> {
  if (isTouch()) await itemSlot(page, slot).tap();
  else await page.keyboard.press(`F${slot + 1}`);
}

/** Uses the action slot: C on the desktop (`CWndWorld::OnKeyUp`), its button on the phone. */
async function useActionSlot(page: Page): Promise<void> {
  if (isTouch()) await page.locator('.hud-taskbar-action').tap();
  else await page.keyboard.press('c');
}

test.describe('skills against the pretend world server', () => {
  // Spec §3.11: a level 5 Vagrant with 4 points raises Clean Hit twice in the skill window; Finish asks, Yes sends
  // DOUSESKILLPOINT, and the server's answer is the player's new levels, which the open window loads anew
  test("skill points: Clean Hit raised in the skill window, Finish and Yes send DOUSESKILLPOINT, and its answer is the window's", async ({ page }) => {
    const own = vagrant([0, 0, 0], 4);
    const script = skillsScript(5, own);
    // CDPSrvr::OnDoUseSkillPoint (WORLDSERVER/DPSrvr.cpp:1104-1163): the points the raised levels cost taken off (a level of
    // a Vagrant skill costs 1, CProject::GetSkillPoint), the effect XI_SYS_EXCHAN01 where the player stands
    // (CUserMng::AddCreateSfxObj), then DOUSESKILLPOINT with the browser's own array and the points left
    script.on('doUseSkillPoint', (p) => {
      if (p.type !== 'doUseSkillPoint') return [];
      const spent = p.skills.reduce((sum, slot, i) => sum + (slot.skill === NULL_ID ? 0 : slot.level - own.skills[i]!.level), 0);
      return [writeCreateSfxObj(SELF_ID, XI_SYS_EXCHAN01, SQUARE), writeDoUseSkillPoint(SELF_ID, p.skills, own.skillPoint - spent)];
    });
    const gateway = await playGateway(page, script, { listed: listedAt(5) });
    await enterFlaris(page);
    const tree = await openSkillWindow(page);
    if (test.info().project.name === 'phone') {
      await expect(tree).toHaveClass(/hud-skills-landscape/);
      const box = (await tree.boundingBox())!;
      const hud = (await page.locator('.world-hud').boundingBox())!;
      const bar = (await page.locator('.hud-taskbar-strip').boundingBox())!;
      expect(Math.abs(box.x + box.width / 2 - (hud.x + hud.width / 2))).toBeLessThanOrEqual(1);
      expect(Math.abs(box.y + box.height / 2 - (hud.y + bar.y) / 2)).toBeLessThanOrEqual(1);
      const panels = await tree.locator('.hud-skills-panel').all();
      const boxes = await Promise.all(panels.map((panel) => panel.boundingBox()));
      expect(boxes).toHaveLength(3);
      expect(boxes[1]!.x).toBeGreaterThanOrEqual(boxes[0]!.x + boxes[0]!.width);
      expect(boxes[2]!.x).toBeGreaterThanOrEqual(boxes[1]!.x + boxes[1]!.width);
      expect(boxes[0]!.y).toBeCloseTo(boxes[2]!.y, 0);
      await expect(tree).not.toHaveAttribute('data-scrolls');
      await page.screenshot({ path: test.info().outputPath('mobile-skills.png') });
    }
    const points = tree.locator('.hud-skills-points');
    const cleanHit = skillIn(tree, CLEAN_HIT);
    const digit = cleanHit.locator('.hud-skill-digit');
    await expect(points).toHaveText('4');
    await expect(cleanHit).toHaveAttribute('data-level', '0');

    // Clean Hit chosen, + twice: the plan's level 2, drawn with the digits of a level not yet sent (frame 20 + level - 1)
    await press(cleanHit);
    const plus = tree.locator('[data-button="plus"]');
    await press(plus);
    await press(plus);
    await expect(points).toHaveText('2');
    await expect(cleanHit).toHaveAttribute('data-level', '2');
    await expect(digit).toHaveAttribute('data-frame', '21');
    expect(sentOf(gateway, PacketType.DOUSESKILLPOINT)).toEqual([]);

    // Finish asks first (CWndReSkillWarning); its Yes sends
    await press(tree.locator('[data-button="finish"]'));
    const warning = page.locator('.hud-confirm').filter({ hasText: 'Confirm changes to skill points?' });
    await expect(warning).toBeVisible();
    expect(sentOf(gateway, PacketType.DOUSESKILLPOINT)).toEqual([]);
    await press(warning.locator('[data-button="yes"]'));
    await expect(warning).toBeHidden();

    // one DOUSESKILLPOINT (CDPClient::SendDoUseSkillPoint): the player's 45 slots, its skill IDs with the plan's levels
    await expect.poll(() => packetsOf(gateway, 'doUseSkillPoint').length).toBe(1);
    const [spend] = packetsOf(gateway, 'doUseSkillPoint');
    expect(spend!.skills).toHaveLength(own.skills.length);
    expect(spend!.skills.slice(0, 4)).toEqual([
      { skill: CLEAN_HIT, level: 2 }, { skill: FLURRY, level: 0 }, { skill: OVER_CUT, level: 0 }, own.skills[3],
    ]);
    // the answer: the window loads the player's skills anew (InitItem): Clean Hit at 2, the player's own level now (the
    // digit of a level sent, frame 1), and the 2 points the server left
    await expect(digit).toHaveAttribute('data-frame', '1', ON_FRAMES);
    await expect(cleanHit).toHaveAttribute('data-level', '2');
    await expect(points).toHaveText('2');
    await expect(tree.locator('[data-button="finish"]')).toBeDisabled();
    // and the server's effect where the player stands, once
    await expect.poll(async () => countOf(await played(page), XI_SYS_EXCHAN01), ON_FRAMES).toBe(1);
    expect(packetsOf(gateway, 'doUseSkillPoint')).toHaveLength(1);
    expect(await errorsOf(page)).toEqual([]);
  });

  // Spec §3.11: Clean Hit goes from the skill window onto F4 (ADDITEMTASKBAR); with the Aibatt selected, F4 walks Webby up
  // to it and sends USESKILL; the server's USESKILL plays the skill (its effect at the motion's hit frame) and its DAMAGE
  // the number and the HP
  test('the bar: Clean Hit put on F4 sends ADDITEMTASKBAR; used on the selected Aibatt it sends USESKILL, plays its effect and takes the DAMAGE', async ({ page }) => {
    const own = vagrant([1, 0, 0], 0);
    const script = skillsScript(5, own);
    script.on('useSkill', (p) => (p.type === 'useSkill' ? [useSkillAnswer(own, p)] : []));
    const gateway = await playGateway(page, script, { listed: listedAt(5) });
    await enterFlaris(page);

    // CWndTaskBar::SetShortcut: Clean Hit (slot 0 of m_aJobSkill) on slot 3 of bar 0, m_dwData 1 (an item bar)
    const tree = await openSkillWindow(page);
    const slot = itemSlot(page, F4_SLOT);
    await carry(page, skillIn(tree, CLEAN_HIT), slot);
    await expect.poll(() => packetsOf(gateway, 'addItemTaskBar')).toEqual([{
      type: 'addItemTaskBar', bar: 0, slot: F4_SLOT,
      shortcut: { kind: ShortcutKind.SKILL, id: 0, type: 0, index: F4_SLOT, userId: 0, data: 1, text: '' },
    }]);
    await expect(slot).toHaveAttribute('data-kind', 'skill');
    await expect(slot).toHaveAttribute('aria-label', 'Clean Hit');
    await closeSkillWindow(page);

    // the Aibatt selected with one tap (SETTARGET), then F4: CMD_SetUseSkill walks up to it, AR_SHORT (2 m) from it, and on
    // arriving sends USESKILL: slot 0, the Aibatt, SUT_NORMAL, no Ctrl
    await tapMover(page, MONSTER_ID);
    await expect.poll(() => targetsOf(gateway)).toEqual([[MONSTER_ID, 2]]);
    await useSlot(page, F4_SLOT);
    await expect.poll(() => packetsOf(gateway, 'useSkill'), ON_FRAMES).toEqual([{
      type: 'useSkill', skillType: 0, index: 0, targetId: MONSTER_ID, useType: Sut.NORMAL, control: false,
    }]);
    expect(packetsOf(gateway, 'playerSetDestObj')[0]).toEqual({ type: 'playerSetDestObj', targetId: MONSTER_ID, range: 2 });

    // the answer begins the skill (DoUseSkill): its motion to the hit frame, where CreateSkillSfx plays Clean Hit's effect
    // (dwSfxObj3), once
    await expect.poll(async () => countOf(await played(page), Xi.SKILL_VAG_ONE_CLEANHIT01), ON_FRAMES).toBe(1);
    // the server's DAMAGE comes at its own copy's hit (OnMeleeSkill → ApplySkill → SendDamage( AF_MELEESKILL ), then
    // CUserMng::AddDamage): the number on the Aibatt and its HP
    gateway.pushCache(script.later([writeDamage(MONSTER_ID, SELF_ID, 37, AttackFlag.MELEESKILL)]));
    await expect.poll(async () => (await played(page)).numbers, ON_FRAMES).toMatchObject([{ value: 37, ownHurt: false }]);
    expect(await hpOf(page, MONSTER_ID)).toBe(AIBATT_HP - 37);
    await expect(page.locator('.hud-target-info')).toHaveText(`${AIBATT_HP - 37} / ${AIBATT_HP}`, ON_FRAMES);
    // one USESKILL, and the begun skill turned the auto-attack on (OnUseSkill): Webby swings at the Aibatt after it
    expect(packetsOf(gateway, 'useSkill')).toHaveLength(1);
    await expect.poll(() => sentOf(gateway, PacketType.MELEE_ATTACK).length, ON_FRAMES).toBeGreaterThan(0);
    expect(await errorsOf(page)).toEqual([]);
  });

  // Spec §3.11: Clean Hit, Flurry and Over Cut put in the action slot (SKILLTASKBAR); C starts the chain with its first
  // skill (SUT_QUEUESTART); the server runs the rest, each skill with its action points and its USESKILL (SUT_QUEUEING) as
  // the one before ends, and ends it with ENDSKILLQUEUE, after which C starts it again
  test('the action slot: Clean Hit, Flurry and Over Cut; C starts the chain, the server drives it with SUT_QUEUEING and ends it with ENDSKILLQUEUE', async ({ page }) => {
    // level 10, Clean Hit and Flurry at 3, Over Cut at 1: each skill open (Flurry needs Clean Hit 3, Over Cut Flurry 3)
    const own = vagrant([3, 3, 1], 0);
    const bar: TaskBar = { applets: [], items: [], queue: [], actionPoint: 100 };
    const script = skillsScript(10, own, [writeTaskBar(SELF_ID, bar)]);
    script.on('useSkill', (p) => (p.type === 'useSkill' && p.useType === Sut.QUEUESTART ? [useSkillAnswer(own, p)] : []));
    const gateway = await playGateway(page, script, { listed: listedAt(10) });
    await enterFlaris(page);
    expect((await page.evaluate(() => window.__client!.own()))?.actionPoint).toBe(100);

    // the three skills after one another (CWndTaskBar::SetSkillQueue): a double click on each on the desktop
    // (CWndSkillTreeEx::OnLButtonDblClk), each tapped and then its slot on the phone; SKILLTASKBAR each time, with the 5 slots
    const tree = await openSkillWindow(page);
    for (const [i, skillId] of [CLEAN_HIT, FLURRY, OVER_CUT].entries()) {
      if (isTouch()) await carry(page, skillIn(tree, skillId), queueSlot(page, i));
      else await skillIn(tree, skillId).dblclick();
      await expect(queueSlot(page, i)).toHaveAttribute('data-kind', 'skill');
    }
    await expect.poll(() => packetsOf(gateway, 'skillTaskBar').length).toBe(3);
    const queue = packetsOf(gateway, 'skillTaskBar')[2]!.entries;
    expect(queue.map((e) => [e.slot, e.shortcut.kind, e.shortcut.id, e.shortcut.data])).toEqual([
      [0, ShortcutKind.SKILL, 0, 2], [1, ShortcutKind.SKILL, 1, 2], [2, ShortcutKind.SKILL, 2, 2],
      [3, ShortcutKind.NONE, 0, 0], [4, ShortcutKind.NONE, 0, 0],
    ]);
    await closeSkillWindow(page);

    // the Aibatt selected, then C: the first skill at it, SUT_QUEUESTART (CWndTaskBar::UseSkillQueue)
    await tapMover(page, MONSTER_ID);
    await expect.poll(() => targetsOf(gateway)).toEqual([[MONSTER_ID, 2]]);
    await useActionSlot(page);
    const starts = (): UseSkillPacket[] => packetsOf(gateway, 'useSkill').filter((u) => u.useType === Sut.QUEUESTART);
    await expect.poll(() => packetsOf(gateway, 'useSkill'), ON_FRAMES).toEqual([{
      type: 'useSkill', skillType: 0, index: 0, targetId: MONSTER_ID, useType: Sut.QUEUESTART, control: false,
    }]);

    // the server runs the chain (CUserTaskBar::SetNextSkill, _Interface/UserTaskBar.cpp:198-237): as each skill ends (here,
    // once its blows have played: Clean Hit's one, Flurry's three), the action points the next slot costs (6 for the
    // second, 8 for the third) with SETACTIONPOINT (written to NULL_ID, CUser::AddSetActionPoint), and the next skill
    // begun, SUT_QUEUEING; a DAMAGE of each skill came at its hit before
    await expect.poll(async () => countOf(await played(page), Xi.SKILL_VAG_ONE_CLEANHIT01), ON_FRAMES).toBe(1);
    gateway.pushCache(script.later([
      writeDamage(MONSTER_ID, SELF_ID, 20, AttackFlag.MELEESKILL), writeSetActionPoint(NULL_ID, 94),
      writeUseSkill(SELF_ID, FLURRY, 3, MONSTER_ID, Sut.QUEUEING, SKILL_CASTING_TIME),
    ]));
    await expect.poll(async () => countOf(await played(page), Xi.SKILL_VAG_ONE_BRANDISH01), ON_FRAMES).toBe(3);
    gateway.pushCache(script.later([
      writeDamage(MONSTER_ID, SELF_ID, 30, AttackFlag.MELEESKILL), writeSetActionPoint(NULL_ID, 86),
      writeUseSkill(SELF_ID, OVER_CUT, 1, MONSTER_ID, Sut.QUEUEING, SKILL_CASTING_TIME),
    ]));
    await expect.poll(async () => countOf(await played(page), Xi.SKILL_VAG_ONE_OVERCUTTER01), ON_FRAMES).toBe(1);
    // the fourth slot is empty: CUserTaskBar::OnEndSkillQueue (:188-195), ENDSKILLQUEUE, after Over Cut's DAMAGE
    gateway.pushCache(script.later([writeDamage(MONSTER_ID, SELF_ID, 40, AttackFlag.MELEESKILL), writeEndSkillQueue(SELF_ID)]));
    await expect.poll(async () => (await played(page)).numbers, ON_FRAMES).toMatchObject([
      { value: 20, ownHurt: false }, { value: 30, ownHurt: false }, { value: 40, ownHurt: false },
    ]);

    // each skill played in the chain's order, the action points are the server's, and the HP took the three blows
    const p = await played(page);
    expect(firstStepOf(p, Xi.SKILL_VAG_ONE_CLEANHIT01)!).toBeLessThan(firstStepOf(p, Xi.SKILL_VAG_ONE_BRANDISH01)!);
    expect(firstStepOf(p, Xi.SKILL_VAG_ONE_BRANDISH01)!).toBeLessThan(firstStepOf(p, Xi.SKILL_VAG_ONE_OVERCUTTER01)!);
    expect((await page.evaluate(() => window.__client!.own()))?.actionPoint).toBe(86);
    expect(await hpOf(page, MONSTER_ID)).toBe(AIBATT_HP - 90);
    // the chain is over (OnEndSkillQueue → OnCancelSkill, m_nExecute 0): C starts it again, with its first skill; the
    // browser stopped nothing itself (no ENDSKILLQUEUE of its own)
    expect(starts()).toHaveLength(1);
    await useActionSlot(page);
    await expect.poll(() => starts().length, ON_FRAMES).toBe(2);
    expect(sentOf(gateway, PacketType.ENDSKILLQUEUE)).toEqual([]);
    expect(await errorsOf(page)).toEqual([]);
  });

  // Spec §3.11: the server refuses a skill. With 2 FP Clean Hit (5 FP) is refused in DoUseSkill, which tells the player
  // TID_GAME_REQFP (MoverSkill.cpp:729-735, a DEFINEDTEXT with an empty format) before OnUseSkill answers CLEAR_USESKILL:
  // the text is a line of the server messages, and nothing is played
  test('a refusal: "Not enough FP." is a line of the server messages, and the skill plays nothing', async ({ page }) => {
    const own = vagrant([1, 0, 0], 0, 2);
    // Clean Hit already on F4, from the JOIN's TASKBAR (CUser::Open, WORLDSERVER/User.cpp:326-328): a skill shortcut's
    // text is not on the wire
    const bar: TaskBar = {
      applets: [], queue: [], actionPoint: 0,
      items: [{ bar: 0, slot: F4_SLOT, shortcut: { kind: ShortcutKind.SKILL, id: 0, type: 0, index: F4_SLOT, userId: 0, data: 1, text: '' } }],
    };
    const script = skillsScript(5, own, [writeTaskBar(SELF_ID, bar)]);
    script.on('useSkill', () => [writeDefinedText(SELF_ID, TID_GAME_REQFP, ''), writeClearUseSkill(SELF_ID)]);
    const gateway = await playGateway(page, script, { listed: listedAt(5) });
    await enterFlaris(page);
    await expect(itemSlot(page, F4_SLOT)).toHaveAttribute('aria-label', 'Clean Hit');

    await recordHudTexts(page);
    await tapMover(page, MONSTER_ID);
    await expect.poll(() => targetsOf(gateway)).toEqual([[MONSTER_ID, 2]]);
    await useSlot(page, F4_SLOT);
    await expect.poll(() => packetsOf(gateway, 'useSkill').length, ON_FRAMES).toBe(1);
    // the line, in the order the HUD added it
    await expect.poll(async () => (await hudTexts(page))?.lines, ON_FRAMES).toEqual(['Not enough FP.']);
    // refused: no motion, no effect, and no auto-attack begun (only a begun skill starts it, OnUseSkill)
    const webby = (await moverOf(page, SELF_ID))!;
    expect(webby.motion).not.toBe(Mti.VAG_ONE_CLEANHIT);
    expect(webby.state & ObjSta.ATK_ALL).toBe(0);
    expect(countOf(await played(page), Xi.SKILL_VAG_ONE_CLEANHIT01)).toBe(0);
    expect(sentOf(gateway, PacketType.MELEE_ATTACK)).toEqual([]);
    expect(await hpOf(page, MONSTER_ID)).toBe(AIBATT_HP);
    expect(await errorsOf(page)).toEqual([]);
  });

  // Spec §3.11: another player's USESKILL plays the skill on that player (DoUseSkill, for players only: a monster's
  // USESKILL begins nothing, MoverSkill.cpp:177-178). The rules are paused and stepped (the test hooks' `step`) so that the
  // motion is seen before it ends
  test("another player's skill: its USESKILL plays the motion and the effect on them, a monster's plays nothing", async ({ page }) => {
    // Bob, another player dressed as a vagrant, 2.5 m from the Aibatt
    const BOB_ID = 9003;
    const BOB_AT: Vec3 = [6963, groundAt(6963, 3325.5), 3325.5];
    const bob: AddedMover = {
      ...BASE, index: MI_MALE, pos: BOB_AT, angle: 0, objectId: BOB_ID, isPlayer: true,
      player: {
        ...SELF_PLAYER, self: false, name: 'Bob', playerId: 501, equipmentObjectIds: [],
        worn: MALE_VAGRANT.map((itemId, i) => ({ part: [2, 4, 5][i]!, itemId, flag: 0 })),
      },
    };
    const script = skillsScript(5, vagrant([1, 0, 0], 0), [writeAddPlayer(BOB_ID, bob)]);
    const gateway = await playGateway(page, script, { listed: listedAt(5) });
    await enterFlaris(page);
    const aibattBefore = (await moverOf(page, MONSTER_ID))!;

    // paused, the Aibatt's USESKILL at Webby, then Bob's Clean Hit at the Aibatt (CUserMng::AddUseSkill to everyone around)
    await page.evaluate(() => window.__client!.pause());
    gateway.pushCache(script.later([
      writeUseSkill(MONSTER_ID, CLEAN_HIT, 1, SELF_ID, Sut.NORMAL, SKILL_CASTING_TIME),
      writeUseSkill(BOB_ID, CLEAN_HIT, 1, MONSTER_ID, Sut.NORMAL, SKILL_CASTING_TIME),
    ]));
    // Bob's motion is Clean Hit's (MTI_VAG_ONE_CLEANHIT with MOP_FIXED), in the melee-skill state; the Aibatt's is as it was
    await expect.poll(async () => (await moverOf(page, BOB_ID))?.motion).toBe(Mti.VAG_ONE_CLEANHIT);
    expect((await moverOf(page, BOB_ID))!.state & ObjSta.ATK_ALL).toBe(ObjSta.ATK_MELEESKILL);
    const aibattNow = (await moverOf(page, MONSTER_ID))!;
    expect([aibattNow.motion, aibattNow.state]).toEqual([aibattBefore.motion, aibattBefore.state]);
    expect(countOf(await played(page), Xi.SKILL_VAG_ONE_CLEANHIT01)).toBe(0);

    // stepped 30 at a time until the hit frame (nothing hits or ends while the motion's file is still on its way): the
    // effect, once, Bob's alone
    await expect.poll(async () => {
      await stepRules(page, 30);
      return countOf(await played(page), Xi.SKILL_VAG_ONE_CLEANHIT01);
    }, ON_FRAMES).toBe(1);
    // and on to the end of the motion (65 % of its frames): Bob's skill is over, and nothing more was played
    await expect.poll(async () => {
      await stepRules(page, 30);
      return (await moverOf(page, BOB_ID))!.state & ObjSta.ATK_ALL;
    }, ON_FRAMES).toBe(0);
    expect(countOf(await played(page), Xi.SKILL_VAG_ONE_CLEANHIT01)).toBe(1);
    expect((await moverOf(page, MONSTER_ID))!.state & ObjSta.ATK_ALL).toBe(0);
    // Webby used nothing
    expect(packetsOf(gateway, 'useSkill')).toEqual([]);
    expect(await errorsOf(page)).toEqual([]);
  });
});

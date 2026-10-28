// The live world test's fight and skill part (world.live.test.ts, its last two tests): the way out of Flaris to the Small
// Aibatts and the walks along it, the starter food, the choice of an Aibatt, the fight and its checks, the skill part's
// spend and its use of Clean Hit, and what a run that stops leaves for the owner to do. The player is the test's
// (`FightPlayer`, `SkillPlayer`: what of it these read and press); the world screen's attack and skill use it presses are
// the real ones (`AttackLoop`, `Focus`, `SkillUse`).

import { AttackFlag } from '@flyffweb/protocol';
import type { InventoryItem, Shortcut, SkillSlot, Vec3, WorldMessage } from '@flyffweb/protocol';
import type { WebSkill } from '@flyffweb/formats';
import { attackAble } from '../../src/world/combat/attackLoop';
import type { GameData } from '../../src/world/gameData';
import type { OwnState } from '../../src/world/OwnState';
import { ObjSta } from '../../src/world/sim/constants';
import { SkillPlan } from '../../src/world/skills/skillRules';
import type { WorldSession } from '../../src/world/WorldSession';
import { isDie } from '../../src/world/WorldState';
import type { CombatEvent, Mover, WorldState } from '../../src/world/WorldState';

/**
 * `II_GEN_FOO_INS_LOLLIPOP` and `II_GEN_FOO_INS_BISCUIT` (`Resource/defineItem.h:1063-1064`), with what a new character
 * carries of them: 3 and 1 (`BASE_VALUE_TBL`, `Database.sql:2741-2742`, men and women alike).
 */
export const NEW_CHARACTER_FOOD: ReadonlyMap<number, number> = new Map([[2800, 3], [2801, 1]]);
/** `MI_AIBATT1` (`Resource/defineObj.h:1028`), the Small Aibatt: level 1, `dwAddHp` 120, `nExpValue` 2 (`propMover.txt:7`). */
export const MI_AIBATT1 = 20;
/**
 * The way out of Flaris to the Small Aibatts north of it, D3D x and z, each point a tap's walk (DESTPOS) once the walker
 * stands at the one before: from where new characters start (`RI_BEGIN`, `Resource/World/WdMadrigal/WdMadrigal.rgn:742`,
 * beside the lodestar, `RI_REVIVAL` at :745; after the first tests a new character stands 26 m south of it), north
 * between the fences to the north gate (its two lamps, `obj_mafiprla02` at 6953.6, 3377.6 and 6965.6, 3377.6), over the
 * bridge (`obj_maflprbr03`, 6960.4, 3396.0), and across the field to a spot between the two Small Aibatt respawns there
 * (`WdMadrigal.rgn:700-701`: 18 each, in 7028-7076 x 3392-3440 and 6988-7036 x 3400-3448), with nothing in the way for
 * about 12 m around. Each leg was walked through the rules with Madrigal's placed objects (the converted files), both
 * ways, and met nothing. The giant's respawn (`MI_AIBATT4`, `RANK_BOSS`, `WdMadrigal.rgn:687`) is about 530 m south-west
 * of the spot.
 */
export const TO_THE_AIBATTS: readonly (readonly [number, number])[] = [[6972, 3337], [6962, 3348], [6960, 3366], [6960, 3412], [7040, 3430]];
/** A walker in walk mode goes a quarter of its 6 m a second (`moveSpeed`); each leg of the way gets that long, and this more. */
export const WALK_M_PER_S = 1.5;
export const LEG_SPARE_MS = 10000;
/** A walk ends within this of its point. */
export const ARRIVED_WITHIN_M = 1;
/** All the Small Aibatts near may be dead: one comes back within 30 s (`m_uTime` 60, halved for `MI_AIBATT1`: `CWorld::ReadRespawn`, `WorldFile.cpp:597`, :627-636). */
export const AIBATT_WAIT_MS = 40000;
/** The attack runs until MOVERDEATH, for at most this long (each Aibatt). */
export const FIGHT_MS = 60000;
/**
 * Every swing's DAMAGE comes within this; the killing blow's answer is the MOVERDEATH instead, as the server sends no
 * DAMAGE for it (`CAttackArbiter::OnDamageMsgW`, `WORLDSERVER/AttackArbiter.cpp:228-255`: `OnDamaged` with HP left,
 * else `OnDied`).
 */
export const DAMAGE_WAIT_MS = 3000;

const sleep = (ms: number): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** What the fight reads of the test's player and presses on it (`Player` in world.live.test.ts). */
export interface FightPlayer {
  readonly role: string;
  /** In the world and stepping. */
  readonly playing: boolean;
  readonly world: WorldState | undefined;
  readonly session: Pick<WorldSession, 'stats' | 'sendRevivalToLodestar'> | undefined;
  readonly own: OwnState | undefined;
  /** A tap on the land, at this D3D point, that the next step takes. */
  tap: Vec3 | null;
  readonly sentDestPos: readonly unknown[];
  readonly sentCorr: readonly unknown[];
  readonly sentDestObj: readonly number[];
  readonly sentSwings: readonly { at: number; targetId: number }[];
  readonly combatSeen: readonly { at: number; event: CombatEvent }[];
  readonly viewProblems: ReadonlySet<string>;
  readonly focusId: number | null;
  readonly canAttackFocus: boolean;
  pressMover(objectId: number): void;
  pressAttack(): void;
  giveUpTarget(): void;
  inView(): string;
}

/** What the fight needs of the test besides the player: the game data, the ground's height, and the check that nothing failed. */
export interface FightContext {
  data: GameData;
  heightAt(x: number, z: number): number | null;
  /** Throws if the rules loop or a player's session failed (`checkWell`). */
  check(): void;
}

/** The D3D x, z distance between two points. */
export const apart = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[2] - b[2]);

/** The state of a mover as a short text, for a failure message. */
export const stateText = (m: Pick<Mover, 'act' | 'corr' | 'dest'>): string =>
  `at ${m.act.body.pos.map((v) => v.toFixed(2)).join(', ')} in state 0x${m.act.state.toString(16)}, ${m.corr?.remnant ?? 0} correction steps left${m.dest?.pos == null ? '' : ', walking to a point'}`;

/** Standing, with no correction running and no point to walk to. */
export const stands = (m: Mover): boolean =>
  (m.act.state & ObjSta.MOVE_ALL) === ObjSta.STAND && (m.corr?.remnant ?? 0) === 0 && (m.dest?.pos ?? null) === null;

/**
 * Polls `done` until it holds, calling `check` all the while (it throws when something failed); `why` says what was seen
 * instead if it does not within `timeoutMs`.
 */
export async function pollUntil(
  check: () => void, what: string, timeoutMs: number, done: () => boolean, why: () => string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    check();
    if (done()) return;
    if (Date.now() > deadline) throw new Error(`${what}: not within ${timeoutMs / 1000} s. ${why()}`);
    await sleep(20);
  }
}

/**
 * What is wrong with the own inventory for the fight, or null: it must have been read (Task 4's own ADD_OBJ), and hold
 * the starter food, counted over its slots: exactly a new character's (`NEW_CHARACTER_FOOD`) for a character the test
 * `made`, some of each for any other.
 */
export function foodProblem(own: Pick<OwnState, 'inventory' | 'inventoryError'>, made: boolean): string | null {
  if (own.inventory === null) return `the walker's inventory could not be read from its ADD_OBJ: ${own.inventoryError}`;
  const items: InventoryItem[] = [...own.inventory.values()];
  const listed = `${items.length} items: ${items.map((item) => `${item.itemId} x${item.count}`).join(', ')}`;
  for (const [itemId, newCount] of NEW_CHARACTER_FOOD) {
    const count = items.filter((item) => item.itemId === itemId).reduce((sum, item) => sum + item.count, 0);
    if (made && count !== newCount) {
      return `the new character the test made carries ${count} of item ${itemId}, not ${newCount} as BASE_VALUE_TBL gives it (${listed})`;
    }
    if (!made && count === 0) {
      return `the walker's inventory holds no item ${itemId} (a new character has 3 of 2800 and 1 of 2801; ${listed}). Use a new character, or one that still carries its starter food.`;
    }
  }
  return null;
}

/** The index of the point of `TO_THE_AIBATTS` nearest `pos` (D3D x and z), the first of equals. */
function nearestPoint(pos: Vec3): number {
  let nearest = 0;
  TO_THE_AIBATTS.forEach(([x, z], i) => {
    const [bx, bz] = TO_THE_AIBATTS[nearest]!;
    if (Math.hypot(pos[0] - x, pos[2] - z) < Math.hypot(pos[0] - bx, pos[2] - bz)) nearest = i;
  });
  return nearest;
}

/**
 * The way back into Flaris from `pos`: from the point of the way out it stands nearest, through every point before it,
 * to the first; none when it stands nearest the first (in town, by where new characters start).
 */
export function resumeRoute(pos: Vec3): (readonly [number, number])[] {
  const nearest = nearestPoint(pos);
  return nearest === 0 ? [] : TO_THE_AIBATTS.slice(0, nearest + 1).reverse();
}

/**
 * What the owner must do when a run leaves the walker's character outside the town, or null when it need not: a
 * character the test `made` is deleted at the end, a dead one revives at the nearest lodestar as it logs out
 * (`CUserMng::DestroyPlayer`, `WORLDSERVER/User.cpp:4043-4090`: Flaris's for the field, `WdMadrigal.rgn:745`), and one
 * nearest the first point of the way out is in town. `own` is the own mover as last seen.
 */
export function leftOutsideNote(made: boolean, own: Mover | undefined): string | null {
  if (made || own === undefined || isDie(own) || resumeRoute(own.act.body.pos).length === 0) return null;
  const [x, , z] = own.act.body.pos;
  const [bx, bz] = TO_THE_AIBATTS[0]!;
  return `The walker's character was left outside Flaris at (${Math.round(x)}, ${Math.round(z)}). Before the next run, `
    + `log in with it in the browser and walk it back through the north gate to the lodestar, where new characters `
    + `start (${bx}, ${bz}): the first test needs it in sight of the other character.`;
}

/** `failure` with `note` after its message (the same error if there is no note). */
export function withNote(failure: unknown, note: string | null): unknown {
  if (note === null) return failure;
  const error = failure instanceof Error ? failure : new Error(String(failure));
  return new Error(`${error.message}\n${note}`, { cause: error });
}

/**
 * The revive window's button (`ReviveWindow`, `WorldScreen.showWorld`: `sendRevivalToLodestar`) for a walker that died
 * while it is still in the world; true when it was pressed.
 */
export function reviveIfDead(player: Pick<FightPlayer, 'playing' | 'world' | 'session'>): boolean {
  const own = player.world?.self();
  if (!player.playing || own === undefined || !isDie(own)) return false;
  player.session?.sendRevivalToLodestar();
  return true;
}

/** How many texts of number `textId` (DEFINEDTEXT) are among `seen`. */
export function attackSpeedRefusals(seen: readonly { event: CombatEvent }[], textId: number): number {
  return seen.filter(({ event }) => event.kind === 'text' && event.textId === textId).length;
}

/** A text of the texts catalog that the server names by its number (DEFINEDTEXT). */
export interface NumberedText {
  textId: number;
  text: string;
}

/** The two texts the fight fails on, by the numbers DEFINEDTEXT carries (the catalog's `textId`). */
export interface FightTexts {
  attackSpeed: NumberedText;
  priorityMob: NumberedText;
}

const f32 = Math.fround;

/**
 * The EXP the world server gives a character of `level` for `monster` (a `WebMover`'s `level` and `expValue`) that it
 * killed alone, every blow its own; `ratePercent` is the monster's EXP rate in the MONSTERPROP the server sent (100 when
 * none named it):
 * - `CMover::SubExperience` (`_Common/Mover.cpp:5992-6022`, `__S1108_BACK_END_SYSTEM` on, :6006): `nExpValue` times
 *   `m_fExp_Rate`, a `float` of the rate / 100 (`CDPDatabaseClient`, `WORLDSERVER/DPDatabaseClient.cpp:1879`; 1 by
 *   default, :1908);
 * - `AddExperienceKillMember` (:6085-6166): the killer's share of the blows, all of them here, as a `float` (:6138);
 * - `AddExperienceSolo` (:6170-6254): times 0.7f for a killer 1 or 2 levels above the monster, 0.4f for 3 or 4, 0.1f for
 *   more (:6198-6216), then cut to a whole number (`static_cast<EXPINTEGER>`, :6245).
 * Left out: the level's `nLimitExp` cap (:6221; 16 to 170 for levels 1 to 15 in `expTable.inc`, above any Small Aibatt's
 * EXP), the Valentine's event's 1.5 (`EVE_EVENT0214`, :6172) and the PC-bang factor.
 */
export function soloKillExp(level: number, monster: { level: number; expValue: number }, ratePercent = 100): number {
  const rate = f32(f32(ratePercent) / 100);
  let exp = f32(monster.expValue * rate);
  const above = level - monster.level;
  if (above === 1 || above === 2) exp *= f32(0.7);
  else if (above === 3 || above === 4) exp *= f32(0.4);
  else if (above > 4) exp *= f32(0.1);
  return Math.trunc(exp);
}

/**
 * What is wrong with the EXP after a kill, or null: `before` and `after` are the own level and EXP, `expected` what the
 * rule gives (`soloKillExp`). With the level unchanged the EXP must have risen by exactly that, nothing where it gives
 * nothing; a level up is right only where it gives some.
 */
export function killExpProblem(
  before: { level: number; exp: bigint }, after: { level: number; exp: bigint }, expected: number,
): string | null {
  if (after.level > before.level && expected > 0) return null;
  const gain = after.level === before.level ? after.exp - before.exp : null;
  if (gain === BigInt(expected)) return null;
  const came = gain === null ? `took the character from level ${before.level} to level ${after.level}` : `gave ${gain} EXP`;
  return `the kill ${came}, where the world server's rule for a level ${before.level} character and a Small Aibatt gives ${expected} `
    + '(its 2 EXP times 0.7 for 1 or 2 levels above it, 0.4 for 3 or 4, 0.1 for more, cut to a whole number: '
    + "CMover::AddExperienceSolo). A server running an EXP event, or with the Aibatts' EXP rate changed, gives more.";
}

/** The text `id` of the texts catalog with the number DEFINEDTEXT names it by; throws when the catalog has no number. */
export function numberedText(data: Pick<GameData, 'texts'>, id: string): NumberedText {
  const entry = data.texts.get(id);
  if (entry?.textId === undefined) {
    throw new Error(`the texts catalog has no number for ${id}: the converted game files are older than the texts' numbers (npm run convert)`);
  }
  return { textId: entry.textId, text: entry.text };
}

export function fightTexts(data: GameData): FightTexts {
  return { attackSpeed: numberedText(data, 'TID_GAME_MODIFY_ATTACK_SPEED'), priorityMob: numberedText(data, 'TID_GAME_PRIORITYMOB') };
}

/** The texts of the DEFINEDTEXTs among `seen`, as the catalog has them (by their numbers), for a failure message. */
function textsSaid(data: Pick<GameData, 'texts'>, seen: readonly { event: CombatEvent }[]): string[] {
  const said: string[] = [];
  for (const { event } of seen) {
    if (event.kind !== 'text') continue;
    const entry = [...data.texts.entries()].find(([, text]) => text.textId === event.textId);
    said.push(entry === undefined ? `text number ${event.textId}` : `${entry[0]} "${entry[1].text}"`);
  }
  return said;
}

/**
 * Walks `player` to each point of `route` in turn as a tap on the land there does (`Player.tap`: `SetDestPos`,
 * `m_nCorr` -1 and the client SNAPSHOT with DESTPOS, `OwnMover`), the next once it stands; fails where a walk ended
 * short: where it met something or began to fall (it ends there, with a PLAYERCORR), or more than 1 m from its point.
 */
export async function walkRoute(
  ctx: FightContext, player: FightPlayer, route: readonly (readonly [number, number])[], what: string,
): Promise<void> {
  const own = player.world?.self();
  if (own === undefined) throw new Error(`the ${player.role}'s own character is not among its movers in view: ${player.inView()}`);
  for (const [x, z] of route) {
    const point: Vec3 = [x, ctx.heightAt(x, z) ?? own.act.body.pos[1], z];
    const corrBefore = player.sentCorr.length;
    const destsBefore = player.sentDestPos.length;
    player.tap = point;
    await pollUntil(
      ctx.check,
      `the walk ${what} to (${x}, ${z})`,
      (apart(own.act.body.pos, point) / WALK_M_PER_S) * 1000 + LEG_SPARE_MS,
      () => player.sentDestPos.length > destsBefore && stands(own),
      () => `The walker is ${stateText(own)}, ${apart(own.act.body.pos, point).toFixed(2)} m from the point.`,
    );
    const met = player.sentCorr.length - corrBefore;
    const off = apart(own.act.body.pos, point);
    if (met > 0 || off > ARRIVED_WITHIN_M) {
      throw new Error(
        `the walk ${what} to (${x}, ${z}) ended ${off.toFixed(2)} m from it, the walker ${stateText(own)}${met > 0 ? ', where it met something or began to fall (PLAYERCORR)' : ''}. `
        + `The way to the Aibatts begins where new characters start, beside Flaris's lodestar (${TO_THE_AIBATTS[0]!.join(', ')}): a character that stands elsewhere in town may find something in its way there. `
        + 'Use an account with no character (the test makes one), or bring the character there.',
      );
    }
  }
}

/**
 * The Small Aibatt in `player`'s view nearest it (D3D x and z) that the attack takes (`attackAble`: alive, killable, not
 * peaceful, on the ground), other than those in `skip`; waits for one to come into view. Only `MI_AIBATT1`: never a
 * giant (Ruling R30).
 */
export async function nearestSmallAibatt(ctx: FightContext, player: FightPlayer, skip: ReadonlySet<number>): Promise<Mover> {
  const own = player.world!.self()!;
  const nearest = (): Mover | undefined => {
    let found: Mover | undefined;
    let best = Infinity;
    for (const mover of player.world!.movers.values()) {
      if (mover.kind !== 'monster' || mover.added.index !== MI_AIBATT1 || skip.has(mover.objectId)) continue;
      if (!attackAble(mover, ctx.data.movers)) continue;
      const distance = apart(mover.act.body.pos, own.act.body.pos);
      if (distance < best) {
        best = distance;
        found = mover;
      }
    }
    return found;
  };
  const picked: { mover?: Mover } = {};
  await pollUntil(
    ctx.check,
    'a Small Aibatt in view',
    AIBATT_WAIT_MS,
    () => (picked.mover = nearest()) !== undefined,
    () => `${player.inView()}. Small Aibatts (MI_AIBATT1) live on the field north of Flaris's north gate, around (${TO_THE_AIBATTS.at(-1)!.join(', ')}); one that dies comes back within 30 s.`,
  );
  return picked.mover!;
}

/** Where the counts of a fight start: the lengths of the player's lists as the attack began. */
interface FightMarks {
  swings: number;
  seen: number;
  corr: number;
  destObj: number;
}

/** How the fight with `target` stands, for a failure message. */
function fightText(player: FightPlayer, target: Mover, from: FightMarks): string {
  const self = player.world?.self();
  const swings = player.sentSwings.length - from.swings;
  const hits = player.combatSeen.slice(from.seen).filter(({ event }) => (
    event.kind === 'hit' && event.victimId === target.objectId && event.attackerId === self?.objectId
  )).length;
  const stats = player.session?.stats;
  const where = self === undefined ? 'not in view' : `${stateText(self)}, ${apart(self.act.body.pos, target.act.body.pos).toFixed(2)} m from it with ${self.hp} HP`;
  return `Since the attack began: ${player.sentDestObj.length - from.destObj} PLAYERSETDESTOBJ, ${swings} MELEE_ATTACK, ${hits} DAMAGE from the walker on it, `
    + `${player.sentCorr.length - from.corr} PLAYERCORR (the walk up to it met something). The walker is ${where}; the Small Aibatt is `
    + `${stateText(target)} with ${target.hp} HP. ${stats?.mismatched ?? 0} messages misread so far.`
    + (player.viewProblems.size === 0 ? '' : ` The views could not load: ${[...player.viewProblems].join('; ')}.`);
}

/**
 * Attacks `target` as a player on a touch screen does: a tap on it (the focus, SETTARGET), then the attack button (the
 * auto-attack), and from there the attack loop walks up to it and swings, every rules step, until it dies. Ends
 * `'killed'` at its MOVERDEATH by the walker, and `'priorityMob'` at a TID_GAME_PRIORITYMOB (another player fights it:
 * `CMover::IsSteal`, `_Common/Mover.cpp:7010-7052`). Fails at a TID_GAME_MODIFY_ATTACK_SPEED (`CDPSrvr::OnMeleeAttack`,
 * `WORLDSERVER/DPSrvr.cpp:2040-2045`: the MELEE_ATTACK's speed is not the held item's `fAttackSpeed`); at a swing whose
 * DAMAGE does not come within 3 s (every swing the server takes has one, a miss's too, the killing one the MOVERDEATH);
 * and when the Aibatt has not died within 60 s, is killed by another, leaves the view alive, or the walker dies (the
 * test then revives it: `reviveIfDead`).
 */
export async function fight(
  ctx: FightContext, player: FightPlayer, target: Mover, texts: FightTexts,
): Promise<'killed' | 'priorityMob'> {
  const self = player.world!.self()!;
  const from: FightMarks = {
    swings: player.sentSwings.length, seen: player.combatSeen.length, corr: player.sentCorr.length, destObj: player.sentDestObj.length,
  };
  const state = (): string => fightText(player, target, from);
  player.pressMover(target.objectId);
  // the attack button is enabled while the focus is a mover the attack takes (`WorldScreen.drawHud`)
  if (player.focusId !== target.objectId || !player.canAttackFocus) {
    throw new Error(`the tap on the Small Aibatt ${target.objectId} did not make it a target the attack takes (the focus is ${player.focusId}). ${state()}`);
  }
  player.pressAttack();
  const deadline = performance.now() + FIGHT_MS;
  for (;;) {
    ctx.check();
    const seen = player.combatSeen.slice(from.seen);
    for (const { event } of seen) {
      if (event.kind === 'text' && event.textId === texts.attackSpeed.textId) {
        throw new Error(`the world server refused a MELEE_ATTACK with TID_GAME_MODIFY_ATTACK_SPEED ("${texts.attackSpeed.text}"): the speed it carries (${player.own?.attackSpeed()}) is not the held item's fAttackSpeed to the server. ${state()}`);
      }
      if (event.kind === 'text' && event.textId === texts.priorityMob.textId) return 'priorityMob';
      if (event.kind === 'death' && event.victimId === target.objectId) {
        if (event.attackerId !== self.objectId) throw new Error(`the Small Aibatt ${target.objectId} was killed by ${event.attackerId}, not by the walker. ${state()}`);
        return 'killed';
      }
    }
    if (isDie(self)) throw new Error(`the walker died in the fight. ${state()}`);
    // the swings at it in order, and the DAMAGEs from the walker on it: the next one owed is that of the first swing not answered yet
    const swings = player.sentSwings.slice(from.swings).filter((swing) => swing.targetId === target.objectId);
    const answered = seen.filter(({ event }) => event.kind === 'hit' && event.victimId === target.objectId && event.attackerId === self.objectId).length;
    const owed = swings[answered];
    if (owed !== undefined && performance.now() - owed.at > DAMAGE_WAIT_MS) {
      throw new Error(`swing ${answered + 1} at the Small Aibatt (its MELEE_ATTACK) got no DAMAGE within ${DAMAGE_WAIT_MS / 1000} s. ${state()}`);
    }
    if (!player.world!.movers.has(target.objectId)) throw new Error(`the Small Aibatt ${target.objectId} left the walker's view alive. ${state()}`);
    if (performance.now() > deadline) throw new Error(`the Small Aibatt ${target.objectId} did not die within ${FIGHT_MS / 1000} s. ${state()}`);
    await sleep(20);
  }
}

/**
 * Kills the Small Aibatt nearest the walker (`fight`); after a TID_GAME_PRIORITYMOB, Escape (as a player gives a target
 * up) and once more with the nearest other one.
 */
export async function killSmallAibatt(ctx: FightContext, player: FightPlayer, texts: FightTexts): Promise<void> {
  const tried = new Set<number>();
  for (;;) {
    const target = await nearestSmallAibatt(ctx, player, tried);
    tried.add(target.objectId);
    if (await fight(ctx, player, target, texts) === 'killed') return;
    if (tried.size >= 2) {
      throw new Error(`a second Small Aibatt (${target.objectId}) was refused with TID_GAME_PRIORITYMOB ("${texts.priorityMob.text}") too: another player fights the Aibatts here.`);
    }
    player.giveUpTarget();
  }
}

// ---- The skill part ------------------------------------------------------------------------------------------------

/** `SI_VAG_ONE_CLEANHIT` (`Resource/defineSkill.h:19`): the skill the skill part raises and uses, open from level 3. */
export const SI_VAG_ONE_CLEANHIT = 1;
/** Where the skill part puts Clean Hit: the first bar (0), its fourth slot (3), which F4 uses. */
export const SKILL_BAR = 0;
export const SKILL_SLOT = 3;
/**
 * The world server answers a USESKILL as it reads it (`CDPSrvr::OnUseSkill`, `WORLDSERVER/DPSrvrLux.cpp:32-99`: USESKILL
 * to everyone around, or CLEAR_USESKILL), and a DOUSESKILLPOINT likewise (`CDPSrvr::OnDoUseSkillPoint`,
 * `WORLDSERVER/DPSrvr.cpp:1104-1163`: DOUSESKILLPOINT, TID_RESKILLPOINT_ERROR, or nothing for a spend that changes no
 * level); the client gives either up after 2 s (spec §3.11). These are the safety nets.
 */
export const SKILL_ANSWER_MS = 3000;
export const SPEND_WAIT_MS = 5000;

/**
 * What the skill part does with the character `own`, named `name`:
 * - with a skill point left and Clean Hit below its top level (10, `dwExpertMax`), it spends one on Clean Hit: `spend`, a
 *   copy of its skills with Clean Hit one level up, as the skill window's + makes it (`SkillPlan.plus`,
 *   `CWndSkillTreeEx::OnChildNotify`, `WndField.cpp:8057-8072`), the 45 slots that Finish then sends;
 * - otherwise, with Clean Hit learned, it spends nothing (`spend` null) and says so in one line (`note`), and uses Clean
 *   Hit at the level it has;
 * - below the level Clean Hit opens at (3, `dwReqDisLV`), or with Clean Hit not learned and no point to learn it (or no
 *   Clean Hit at all), the whole part is skipped, with one sentence (`skip`).
 * `index` is Clean Hit's slot.
 */
export function skillLegPlan(
  own: Pick<OwnState, 'level' | 'skills' | 'skillPoint'>, catalog: ReadonlyMap<number, WebSkill>, name: string,
): { index: number; spend: SkillSlot[] | null; note: string | null } | { skip: string } {
  const skill = catalog.get(SI_VAG_ONE_CLEANHIT);
  if (skill === undefined) {
    throw new Error('the skills catalog has no Clean Hit: the converted game files are older than the skills (npm run convert)');
  }
  const skipped = (why: string): { skip: string } => ({
    skip: `Skipped: ${name} ${why}, and the skill part needs a character of level ${skill.reqLevel} or higher with Clean Hit `
      + 'learned or a skill point to learn it (the comment at the top of live.config.example.json says more).',
  });
  const index = own.skills.findIndex((slot) => slot.skill === SI_VAG_ONE_CLEANHIT);
  if (index < 0) return skipped('has no Clean Hit among its skills');
  if (own.level < skill.reqLevel) return skipped(`is level ${own.level}`);
  const level = own.skills[index]!.level;
  const plan = new SkillPlan(own.skills, own.skillPoint, catalog, own.level);
  if (plan.plus(index)) return { index, spend: plan.result(), note: null };
  if (level <= 0) return skipped('has not learned Clean Hit and has no skill point to learn it');
  const why = level >= skill.maxLevel ? `has Clean Hit at its top level (${skill.maxLevel})` : 'has none left';
  return { index, spend: null, note: `The skill part spends no skill point this run: ${name} ${why}. It uses Clean Hit at level ${level}.` };
}

/** What the skill part reads of the test's player besides the fight's, and presses on it (`Player` in world.live.test.ts). */
export interface SkillPlayer extends FightPlayer {
  /** The skill messages (USESKILL, CLEAR_USESKILL, DOUSESKILLPOINT, ENDSKILLQUEUE) since the player entered, with when and about whom. */
  readonly skillSeen: readonly { at: number; objectId: number; message: WorldMessage }[];
  /** The USESKILLs the skill use sent since the player entered, with when. */
  readonly sentUseSkill: readonly { at: number; index: number; targetId: number; useType: number }[];
  /** A press on the bar's slot that holds `shortcut` (F4 on the world screen: `SkillUse.useShortcut`). */
  pressShortcut(shortcut: Shortcut): void;
}

/** How the skill's use on `target` stands, for a failure message. */
function skillText(
  data: Pick<GameData, 'texts'>, player: SkillPlayer, target: Mover, from: { seen: number; uses: number; destObj: number },
): string {
  const self = player.world?.self();
  const where = self === undefined ? 'not in view' : `${stateText(self)}, ${apart(self.act.body.pos, target.act.body.pos).toFixed(2)} m from it with ${self.hp} HP`;
  const said = textsSaid(data, player.combatSeen.slice(from.seen));
  return `Since the press on F4: ${player.sentDestObj.length - from.destObj} PLAYERSETDESTOBJ, ${player.sentUseSkill.length - from.uses} USESKILL. `
    + `The walker is ${where}; the Small Aibatt is ${stateText(target)} with ${target.hp} HP.`
    + (said.length === 0 ? '' : ` The server said: ${said.join('; ')}.`)
    + (player.viewProblems.size === 0 ? '' : ` The views could not load: ${[...player.viewProblems].join('; ')}.`);
}

/**
 * Uses the skill of the bar's `shortcut` (Clean Hit on F4) on `target`, as a player on the world screen does: a tap on it
 * (the focus, SETTARGET), then F4; from there the skill use walks up to it (PLAYERSETDESTOBJ, `AR_SHORT`) and on arriving
 * sends USESKILL (`SkillUse`), and the world server, as it begins the skill, sends USESKILL back. Ends `'hit'` at the
 * walker's DAMAGE on it with `AF_MELEESKILL` (the skill's blow: `CMover::OnMeleeSkill` → `ApplySkill` → `SendDamage(
 * AF_MELEESKILL, ... )` on the server); `'killed'` when that blow killed it, its MOVERDEATH by the walker coming in place of
 * the DAMAGE (`CAttackArbiter::OnDamageMsgW`, `WORLDSERVER/AttackArbiter.cpp:228-255`); `'priorityMob'` at a
 * TID_GAME_PRIORITYMOB (another player fights it). Fails when no USESKILL went within the walk up, when the server did not
 * answer it within 3 s or refused it (CLEAR_USESKILL, with what it said), when the DAMAGE did not come within 3 s of the
 * answer, and when the walker dies, or the Aibatt leaves the view or is killed by another.
 */
export async function useSkillOn(
  ctx: FightContext, player: SkillPlayer, target: Mover, texts: FightTexts, shortcut: Shortcut,
): Promise<'hit' | 'killed' | 'priorityMob'> {
  const self = player.world!.self()!;
  const from = {
    seen: player.combatSeen.length, skills: player.skillSeen.length, uses: player.sentUseSkill.length,
    destObj: player.sentDestObj.length,
  };
  const state = (): string => skillText(ctx.data, player, target, from);
  player.pressMover(target.objectId);
  if (player.focusId !== target.objectId) {
    throw new Error(`the tap on the Small Aibatt ${target.objectId} did not select it (the focus is ${player.focusId}). ${state()}`);
  }
  player.pressShortcut(shortcut);
  const pressedAt = performance.now();
  // the walk up to it, at a walk, as each leg of the way out gets
  const walkMs = (apart(self.act.body.pos, target.act.body.pos) / WALK_M_PER_S) * 1000 + LEG_SPARE_MS;
  for (;;) {
    ctx.check();
    for (const { event } of player.combatSeen.slice(from.seen)) {
      if (event.kind === 'text' && event.textId === texts.priorityMob.textId) return 'priorityMob';
      if (event.kind === 'hit' && event.victimId === target.objectId && event.attackerId === self.objectId
        && (event.flags & AttackFlag.MELEESKILL) !== 0) {
        return 'hit';
      }
      if (event.kind === 'death' && event.victimId === target.objectId) {
        if (event.attackerId !== self.objectId) throw new Error(`the Small Aibatt ${target.objectId} was killed by ${event.attackerId}, not by the walker. ${state()}`);
        return 'killed';
      }
    }
    let answeredAt: number | null = null;
    for (const { at, objectId, message } of player.skillSeen.slice(from.skills)) {
      if (objectId !== self.objectId) continue;
      if (message.type === 'clearUseSkill') throw new Error(`the world server refused Clean Hit (CLEAR_USESKILL). ${state()}`);
      if (message.type === 'useSkill') answeredAt ??= at;
    }
    const now = performance.now();
    const sent = player.sentUseSkill[from.uses];
    if (isDie(self)) throw new Error(`the walker died while it used Clean Hit. ${state()}`);
    if (!player.world!.movers.has(target.objectId)) throw new Error(`the Small Aibatt ${target.objectId} left the walker's view alive. ${state()}`);
    if (sent === undefined && now - pressedAt > walkMs) {
      throw new Error(`the walker sent no USESKILL within ${Math.round(walkMs / 1000)} s of the press on F4: the walk up to the Aibatt did not end in range, or something stood between them. ${state()}`);
    }
    if (sent !== undefined && answeredAt === null && now - sent.at > SKILL_ANSWER_MS) {
      throw new Error(`the world server did not answer the walker's USESKILL (skill slot ${sent.index}, at ${sent.targetId}) within ${SKILL_ANSWER_MS / 1000} s: it drops one for an empty slot or a level of 0 without a word. ${state()}`);
    }
    if (answeredAt !== null && now - answeredAt > DAMAGE_WAIT_MS) {
      throw new Error(`the server began Clean Hit (its USESKILL came) but no DAMAGE with AF_MELEESKILL from the walker on the Aibatt came within ${DAMAGE_WAIT_MS / 1000} s. ${state()}`);
    }
    await sleep(20);
  }
}

/**
 * The skill part on the field: Clean Hit (the bar's `shortcut`) on the nearest Small Aibatt (`useSkillOn`); once its blow
 * has landed, the auto-attack that a skill's use turns on (`OnUseSkill`) finishes it (`fight`), so that no Aibatt left
 * alive follows the walker back. After a TID_GAME_PRIORITYMOB, or a blow that killed it outright (which leaves no DAMAGE
 * to check), Escape and once more on the nearest other one.
 */
export async function skillOnSmallAibatt(ctx: FightContext, player: SkillPlayer, texts: FightTexts, shortcut: Shortcut): Promise<void> {
  const tried = new Set<number>();
  for (;;) {
    const target = await nearestSmallAibatt(ctx, player, tried);
    tried.add(target.objectId);
    const result = await useSkillOn(ctx, player, target, texts, shortcut);
    if (result === 'hit') {
      // another player who took it over in the meantime leaves it to them
      if (await fight(ctx, player, target, texts) === 'priorityMob') player.giveUpTarget();
      return;
    }
    if (tried.size >= 2) {
      throw new Error(result === 'killed'
        ? `Clean Hit killed a second Small Aibatt (${target.objectId}) at its first blow, so no DAMAGE of it came to check: other players may be hurting the Aibatts here.`
        : `a second Small Aibatt (${target.objectId}) was refused with TID_GAME_PRIORITYMOB ("${texts.priorityMob.text}") too: another player fights the Aibatts here.`);
    }
    player.giveUpTarget();
  }
}

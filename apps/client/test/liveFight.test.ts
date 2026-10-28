import { describe, expect, it, vi } from 'vitest';
import { AttackFlag, NULL_ID } from '@flyffweb/protocol';
import type { InventoryItem, Shortcut, SkillSlot } from '@flyffweb/protocol';
import { ServerClock } from '../src/net/serverClock';
import { terrainGround } from '../src/world/sim/collision';
import { WorldState } from '../src/world/WorldState';
import type { CombatEvent } from '../src/world/WorldState';
import {
  MI_AIBATT1, TO_THE_AIBATTS, attackSpeedRefusals, blowCounts, fight, fightText, foodProblem, killExpLine, killSmallAibatt,
  leftOutsideNote, resumeRoute, reviveIfDead, skillLegPlan, skillOnSmallAibatt, soloKillExp, untouchable, useSkillOn,
} from './helpers/liveFight';
import type { FightContext, FightPlayer, FightTexts, SkillPlayer } from './helpers/liveFight';
import { addedNpc, addedPlayer, gameDataOf, moverFrom, webMoverOf } from './helpers/movers';
import { vagrantSkills } from './helpers/skills';

/** An inventory of `[itemId, count]` slots, as the own ADD_OBJ lists it. */
const bag = (...slots: [number, number][]): { inventory: Map<number, InventoryItem>; inventoryError: null } => ({
  inventory: new Map(slots.map(([itemId, count], objectId) => [objectId, { objectId, itemId, count }])),
  inventoryError: null,
});

/** The own mover standing at D3D (x, z), alive or not. */
function ownAt(x: number, z: number, alive = true) {
  const own = moverFrom(addedPlayer(1, { self: true }, { pos: [x, 100, z] }));
  if (!alive) own.hp = 0;
  return own;
}

describe('the live fight: the starter food', () => {
  it("expects a character the test made to carry exactly a new character's food: 3 of 2800 and 1 of 2801", () => {
    expect(foodProblem(bag([502, 1], [2801, 1], [2800, 3]), true)).toBeNull();
    // counted over the slots
    expect(foodProblem(bag([2800, 2], [2801, 1], [2800, 1]), true)).toBeNull();
    expect(foodProblem(bag([2800, 2], [2801, 1]), true)).toMatch(/2 of item 2800, not 3/);
    expect(foodProblem(bag([2800, 3], [2801, 1], [2801, 1]), true)).toMatch(/2 of item 2801, not 1/);
  });

  it("expects only some of each from a character the test did not make", () => {
    expect(foodProblem(bag([2800, 5], [2801, 2]), false)).toBeNull();
    expect(foodProblem(bag([2800, 1]), false)).toMatch(/no item 2801.*starter food/);
  });

  it('names an inventory that could not be read', () => {
    expect(foodProblem({ inventory: null, inventoryError: 'cut short' }, false)).toMatch(/could not be read.*cut short/);
  });
});

describe('the live fight: the way back into Flaris', () => {
  const [begin, , , bridge, spot] = TO_THE_AIBATTS;

  it('walks nothing back from the begin point or nearer it than any other point', () => {
    expect(resumeRoute([6972, 100, 3311])).toEqual([]);
    expect(resumeRoute([begin![0], 100, begin![1]])).toEqual([]);
  });

  it('walks back from the point the walker stands nearest, through every point before it', () => {
    expect(resumeRoute([7038, 100, 3428])).toEqual([...TO_THE_AIBATTS].reverse());
    // past the gate, nearer the bridge's end than the gate's inside
    expect(resumeRoute([6961, 100, 3390])).toEqual(TO_THE_AIBATTS.slice(0, 4).reverse());
    expect(resumeRoute([spot![0], 100, spot![1]])[0]).toEqual(spot);
    expect(resumeRoute([bridge![0], 100, bridge![1]])).toHaveLength(4);
  });

  it('says where a living character was left outside, and what to do', () => {
    const note = leftOutsideNote(false, ownAt(7040.4, 3429.6));
    expect(note).toMatch(/left outside Flaris at \(7040, 3430\)/);
    expect(note).toMatch(/north gate/);
    expect(note).toMatch(/lodestar/);
  });

  it("says nothing of a character in town, a dead one (it revives at a lodestar), the test's own, or none", () => {
    expect(leftOutsideNote(false, ownAt(6972, 3311))).toBeNull();
    expect(leftOutsideNote(false, ownAt(7040, 3430, false))).toBeNull();
    expect(leftOutsideNote(true, ownAt(7040, 3430))).toBeNull();
    expect(leftOutsideNote(false, undefined)).toBeNull();
  });
});

describe('the live fight: a death and the texts', () => {
  /** A player whose own mover is `own`, with a session that counts the revivals asked for. */
  function playerWith(own: ReturnType<typeof ownAt>, playing = true) {
    const sendRevivalToLodestar = vi.fn();
    const player = {
      playing, world: { self: () => own }, session: { sendRevivalToLodestar },
    } as unknown as FightPlayer;
    return { player, sendRevivalToLodestar };
  }

  it('revives a dead walker at the lodestar, as the revive window does, and only a dead one in the world', () => {
    const dead = playerWith(ownAt(7040, 3430, false));
    expect(reviveIfDead(dead.player)).toBe(true);
    expect(dead.sendRevivalToLodestar).toHaveBeenCalledTimes(1);
    const alive = playerWith(ownAt(7040, 3430));
    expect(reviveIfDead(alive.player)).toBe(false);
    expect(alive.sendRevivalToLodestar).not.toHaveBeenCalled();
    const gone = playerWith(ownAt(7040, 3430, false), false);
    expect(reviveIfDead(gone.player)).toBe(false);
    expect(gone.sendRevivalToLodestar).not.toHaveBeenCalled();
  });

  it('counts the texts of a number among what the world played', () => {
    const seen: { at: number; event: CombatEvent }[] = [
      { at: 1, event: { kind: 'text', textId: 3456, args: null } },
      { at: 2, event: { kind: 'hit', victimId: 2, attackerId: 1, hit: 5, flags: 1, attackerInView: true } },
      { at: 3, event: { kind: 'text', textId: 655, args: '' } },
      { at: 4, event: { kind: 'text', textId: 3456, args: null } },
    ];
    expect(attackSpeedRefusals(seen, 3456)).toBe(2);
    expect(attackSpeedRefusals(seen.slice(1, 3), 3456)).toBe(0);
  });
});

describe('the live fight: the EXP of the kill', () => {
  /** `MI_AIBATT1` (propMover.txt): level 1, `nExpValue` 2. */
  const SMALL_AIBATT = { level: 1, expValue: 2 };

  it("gives what CMover::AddExperienceSolo gives a Small Aibatt's killer: 2 at level 1, 1 at levels 2 and 3, none from level 4", () => {
    expect([1, 2, 3, 4, 5, 6, 14, 15].map((level) => soloKillExp(level, SMALL_AIBATT))).toEqual([2, 1, 1, 0, 0, 0, 0, 0]);
    // a monster of the killer's level or above gives its EXP whole
    expect(soloKillExp(3, { level: 5, expValue: 7 })).toBe(7);
  });

  it("takes the monster's EXP rate the server sent (MONSTERPROP, in percent) before the level gap", () => {
    // 2 x 2 = 4, times 0.4 for 3 levels above it: 1.6, cut to 1
    expect(soloKillExp(4, SMALL_AIBATT, 200)).toBe(1);
    expect(soloKillExp(1, SMALL_AIBATT, 50)).toBe(1);
    expect(soloKillExp(3, SMALL_AIBATT, 100)).toBe(1);
  });

  it('says in one line the EXP the kill gave and what the base rule gives, the same', () => {
    expect(killExpLine({ level: 2, exp: 5n }, { level: 2, exp: 6n }, 1))
      .toBe('The kill gave 1 EXP; the base rule for a level 2 character and a Small Aibatt gives 1.');
    expect(killExpLine({ level: 5, exp: 40n }, { level: 5, exp: 40n }, 0))
      .toBe('The kill gave 0 EXP; the base rule for a level 5 character and a Small Aibatt gives 0.');
    expect(killExpLine({ level: 1, exp: 13n }, { level: 2, exp: 1n }, 2))
      .toBe('The kill gave a level up (level 1 to 2); the base rule for a level 1 character and a Small Aibatt gives 2.');
  });

  it('says that a server-wide EXP rate or an EXP event explains a difference, which fails nothing', () => {
    const line = killExpLine({ level: 5, exp: 40n }, { level: 5, exp: 43n }, 0);
    expect(line).toBe('The kill gave 3 EXP; the base rule for a level 5 character and a Small Aibatt gives 0. '
      + "A server-wide EXP rate or an EXP event explains the difference (CMover::GetExpFactor); it is not a failure.");
    expect(line.split('\n')).toHaveLength(1);
    // a level up where the rule gives none is a difference too
    expect(killExpLine({ level: 5, exp: 40n }, { level: 6, exp: 0n }, 0)).toMatch(/level up \(level 5 to 6\).*gives 0\. A server-wide/);
  });
});

describe('the live skill part: its choices', () => {
  /** A Vagrant's 45 skill slots (Clean Hit, Flurry and Over Cut in slots 0-2) with Clean Hit at `cleanHit`. */
  const skills = (cleanHit: number): SkillSlot[] => Array.from({ length: 45 }, (_, i) =>
    (i === 0 ? { skill: 1, level: cleanHit } : i < 3 ? { skill: i + 1, level: 0 } : { skill: NULL_ID, level: 0 }));
  const planOf = (level: number, cleanHit: number, skillPoint: number) =>
    skillLegPlan({ level, skills: skills(cleanHit), skillPoint }, vagrantSkills(), 'WebWalk1');

  it('spends a point on Clean Hit when one is left and Clean Hit is below its top level, as the skill window would send it', () => {
    const own = { level: 3, skills: skills(0), skillPoint: 4 };
    expect(skillLegPlan(own, vagrantSkills(), 'WebWalk1')).toEqual({ index: 0, spend: skills(1), note: null });
    expect(planOf(9, 4, 1)).toEqual({ index: 0, spend: skills(5), note: null });
    // the character's own slots are left as they were
    expect(own.skills).toEqual(skills(0));
  });

  it('skips only the spend, with one line, when no point is left or Clean Hit is at its top level, and uses Clean Hit still', () => {
    const noPoint = planOf(3, 2, 0);
    expect(noPoint).toMatchObject({ index: 0, spend: null });
    expect('note' in noPoint && noPoint.note).toBe(
      'The skill part spends no skill point this run: WebWalk1 has none left. It uses Clean Hit at level 2.');
    const top = planOf(14, 10, 5);
    expect(top).toMatchObject({ index: 0, spend: null });
    expect('note' in top && top.note).toBe(
      'The skill part spends no skill point this run: WebWalk1 has Clean Hit at its top level (10). It uses Clean Hit at level 10.');
  });

  it('is skipped whole, with one sentence naming the character and why, below level 3 or with Clean Hit at 0 and no point', () => {
    const skipOf = (plan: ReturnType<typeof planOf>): string => {
      if (!('skip' in plan)) throw new Error('not skipped');
      return plan.skip;
    };
    const atLevel2 = skipOf(planOf(2, 0, 2));
    expect(atLevel2).toMatch(/^Skipped: WebWalk1 is level 2, and the skill part needs a character of level 3 or higher with Clean Hit learned or a skill point to learn it/);
    expect(atLevel2.split('. ').length).toBe(1);
    expect(skipOf(planOf(3, 0, 0))).toMatch(/^Skipped: WebWalk1 has not learned Clean Hit and has no skill point to learn it, and /);
    const none = Array.from({ length: 45 }, () => ({ skill: NULL_ID, level: 0 }));
    expect(skipOf(skillLegPlan({ level: 3, skills: none, skillPoint: 4 }, vagrantSkills(), 'WebWalk1')))
      .toMatch(/WebWalk1 has no Clean Hit among its skills/);
  });

  it('says to convert the game files again when the skills catalog has no Clean Hit', () => {
    expect(() => skillLegPlan({ level: 3, skills: skills(0), skillPoint: 4 }, new Map(), 'WebWalk1')).toThrow(/npm run convert/);
  });
});

// ---- What the blows did, and an Aibatt that the server makes untouchable ----------------------------------------------

const SELF_ID = 1;
const TEXTS: FightTexts = { attackSpeed: { textId: 3456, text: 'speed' }, priorityMob: { textId: 777, text: 'busy' } };
type Seen = { at: number; event: CombatEvent };

/** A DAMAGE on `victimId`, from the walker unless `attackerId` says otherwise. */
const damage = (victimId: number, flags: number, hit: number, attackerId = SELF_ID): Seen => ({
  at: 0, event: { kind: 'hit', victimId, attackerId, hit, flags, attackerInView: true },
});
/** A blow answered with AF_MISS: a plain miss carries 0, one at a monster on its way back to its spawn point 1 (`max( nDamage, 1 )`). */
const missed = (victimId: number, hit = 0): Seen => damage(victimId, AttackFlag.MISS, hit);
const landed = (victimId: number, hit = 5): Seen => damage(victimId, AttackFlag.GENERIC, hit);
const died = (victimId: number, attackerId = SELF_ID): Seen => ({
  at: 0, event: { kind: 'death', victimId, attackerId, lastHp: 1, attackerInView: true },
});
const said = (textId: number): Seen => ({ at: 0, event: { kind: 'text', textId, args: null } });
const times = (n: number, make: () => Seen): Seen[] => Array.from({ length: n }, make);

type Push = (...events: Seen[]) => void;

/**
 * A walker at (100, 100) with one Small Aibatt per id, 5 m apart eastwards of it (the first the nearest). Each press on the
 * attack button hands `answers` the focus and a `push` for the events the server sends in answer, now or later; each
 * press on the skill's shortcut likewise `skillAnswers`, after a USESKILL of its own.
 */
function fakeWalker(
  aibatts: readonly number[], answers: (targetId: number, push: Push) => void,
  skillAnswers: (targetId: number, push: Push) => void = () => {},
) {
  const data = gameDataOf({ movers: new Map([[MI_AIBATT1, webMoverOf({ index: MI_AIBATT1, name: 'Small Aibatt', killable: 1, addHp: 120 })]]) });
  const world = new WorldState(data, new ServerClock(() => 0), terrainGround(() => 0));
  world.apply(SELF_ID, { type: 'addMover', mover: addedPlayer(SELF_ID, { self: true }, { pos: [100, 100, 100] }) });
  aibatts.forEach((id, i) => world.apply(id, { type: 'addMover', mover: addedNpc(id, MI_AIBATT1, {}, { pos: [105 + 5 * i, 100, 100] }) }));
  const combatSeen: Seen[] = [];
  const push: Push = (...events) => { combatSeen.push(...events); };
  const log = { pressed: [] as number[], attacks: [] as number[], skills: [] as number[], giveUps: 0 };
  const sentUseSkill: { at: number; index: number; targetId: number; useType: number }[] = [];
  const skillSeen: { at: number; objectId: number; message: unknown }[] = [];
  const walker = {
    role: 'walker', playing: true, world, session: undefined, own: undefined, tap: null,
    sentDestPos: [], sentCorr: [], sentDestObj: [], sentSwings: [], combatSeen, viewProblems: new Set<string>(),
    sentUseSkill, skillSeen,
    focusId: null as number | null, canAttackFocus: true,
    pressMover(id: number) { log.pressed.push(id); this.focusId = id; },
    pressAttack() { log.attacks.push(this.focusId!); answers(this.focusId!, push); },
    pressShortcut() {
      const targetId = this.focusId!;
      log.skills.push(targetId);
      sentUseSkill.push({ at: performance.now(), index: 3, targetId, useType: 0 });
      skillSeen.push({ at: performance.now(), objectId: SELF_ID, message: { type: 'useSkill' } });
      skillAnswers(targetId, push);
    },
    giveUpTarget() { log.giveUps++; this.focusId = null; },
    inView: () => 'in view',
  };
  const ctx: FightContext = { data, heightAt: () => 0, check: () => {} };
  return { walker: walker as unknown as SkillPlayer, ctx, log, combatSeen, world };
}

describe('the live fight: what the blows did', () => {
  it("counts the walker's DAMAGEs on the target: the AF_MISS ones, the others, and the damage in total", () => {
    const seen = [
      missed(7), missed(7, 1), landed(7, 5), damage(7, AttackFlag.GENERIC | AttackFlag.CRITICAL1, 8),
      landed(8), damage(7, AttackFlag.GENERIC, 99, 2), said(777), // another victim's, another attacker's, a text
    ];
    expect(blowCounts(seen, 7, SELF_ID)).toEqual({ blows: 4, misses: 2, hits: 2, damage: 14 });
    expect(blowCounts([], 7, SELF_ID)).toEqual({ blows: 0, misses: 0, hits: 0, damage: 0 });
  });

  it('says them in the fight text, after the DAMAGE count, and only for what came since the attack began', () => {
    const { walker, combatSeen, world } = fakeWalker([7], () => {});
    combatSeen.push(missed(7), missed(7, 1), landed(7, 5), landed(7, 8), landed(9));
    const target = world.movers.get(7)!;
    expect(fightText(walker, target, { swings: 0, seen: 0, corr: 0, destObj: 0 }))
      .toContain('4 DAMAGE from the walker on it (2 AF_MISS, 2 landed, 14 damage in total), 0 PLAYERCORR');
    expect(fightText(walker, target, { swings: 0, seen: 2, corr: 0, destObj: 0 }))
      .toContain('2 DAMAGE from the walker on it (0 AF_MISS, 2 landed, 13 damage in total), 0 PLAYERCORR');
  });
});

describe('the live fight: an Aibatt the server makes untouchable', () => {
  const rule = (...seen: Seen[]): boolean => untouchable(seen, 7, SELF_ID);

  it('is untouchable after 10 blows in a row answered with AF_MISS and 0 damage', () => {
    expect(rule(...times(10, () => missed(7)))).toBe(true);
    // the last 10 of more
    expect(rule(landed(7), ...times(10, () => missed(7)))).toBe(true);
  });

  it('is not after 9 misses then a hit, nor 9 misses, nor misses another attacker or victim had', () => {
    expect(rule(...times(9, () => missed(7)), landed(7))).toBe(false);
    expect(rule(...times(9, () => missed(7)))).toBe(false);
    expect(rule(...times(9, () => missed(7)), landed(7), ...times(9, () => missed(7)))).toBe(false);
    expect(rule(...times(9, () => missed(7)), damage(7, AttackFlag.MISS, 0, 2))).toBe(false);
    expect(rule(...times(9, () => missed(7)), missed(8))).toBe(false);
  });

  it('is untouchable too when each AF_MISS carries the 1 damage of a monster on its way back (max( nDamage, 1 ))', () => {
    expect(rule(...times(10, () => missed(7, 1)))).toBe(true);
    expect(rule(...times(5, () => missed(7)), ...times(5, () => missed(7, 1)))).toBe(true);
  });

  it("makes `fight` end 'untouchable' at the 10th miss", async () => {
    const { walker, ctx, log } = fakeWalker([7], (id, push) => push(...times(10, () => missed(id))));
    await expect(fight(ctx, walker, walker.world!.movers.get(7)!, TEXTS)).resolves.toBe('untouchable');
    expect(log.attacks).toEqual([7]);
  });

  it('does not for 9 misses, a hit and 9 misses more: `fight` goes on to the kill', async () => {
    const { walker, ctx } = fakeWalker([7], (id, push) => {
      push(...times(9, () => missed(id)), landed(id), ...times(9, () => missed(id)));
      setTimeout(() => push(died(id)), 80);
    });
    await expect(fight(ctx, walker, walker.world!.movers.get(7)!, TEXTS)).resolves.toBe('killed');
  });

  it("goes on to another Aibatt after an 'untouchable' one, and kills it", async () => {
    const { walker, ctx, log } = fakeWalker([7, 8], (id, push) => (id === 7 ? push(...times(10, () => missed(id))) : push(landed(id), died(id))));
    await killSmallAibatt(ctx, walker, TEXTS);
    expect(log.pressed).toEqual([7, 8]);
    expect(log.giveUps).toBe(1);
  });

  it('fails at a third given up, with one sentence naming each Aibatt, why, and the counts of its blows', async () => {
    const { walker, ctx, log } = fakeWalker([7, 8, 9, 10], (id, push) => {
      if (id === 8) push(said(TEXTS.priorityMob.textId));
      else if (id === 7) push(...times(10, () => missed(id, 1)));
      else push(landed(id), ...times(10, () => missed(id)));
    });
    const failure = await killSmallAibatt(ctx, walker, TEXTS).then(() => null, (error: Error) => error);
    expect(failure?.message).toBe(
      'Gave up 3 Small Aibatts: '
      + 'Small Aibatt 7 was on its way back to its spawn point and untouchable, with 10 DAMAGE from the walker on it (10 AF_MISS, 0 landed, 10 damage in total); '
      + "Small Aibatt 8 was another player's (TID_GAME_PRIORITYMOB), with 0 DAMAGE from the walker on it (0 AF_MISS, 0 landed, 0 damage in total); "
      + 'Small Aibatt 9 was on its way back to its spawn point and untouchable, with 11 DAMAGE from the walker on it (10 AF_MISS, 1 landed, 5 damage in total).',
    );
    // the fourth was never tried, and the third is not given up by Escape: the failure ends the run
    expect(log.pressed).toEqual([7, 8, 9]);
    expect(log.giveUps).toBe(2);
  });
});

describe('the live skill part: an Aibatt the server makes untouchable', () => {
  /** What the server sends for Clean Hit's blow: AF_MELEESKILL; where it makes the Aibatt untouchable, AF_MISS alone instead. */
  const skillBlow = (id: number): Seen => damage(id, AttackFlag.MELEESKILL, 7);
  const shortcut = {} as Shortcut;

  it("ends `useSkillOn` 'untouchable' at an AF_MISS answer to the skill, which rolls no miss of its own", async () => {
    const { walker, ctx } = fakeWalker([7], () => {}, (id, push) => push(missed(id, 1)));
    await expect(useSkillOn(ctx, walker, walker.world!.movers.get(7)!, TEXTS, shortcut)).resolves.toBe('untouchable');
  });

  it("goes on to another Aibatt after an 'untouchable' one, uses the skill on it and finishes it", async () => {
    const { walker, ctx, log } = fakeWalker(
      [7, 8], (id, push) => push(died(id)), (id, push) => push(id === 7 ? missed(id, 1) : skillBlow(id)),
    );
    await skillOnSmallAibatt(ctx, walker, TEXTS, shortcut);
    expect(log.skills).toEqual([7, 8]);
    expect(log.giveUps).toBe(1);
    expect(log.attacks).toEqual([8]);
  });

  it("gives up the Aibatt that goes untouchable in the fight after the skill's blow, as a player gives a target up", async () => {
    const { walker, ctx, log } = fakeWalker([7], (id, push) => push(...times(10, () => missed(id))), (id, push) => push(skillBlow(id)));
    await skillOnSmallAibatt(ctx, walker, TEXTS, shortcut);
    expect(log.giveUps).toBe(1);
  });

  it('fails at a third given up, with the same sentence as the fight', async () => {
    const { walker, ctx, log } = fakeWalker([7, 8, 9, 10], () => {}, (id, push) => push(id === 8 ? said(TEXTS.priorityMob.textId) : missed(id, 1)));
    const failure = await skillOnSmallAibatt(ctx, walker, TEXTS, shortcut).then(() => null, (error: Error) => error);
    expect(failure?.message).toBe(
      'Gave up 3 Small Aibatts: '
      + 'Small Aibatt 7 was on its way back to its spawn point and untouchable, with 1 DAMAGE from the walker on it (1 AF_MISS, 0 landed, 1 damage in total); '
      + "Small Aibatt 8 was another player's (TID_GAME_PRIORITYMOB), with 0 DAMAGE from the walker on it (0 AF_MISS, 0 landed, 0 damage in total); "
      + 'Small Aibatt 9 was on its way back to its spawn point and untouchable, with 1 DAMAGE from the walker on it (1 AF_MISS, 0 landed, 1 damage in total).',
    );
    expect(log.skills).toEqual([7, 8, 9]);
  });
});

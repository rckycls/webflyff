import { describe, expect, it, vi } from 'vitest';
import { NULL_ID } from '@flyffweb/protocol';
import type { InventoryItem, SkillSlot } from '@flyffweb/protocol';
import type { CombatEvent } from '../src/world/WorldState';
import {
  TO_THE_AIBATTS, attackSpeedRefusals, foodProblem, killExpProblem, leftOutsideNote, resumeRoute, reviveIfDead, skillLegPlan,
  soloKillExp,
} from './helpers/liveFight';
import type { FightPlayer } from './helpers/liveFight';
import { addedPlayer, moverFrom } from './helpers/movers';
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

  it('accepts the EXP the rule gives, none included, and a level up only where the rule gives some', () => {
    expect(killExpProblem({ level: 2, exp: 5n }, { level: 2, exp: 6n }, 1)).toBeNull();
    expect(killExpProblem({ level: 5, exp: 40n }, { level: 5, exp: 40n }, 0)).toBeNull();
    expect(killExpProblem({ level: 1, exp: 13n }, { level: 2, exp: 1n }, 2)).toBeNull();
  });

  it('names what came and what the rule gives when they differ', () => {
    expect(killExpProblem({ level: 2, exp: 5n }, { level: 2, exp: 5n }, 1)).toMatch(/gave 0 EXP.*level 2.*gives 1/);
    expect(killExpProblem({ level: 5, exp: 40n }, { level: 5, exp: 41n }, 0)).toMatch(/gave 1 EXP.*level 5.*gives 0.*EXP event/);
    expect(killExpProblem({ level: 5, exp: 40n }, { level: 6, exp: 0n }, 0)).toMatch(/level 6.*gives 0/);
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

import { describe, expect, it, vi } from 'vitest';
import { NULL_ID } from '@flyffweb/protocol';
import type { InventoryItem, SkillSlot } from '@flyffweb/protocol';
import type { CombatEvent } from '../src/world/WorldState';
import {
  TO_THE_AIBATTS, attackSpeedRefusals, cleanHitSpend, foodProblem, leftOutsideNote, resumeRoute, reviveIfDead,
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

describe('the live skill part: who can spend a point on Clean Hit', () => {
  /** A Vagrant's 45 skill slots (Clean Hit, Flurry and Over Cut in slots 0-2) with Clean Hit at `cleanHit`. */
  const skills = (cleanHit: number): SkillSlot[] => Array.from({ length: 45 }, (_, i) =>
    (i === 0 ? { skill: 1, level: cleanHit } : i < 3 ? { skill: i + 1, level: 0 } : { skill: NULL_ID, level: 0 }));

  it('raises Clean Hit by one level for a character of level 3 with a point, as the skill window would send it', () => {
    const own = { level: 3, skills: skills(0), skillPoint: 4 };
    expect(cleanHitSpend(own, vagrantSkills(), 'WebWalk1')).toEqual({ index: 0, skills: skills(1) });
    // from a level it has, too, and above level 3
    expect(cleanHitSpend({ level: 9, skills: skills(4), skillPoint: 1 }, vagrantSkills(), 'WebWalk1'))
      .toEqual({ index: 0, skills: skills(5) });
    // the character's own slots are left as they were
    expect(own.skills).toEqual(skills(0));
  });

  it('is skipped with one sentence, naming the character and why, below level 3, with no point, or at the top level', () => {
    const skipOf = (own: { level: number; skills: SkillSlot[]; skillPoint: number }): string => {
      const spend = cleanHitSpend(own, vagrantSkills(), 'WebWalk1');
      if (!('skip' in spend)) throw new Error('not skipped');
      return spend.skip;
    };
    const atLevel2 = skipOf({ level: 2, skills: skills(0), skillPoint: 2 });
    expect(atLevel2).toMatch(/^Skipped: WebWalk1 is level 2, and the skill part needs a character of level 3 or higher with a skill point left to spend/);
    expect(atLevel2.split('. ').length).toBe(1);
    expect(skipOf({ level: 3, skills: skills(0), skillPoint: 0 })).toMatch(/WebWalk1 has no skill point left to spend/);
    expect(skipOf({ level: 15, skills: skills(10), skillPoint: 9 })).toMatch(/WebWalk1 has Clean Hit at its top level \(10\) already/);
    const none = Array.from({ length: 45 }, () => ({ skill: NULL_ID, level: 0 }));
    expect(skipOf({ level: 3, skills: none, skillPoint: 4 })).toMatch(/WebWalk1 has no Clean Hit among its skills/);
  });

  it('says to convert the game files again when the skills catalog has no Clean Hit', () => {
    expect(() => cleanHitSpend({ level: 3, skills: skills(0), skillPoint: 4 }, new Map(), 'WebWalk1')).toThrow(/npm run convert/);
  });
});

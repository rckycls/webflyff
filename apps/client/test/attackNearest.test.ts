// custom (owner 2026-11-20): the phone Attack button's nearest monster outside town (combat/attackNearest.ts) and V15's
// town rule (combat/townRegions.ts).
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@flyffweb/protocol';
import { NEAREST_RADIUS, nearestAllowed, pickNearest } from '../src/world/combat/attackNearest';
import type { NearestInput, NearestState } from '../src/world/combat/attackNearest';
import { TOWN_RECTS, inTown } from '../src/world/combat/townRegions';
import type { TargetMover } from '../src/world/autoplay/targets';

const US = 1;
/** Outside Flaris's RA_TOWN rects, 72 m south of its square. */
const FIELD: Vec3 = [6968, 0, 3400];

function mover(objectId: number, dx: number, dz: number, more: Partial<TargetMover> = {}): TargetMover {
  return {
    objectId, kind: 'monster', hp: 100, maxHp: 100, flying: false, dest: null,
    act: { body: { pos: [FIELD[0] + dx, 0, FIELD[2] + dz] as Vec3 } }, ...more,
  };
}
const self = mover(US, 0, 0, { kind: 'player' });

function pick(movers: TargetMover[], more: Partial<NearestInput> = {}): number | null {
  return pickNearest({
    self, movers, rankOf: () => 1, attackable: (m) => m.hp > 0, busy: () => false, now: 0, ...more,
  })?.objectId ?? null;
}

describe('pickNearest: the Attack button\'s nearest monster (custom, owner 2026-11-20)', () => {
  it('the nearest monster round the player', () => {
    expect(pick([mover(10, 9, 0), mover(11, 3, 4), mover(12, -8, 0)])).toBe(11);
  });

  it('looks 15 m on the ground: 14.9 m is taken, 15.1 m is not', () => {
    expect(NEAREST_RADIUS).toBe(15);
    expect(pick([mover(10, 14.9, 0)])).toBe(10);
    expect(pick([mover(10, 15.1, 0)])).toBeNull();
    expect(pick([])).toBeNull();
  });

  it('only monsters: never an NPC or a pet (kind npc), a player, or itself', () => {
    expect(pick([mover(10, 2, 0, { kind: 'npc' }), mover(11, 3, 0, { kind: 'player' }), self])).toBeNull();
    expect(pick([mover(10, 2, 0, { kind: 'npc' }), mover(12, 6, 0)])).toBe(12);
  });

  it('never a giant or a boss (ranks 4, 5, 7), whatever is nearest', () => {
    const ranks = new Map([[10, 7], [11, 4], [12, 5]]);
    const movers = [mover(10, 1, 0), mover(11, 2, 0), mover(12, 3, 0), mover(13, 9, 0)];
    expect(pick(movers, { rankOf: (m) => ranks.get(m.objectId) ?? 1 })).toBe(13);
  });

  it('never one another player is fighting', () => {
    expect(pick([mover(10, 2, 0), mover(11, 5, 0)], { busy: (m) => m.objectId === 10 })).toBe(11);
  });

  it('never one that cannot be attacked (dead, peaceful, unkillable) or a flying one on foot', () => {
    expect(pick([mover(10, 2, 0, { hp: 0 }), mover(11, 3, 0, { flying: true }), mover(12, 7, 0)])).toBe(12);
  });

  it('a clear line first; with every line blocked the nearest anyway; no check, the nearest', () => {
    const movers = [mover(10, 2, 0), mover(11, 6, 0)];
    expect(pick(movers, { blocked: (m) => m.objectId === 10 })).toBe(11);
    expect(pick(movers, { blocked: () => true })).toBe(10);
    expect(pick(movers)).toBe(10);
  });
});

describe('inTown: V15\'s RA_TOWN regions of WdMadrigal.rgn', () => {
  it('Flaris\'s square, Saint Morning and Darkon\'s town are towns; the fields round them are not', () => {
    expect(inTown(1, [6968, 0, 3328])).toBe(true); // the e2e's Flaris square
    expect(inTown(1, [8321, 0, 3735])).toBe(true); // Saint Morning
    expect(inTown(1, [3836, 0, 4450])).toBe(true); // Darkon's town
    expect(inTown(1, FIELD)).toBe(false);
    expect(inTown(1, [6960, 0, 3090])).toBe(false); // north of Flaris: RA_SAFETY (0x800010) with no RA_TOWN
  });

  it('only world 1 has towns: the same place in another world is not one', () => {
    expect([...TOWN_RECTS.keys()]).toEqual([1]);
    expect(inTown(2, [6968, 0, 3328])).toBe(false);
    expect(inTown(208, [6968, 0, 3328])).toBe(false);
  });

  it('PtInRect on the whole-number point: left and top inclusive, right and bottom exclusive', () => {
    // Flaris's [6918, 3285, 7004, 3384], alone at its south edge (z 3383 .. 3384)
    expect(inTown(1, [6918, 0, 3383])).toBe(true);
    expect(inTown(1, [6917.9, 0, 3383])).toBe(false);
    expect(inTown(1, [7003.9, 0, 3383])).toBe(true);
    expect(inTown(1, [7004, 0, 3383])).toBe(false);
    expect(inTown(1, [6960, 0, 3383.9])).toBe(true);
    expect(inTown(1, [6960, 0, 3384])).toBe(false);
  });
});

describe('nearestAllowed: when the button takes the nearest monster', () => {
  const base: NearestState = { selected: false, dead: false, flying: false, worldId: 1, pos: FIELD };

  it('nothing selected, alive, on foot, outside town', () => {
    expect(nearestAllowed(base)).toBe(true);
    expect(nearestAllowed({ ...base, worldId: 2, pos: [6968, 0, 3328] })).toBe(true);
  });

  it('as before (no pick) with something selected, dead, flying or in town', () => {
    expect(nearestAllowed({ ...base, selected: true })).toBe(false);
    expect(nearestAllowed({ ...base, dead: true })).toBe(false);
    expect(nearestAllowed({ ...base, flying: true })).toBe(false);
    expect(nearestAllowed({ ...base, pos: [6968, 0, 3328] })).toBe(false);
  });
});

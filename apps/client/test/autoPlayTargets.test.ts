import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@flyffweb/protocol';
import { OthersFighting, SkipList, StuckWatch, pickTarget } from '../src/world/autoplay/targets';
import type { TargetMover } from '../src/world/autoplay/targets';

const US = 1, FRIEND = 2, STRANGER = 3;
const PLAYERS = new Set([US, FRIEND, STRANGER]);
const PARTY = new Set([FRIEND]);

function monster(objectId: number, x: number, z: number, more: Partial<TargetMover> = {}): TargetMover {
  return { objectId, kind: 'monster', hp: 100, maxHp: 100, flying: false, dest: null, act: { body: { pos: [x, 0, z] as Vec3 } }, ...more };
}
const self = monster(US, 0, 0, { kind: 'player' });

function pick(movers: TargetMover[], more: Partial<Parameters<typeof pickTarget>[0]> = {}) {
  const fighting = new OthersFighting();
  return pickTarget({
    self, anchor: [0, 0, 0], radius: 15, movers, rankOf: () => 1, hittingUs: new Set(), attackable: () => true,
    busy: (m) => fighting.busy(m, 0, US, PARTY, (id) => PLAYERS.has(id)), skip: new SkipList(), now: 0, ...more,
  });
}

describe('pickTarget (custom, owner 2026-11-15; spec 6.3)', () => {
  it('the nearest of two in the radius', () => {
    expect(pick([monster(10, 8, 0), monster(11, 3, 4)])?.objectId).toBe(11);
  });

  it('a monster 20 m from the anchor when the radius is 15 → not chosen', () => {
    expect(pick([monster(10, 20, 0)])).toBeNull();
  });

  it('a giant (rank 7) or a boss (4, 5) is skipped, but chosen when it hits us', () => {
    const giant = monster(10, 5, 0);
    for (const rank of [4, 5, 7]) expect(pick([giant], { rankOf: () => rank })).toBeNull();
    expect(pick([giant], { rankOf: () => 7, hittingUs: new Set([10]) })?.objectId).toBe(10);
  });

  it('a monster hitting us comes first, even out of the radius', () => {
    expect(pick([monster(10, 2, 0), monster(11, 40, 0)], { hittingUs: new Set([11]) })?.objectId).toBe(11);
  });

  it('a monster whose dest is another player → skipped; a party member\'s → allowed (Review Focus 3)', () => {
    expect(pick([monster(10, 5, 0, { dest: { targetId: STRANGER } })])).toBeNull();
    expect(pick([monster(10, 5, 0, { dest: { targetId: FRIEND } })])?.objectId).toBe(10);
  });

  it('less than full HP with no hit seen → still chosen: the client max HP is an estimate (the e2e Aibatt came in at 100 of more)', () => {
    const fighting = new OthersFighting();
    const hurt = monster(10, 5, 0, { hp: 40 });
    const busy = (m: TargetMover) => fighting.busy(m, 0, US, PARTY, (id) => PLAYERS.has(id));
    expect(pick([hurt], { busy })?.objectId).toBe(10);
  });

  it('a busy monster that hits us → chosen (self-defence)', () => {
    expect(pick([monster(10, 5, 0, { dest: { targetId: STRANGER } })], { hittingUs: new Set([10]) })?.objectId).toBe(10);
  });

  it('a flying monster, an NPC or one not attackable → skipped', () => {
    expect(pick([monster(10, 5, 0, { flying: true })])).toBeNull();
    expect(pick([monster(10, 5, 0, { kind: 'npc' })])).toBeNull();
    expect(pick([monster(10, 5, 0)], { attackable: () => false })).toBeNull();
  });

  it('the skip list for 60 s, back at 60 s', () => {
    const skip = new SkipList();
    skip.add(10, 0, 60_000);
    expect(pick([monster(10, 5, 0)], { skip, now: 59_999 })).toBeNull();
    expect(pick([monster(10, 5, 0)], { skip, now: 60_000 })?.objectId).toBe(10);
  });
});

describe('OthersFighting', () => {
  it('a stranger\'s hit counts for 10 s', () => {
    const fighting = new OthersFighting();
    const m = monster(10, 5, 0);
    fighting.onHit(STRANGER, 10, 1000);
    const busy = (now: number) => fighting.busy({ ...m, hp: 100 }, now, US, PARTY, (id) => PLAYERS.has(id));
    expect(busy(10_999)).toBe(true);
    expect(busy(11_001)).toBe(false);
  });

  it('a monster\'s own hits (on a player) do not make it busy', () => {
    const fighting = new OthersFighting();
    fighting.onHit(10, STRANGER, 0);
    expect(fighting.busy(monster(10, 5, 0), 0, US, PARTY, (id) => PLAYERS.has(id))).toBe(false);
  });
});

describe('StuckWatch', () => {
  it('stuck after 10 s with no progress; not when the distance shrank or we hit it', () => {
    const watch = new StuckWatch();
    watch.choose(10, 12, 0);
    watch.progress(12, false, 9_000);
    expect(watch.stuck(9_999)).toBe(false);
    expect(watch.stuck(10_000)).toBe(true);
    watch.choose(11, 12, 0);
    watch.progress(8, false, 6_000);
    expect(watch.stuck(10_000)).toBe(false);
    expect(watch.stuck(16_000)).toBe(true);
    watch.choose(12, 12, 0);
    watch.progress(1, true, 2_000);
    expect(watch.stuck(60_000)).toBe(false);
  });
});

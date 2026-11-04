// The party skills' effects (Piece 7 M4, [R §8.4], [R §8.5]): what CDPClient's handlers create (DPClient.cpp:5023-5239,
// :5380-5514), as EffectManager requests.

import { describe, expect, it } from 'vitest';
import { partyEffects } from '../src/world/fx/partyEffects';
import type { PartyEffectContext, PartyMover } from '../src/world/fx/partyEffects';

// propTroupeSkill.txt's dwSfxObj and dwSfxObj2 (defineObj.h:639-648)
const SFX: Record<number, { sfx: number | null; sfx2: number | null }> = {
  1: { sfx: 1500, sfx2: 1501 }, 2: { sfx: 1502, sfx2: null }, 3: { sfx: 1503, sfx2: null }, 4: { sfx: 1504, sfx2: null },
  5: { sfx: 1505, sfx2: null }, 6: { sfx: 1506, sfx2: null }, 7: { sfx: 1507, sfx2: 1508 }, 8: { sfx: 1509, sfx2: null },
};
const mover = (objectId: number, pos: [number, number, number], over: Partial<PartyMover> = {}): PartyMover => ({
  objectId, pos, height: 1.8, scale: 1, sitting: false, ...over,
});
const OWN = mover(1, [100, 10, 100]);
const LEADER = mover(2, [110, 10, 100]);
const OTHER = mover(3, [100, 10, 90], { sitting: true });

function context(over: Partial<PartyEffectContext> = {}): PartyEffectContext & { resting: boolean; seated: Map<number, boolean> } {
  const seated = new Map([[OWN.objectId, false], [OTHER.objectId, true]]);
  const state: PartyEffectContext & { resting: boolean } = {
    own: OWN, isLeader: false, leader: LEADER, members: [LEADER, OWN, OTHER],
    mover: (id: number) => [OWN, LEADER, OTHER].find((m) => m.objectId === id) ?? null,
    skill: (id: number) => SFX[id],
    restingOn: () => state.resting,
    sits: (id: number) => seated.get(id) === true,
    resting: true,
    ...over,
  };
  return Object.assign(state, { seated }) as PartyEffectContext & { resting: boolean; seated: Map<number, boolean> };
}

describe('partyEffects: Call, Blitz, Retreat, Precision ([R §8.5])', () => {
  it("Call on a member's client: XI 1501 on the leader, XI 1500 on oneself at 1.1, turned to the leader (10 m east: 90)", () => {
    expect(partyEffects({ type: 'partySkillCall', pos: [110, 10, 100] }, context())).toEqual([
      { xi: 1501, pos: [110, 10, 100], followId: 2, scale: 1.1 },
      { xi: 1500, pos: [100, 11.8, 100], followId: 1, scale: 1.1, angle: 90 },
    ]);
    // the leader out of view: only the own marker
    expect(partyEffects({ type: 'partySkillCall', pos: [100, 10, 110] }, context({ leader: null }))).toEqual([
      { xi: 1500, pos: [100, 11.8, 100], followId: 1, scale: 1.1, angle: 0 },
    ]);
  });

  it("Call on the leader's client: XI 1501 on itself at 1.1", () => {
    expect(partyEffects({ type: 'partySkillCall', pos: [100, 10, 100] }, context({ isLeader: true, leader: OWN }))).toEqual([
      { xi: 1501, pos: [100, 11.8, 100], followId: 1, scale: 1.1 },
    ]);
  });

  it("Blitz: XI 1502 on its target, at the target's height less 0.7 times its scale, at its scale; none for a target not in view", () => {
    const big = mover(9, [50, 0, 50], { height: 2, scale: 1.5 });
    expect(partyEffects({ type: 'partySkillBlitz', targetId: 9 }, context({ mover: (id) => (id === 9 ? big : null) }))).toEqual([
      { xi: 1502, pos: [50, 0, 50], followId: 9, followDest: true, lift: 2 * 1.5 - 1.5 * 0.7, scale: 1.5 },
    ]);
    expect(partyEffects({ type: 'partySkillBlitz', targetId: 99 }, context())).toEqual([]);
  });

  it('Retreat: XI 1503 on each member in view; Precision: XI 1504 on the leader, none out of view', () => {
    expect(partyEffects({ type: 'partySkillRetreat' }, context()).map((r) => [r.xi, r.followId])).toEqual([[1503, 2], [1503, 1], [1503, 3]]);
    expect(partyEffects({ type: 'partySkillSphereCircle' }, context())).toEqual([{ xi: 1504, pos: [110, 10, 100], followId: 2, scale: 1 }]);
    expect(partyEffects({ type: 'partySkillSphereCircle' }, context({ leader: null }))).toEqual([]);
  });
});

describe('partyEffects: the modes ([R §8.4])', () => {
  it("Linked Attack, Lucky Drop and Gift Box on: the skill's effect on the leader at 0.8, 0.7 and 1.0; off: none", () => {
    const on = (mode: number, skill: number) => partyEffects({ kind: 'modeOn', mode, skill, skillTime: 1000 }, context());
    expect([on(0, 5), on(1, 6), on(3, 8)]).toEqual([
      [{ xi: 1505, pos: [110, 10, 100], followId: 2, scale: 0.8 }],
      [{ xi: 1506, pos: [110, 10, 100], followId: 2, scale: 0.7 }],
      [{ xi: 1509, pos: [110, 10, 100], followId: 2, scale: 1 }],
    ]);
    expect(partyEffects({ kind: 'modeOff', mode: 0, skill: 5 }, context())).toEqual([]);
    // mode 4, the cash state: nothing
    expect(partyEffects({ kind: 'modeOn', mode: 4, skill: 0, skillTime: 0 }, context())).toEqual([]);
    // the leader out of view: nothing
    expect(on(0, 5).length).toBe(1);
    expect(partyEffects({ kind: 'modeOn', mode: 0, skill: 5, skillTime: 1000 }, context({ leader: null }))).toEqual([]);
  });

  it('Resting: XI 1507 on each sitting member in view, then XI 1508', () => {
    const [request, ...rest] = partyEffects({ kind: 'modeOn', mode: 2, skill: 7, skillTime: 1000 }, context());
    expect(rest).toEqual([]);
    expect(request).toMatchObject({ xi: 1507, pos: [100, 10, 90], followId: 3, lift: 0.1, then: { xi: 1508, followId: 3, lift: 0.1 } });
    // on and off alike
    expect(partyEffects({ kind: 'modeOff', mode: 2, skill: 7 }, context()).map((r) => r.xi)).toEqual([1507]);
  });

  it("Resting's loop ends when its mover stands or the mode goes off", () => {
    const c = context();
    const loop = partyEffects({ kind: 'modeOn', mode: 2, skill: 7, skillTime: 1000 }, c)[0]!.then!.whileTrue!;
    expect(loop()).toBe(true);
    c.seated.set(OTHER.objectId, false);
    expect(loop()).toBe(false);
    c.seated.set(OTHER.objectId, true);
    expect(loop()).toBe(true);
    c.resting = false;
    expect(loop()).toBe(false);
  });
});

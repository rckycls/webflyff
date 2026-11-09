// The held weapons' upgrade and element glow (2026-11-09, render/weaponGlow.ts): which effect at which size, and the
// stream along the sword-trail line (CMover::SetRenderPartsEffect, CModelObject::CreateParticle).

import { describe, expect, it } from 'vitest';
import { Group, Object3D } from 'three';
import { GLOW_POINTS, GLOW_SLOTS, GLOW_SLOTS_2, WeaponGlows, bandScale, glowOf, weaponOption } from '../src/world/render/weaponGlow';
import type { GlowEffect } from '../src/world/render/weaponGlow';

const plain = { referStat1: 0 };
const ultimate = { referStat1: 2 };

describe('glowOf', () => {
  it('a plain weapon glows from +6 (propEnchant.inc NORMAL_SCAL), XI_NAT_NONE01_ADV, +10 and past at 0.7', () => {
    expect(glowOf(plain, { upgrade: 5, element: 0, elementLevel: 0 })).toBeNull();
    expect(glowOf(plain, { upgrade: 6, element: 0, elementLevel: 0 })).toEqual({ kind: 0, first: { xi: 1853, scale: 0.3 }, second: null });
    expect(glowOf(plain, { upgrade: 15, element: 0, elementLevel: 0 })).toEqual({ kind: 0, first: { xi: 1853, scale: 0.7 }, second: null });
  });

  it('an element: its _ADV effect by the element level from +6, and its own stream from element level 4', () => {
    // fire +7, fire level 8: XI_NAT_FIRE01_ADV + 7, and XI_NAT_FIRE01 + 3
    expect(glowOf(plain, { upgrade: 7, element: 1, elementLevel: 8 })).toEqual({ kind: 1, first: { xi: 1753 + 7, scale: 0.4 }, second: 1070 + 3 });
    // water +2, level 4: no first stream (its size is 0), the element's stream from level 4
    expect(glowOf(plain, { upgrade: 2, element: 2, elementLevel: 4 })).toEqual({ kind: 2, first: null, second: 1076 + 1 });
    // electricity has no second stream; under +6 and level 4 nothing
    expect(glowOf(plain, { upgrade: 6, element: 3, elementLevel: 10 })).toEqual({ kind: 3, first: { xi: 1793 + 9, scale: 0.3 }, second: null });
    expect(glowOf(plain, { upgrade: 3, element: 4, elementLevel: 3 })).toBeNull();
  });

  it('an Ultimate glows from +1 with its _AL effects (ALL_SCAL)', () => {
    expect(glowOf(ultimate, { upgrade: 1, element: 0, elementLevel: 0 })).toEqual({ kind: 6, first: { xi: 1853, scale: 0.3 }, second: null });
    expect(glowOf(ultimate, { upgrade: 10, element: 5, elementLevel: 10 })).toEqual({ kind: 11, first: { xi: 1833 + 9, scale: 1.2 }, second: 1101 + 5 });
  });

  it('unpacks nOption: the upgrade, the element D16-23, its level D24-31', () => {
    expect(weaponOption((7 << 24) | (1 << 16) | 9)).toEqual({ upgrade: 9, element: 1, elementLevel: 7 });
  });
});

describe('WeaponGlows', () => {
  it('walks 28 points of the line a frame each; every 4th frame an effect at the point, following the weapon', () => {
    const hand = new Group();
    hand.position.set(10, 0, 0);
    const weapon = new Object3D();
    weapon.userData.forces = [[0, 0, 0], [0, 2.8, 0]];
    hand.add(weapon);
    const made: GlowEffect[] = [];
    const glows = new WeaponGlows((effect) => made.push(effect));
    const glow = { kind: 0, first: { xi: 1853, scale: 0.7 }, second: null };
    for (let i = 0; i < 8; i++) glows.tick([[7, [{ object: weapon, glow }]]]);
    // frames 4 and 8 made one each, at the counter's points 3 and 7 of 28
    expect(made.map((e) => e.pos.map((v) => Math.round(v * 100) / 100))).toEqual([[10, 0.3, 0], [10, 0.7, 0]]);
    expect(made[0]!.scale).toBeCloseTo(bandScale(3 / GLOW_POINTS) * 0.7, 6);
    hand.position.set(20, 0, 0);
    expect(made[0]!.place()!.pos[0]).toBe(20);
    weapon.removeFromParent();
    expect(made[0]!.place()).toBeNull();
  });

  /** A weapon in a hand with one line, and what its glows make. */
  function holding() {
    const hand = new Group();
    const weapon = new Object3D();
    weapon.userData.forces = [[0, 0, 0], [0, 2.8, 0]];
    hand.add(weapon);
    const made: GlowEffect[] = [];
    return { weapon, made, glows: new WeaponGlows((effect) => made.push(effect)) };
  }

  it('a hand keeps 28 effects at once (MAX_PARTS_FIRE): the looping glow fills its slots and then makes no more', () => {
    const { weapon, made, glows } = holding();
    const glow = { kind: 0, first: { xi: 1853, scale: 0.7 }, second: null };
    for (let i = 0; i < 2000; i++) glows.tick([[7, [{ object: weapon, glow }]]]);
    // the 28 are made by the 112th frame, before the counter first starts over on a making frame (the 116th)
    expect(made.length).toBe(GLOW_SLOTS);
    // a slot frees when its effect is over, and the next making frame fills it
    made[0]!.ended();
    for (let i = 0; i < 4; i++) glows.tick([[7, [{ object: weapon, glow }]]]);
    expect(made.length).toBe(GLOW_SLOTS + 1);
  });

  it('the element stream keeps 16 (MAX_PARTS_FIRE_2)', () => {
    const { weapon, made, glows } = holding();
    const glow = { kind: 1, first: null, second: 1073 };
    for (let i = 0; i < 2000; i++) glows.tick([[7, [{ object: weapon, glow }]]]);
    expect(made.length).toBe(GLOW_SLOTS_2);
  });

  it('a new kind, or a weapon that no longer glows, ends the hand\'s effects and starts its slots over', () => {
    const { weapon, made, glows } = holding();
    const plain = { kind: 0, first: { xi: 1853, scale: 0.7 }, second: null };
    for (let i = 0; i < 400; i++) glows.tick([[7, [{ object: weapon, glow: plain }]]]);
    const before = made.length;
    expect(made[0]!.place()).not.toBeNull();
    const fire = { kind: 1, first: { xi: 1755, scale: 0.7 }, second: null };
    for (let i = 0; i < 8; i++) glows.tick([[7, [{ object: weapon, glow: fire }]]]);
    expect(made[0]!.place()).toBeNull();
    expect(made.length).toBeGreaterThan(before);
    expect(made[made.length - 1]!.xi).toBe(1755);
    const last = made[made.length - 1]!;
    glows.tick([]);
    expect(last.place()).toBeNull();
  });
});

// The angel that follows its player (2026-11-10, world/angel/angelFollow.ts): CMover's AngelMoveProcess and
// CreateAngelParticle (_Common/Mover.cpp:3972-4021, :10765-10798).

import { describe, expect, it } from 'vitest';
import { AngelFollowers, createAngelParticle, startAngel, stepAngel } from '../src/world/angel/angelFollow';
import { PetParticles } from '../src/world/pets/petParticles';

const f32 = Math.fround;

describe('the angel\'s place', () => {
  it('starts 1 to the +x side of the player, at its height (the model is 1 over it)', () => {
    expect(startAngel([10, 5, 20])).toEqual([11, 5, 20]);
  });

  it('stays within 1, moves toward the player by speed * dist² / 10 past it, and is made again past 100', () => {
    expect(stepAngel([10.5, 0, 0], [10, 0, 0], 0.2)).toEqual([10.5, 0, 0]);
    // 3 away: 0.2 * 9 / 10 = 0.18 toward the player
    const next = stepAngel([13, 0, 0], [10, 0, 0], 0.2)!;
    expect(next[0]).toBeCloseTo(13 - 0.18, 5);
    expect(next[1]).toBe(0);
    expect(stepAngel([200, 0, 0], [10, 0, 0], 0.2)).toBeNull();
  });
});

describe('its sparkles (CreateAngelParticle)', () => {
  it('two a call, of the angel\'s kind plus 0-2, 1.1 over it and 0.03 lower each, the ground the player\'s + 0.5', () => {
    const particles = new PetParticles();
    const random = { float: (n: number) => f32(n / 2), int: (n: number) => n - 1 };
    createAngelParticle(particles, { angle: 0, angleX: 0, y: 4 }, [1, 4, 2], 16, random);
    expect(particles.count()).toBe(2);
    expect(particles.liveKinds()).toEqual([18]);
    const [second, first] = particles.particles(18);
    expect(first!.pos[1]).toBeCloseTo(4 + 1.1 - 0.03, 5);
    expect(second!.pos[1]).toBeCloseTo(4 + 1.1 - 0.06, 5);
    expect(first!.groundY).toBeCloseTo(4.5, 5);
    // a turn of 180 (the back) at speed 0.01: straight along +z, no pitch
    expect(first!.vel[0]).toBeCloseTo(0, 5);
    expect(first!.vel[2]).toBeCloseTo(0.01, 5);
  });
});

describe('AngelFollowers', () => {
  it('makes an angel for a player with the buff, moves it each step, drops it without the buff, remakes it at death', () => {
    const followers = new AngelFollowers();
    const sparkles: number[] = [];
    followers.step([{ id: 1, pos: [0, 0, 0], speed: 0.2, angelItem: 30036 }, { id: 2, pos: [5, 0, 5], speed: 0.2, angelItem: null }],
      (id) => void sparkles.push(id));
    expect(followers.of(1)).toEqual({ itemId: 30036, pos: [1, 0, 0] });
    expect(followers.of(2)).toBeUndefined();
    expect(sparkles).toEqual([1]);
    followers.step([{ id: 1, pos: [3, 0, 0], speed: 0.2, angelItem: 30036 }], () => {});
    expect(followers.of(1)!.pos[0]).toBeCloseTo(1 + 0.08, 5); // 2 away: 0.2 * 4 / 10
    followers.died(1);
    followers.step([{ id: 1, pos: [3, 0, 0], speed: 0.2, angelItem: 30036 }], () => {});
    expect(followers.of(1)!.pos).toEqual([4, 0, 0]);
    followers.step([{ id: 1, pos: [3, 0, 0], speed: 0.2, angelItem: null }], () => {});
    expect(followers.of(1)).toBeUndefined();
  });
});

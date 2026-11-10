// 2026-11-10: the Arena's rule (`CMover::IsArenaTarget`, `_Common/MoverAttack.cpp:1953-1972`; `CWorld::IsArena`,
// `_Common/World.h:414-415`).

import { describe, expect, it } from 'vitest';
import { ARENA_CENTER, WI_WORLD_ARENA, isArena, isArenaTarget } from '../src/world/combat/arena';

describe('the Arena (__JEFF_11_4)', () => {
  it('is world 208, WI_WORLD_ARENA (Resource/defineWorld.h:63)', () => {
    expect(WI_WORLD_ARENA).toBe(208);
    expect(isArena(208)).toBe(true);
    expect(isArena(1)).toBe(false);
    expect(isArena(21)).toBe(false);
  });

  it('a target there is one where both stand within the circle of (490, 507), d² <= 1246', () => {
    expect(ARENA_CENTER).toEqual({ x: 490, z: 507 });
    expect(isArenaTarget(208, [490, 140, 507], [500, 140, 515])).toBe(true);
    // the edge: 35 and 1 → 1226 is in; 35 and 5 → 1250 is out
    expect(isArenaTarget(208, [490, 0, 507], [525, 0, 508])).toBe(true);
    expect(isArenaTarget(208, [490, 0, 507], [525, 0, 512])).toBe(false);
    // the target out, or the attacker out (the arrival at 540, 485 is 54.6 away: safe)
    expect(isArenaTarget(208, [490, 0, 507], [540, 140, 485])).toBe(false);
    expect(isArenaTarget(208, [540, 140, 485], [490, 0, 507])).toBe(false);
  });

  it('truncates each distance toward zero first, as the int cast does (HighRateProfile::Bounded)', () => {
    // dx = (int)35.9 = 35, dz = (int)(-4.9) = -4: 1225 + 16 = 1241, in; untruncated it would be 1312.8, out
    expect(isArenaTarget(208, [490, 0, 507], [525.9, 0, 502.1])).toBe(true);
    // dx = (int)(-35.9) = -35, dz = 5 → 1250, out
    expect(isArenaTarget(208, [490, 0, 507], [454.1, 0, 512.5])).toBe(false);
  });

  it('is never a target anywhere else, whatever the places (IsArena first)', () => {
    expect(isArenaTarget(1, [490, 0, 507], [491, 0, 507])).toBe(false);
    expect(isArenaTarget(25, [490, 0, 507], [491, 0, 507])).toBe(false);
  });
});

// 2026-11-15 (social): following a player (docs/2026-11-15-social-research.md §3): `m_objidTracking` and ControlGround's
// part of it (_Interface/WndWorldControlPlayer.cpp:406-417).

import { describe, expect, it, vi } from 'vitest';
import type { Vec3 } from '@flyffweb/protocol';
import { FOLLOW_REARM_SQ, Follow } from '../src/world/social/follow';

describe('the follow (m_objidTracking)', () => {
  it('walks to the player again only farther than 4 m (3-D, d² > 16)', () => {
    const follow = new Follow();
    const walk = vi.fn();
    const places = new Map<number, Vec3>([[7, [104, 0, 100]]]);
    follow.start(7);
    follow.step([100, 0, 100], (id) => places.get(id), walk); // 4 m: d² 16, not more
    expect(walk).not.toHaveBeenCalled();
    places.set(7, [104, 0.5, 100]);
    follow.step([100, 0, 100], (id) => places.get(id), walk);
    expect(walk).toHaveBeenCalledWith(7);
    expect(FOLLOW_REARM_SQ).toBe(16);
    expect(follow.targetId).toBe(7);
  });

  it('ends when the player is gone from view, when either dies, or when stopped', () => {
    const follow = new Follow();
    const walk = vi.fn();
    follow.start(7);
    follow.step([0, 0, 0], () => undefined, walk);
    expect(follow.targetId).toBeNull();
    follow.start(7);
    follow.died(9, 1);
    expect(follow.targetId).toBe(7);
    follow.died(1, 1);
    expect(follow.targetId).toBeNull();
    follow.start(7);
    follow.died(7, 1);
    expect(follow.targetId).toBeNull();
    follow.start(7);
    follow.stop();
    expect(follow.targetId).toBeNull();
    expect(walk).not.toHaveBeenCalled();
  });
});

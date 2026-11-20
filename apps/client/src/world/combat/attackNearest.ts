// custom (owner 2026-11-20): "the attack button on mobile attacks the nearest target available if no target is selected,
// only outside of town" (docs/2026-11-20-attack-nearest.md). V15 has no such pick (its Tab cycles only enemy guild players
// in the siege map, WndWorld.cpp:7664-7691); the rules are Auto Play's (autoplay/targets.ts `pickTarget`), round the player:
//
// - the owner's answers (2026-11-20): 15 m; monsters only (no players, NPCs or pets); never a giant or a boss; never one
//   another player (not us, not our party) is fighting; nothing found, nothing happens (the button stays greyed);
// - a monster whose straight line is clear of objects first, as the farm bot's (`sightBlocked`);
// - only on foot, alive, outside town (combat/townRegions.ts, V15's RA_TOWN), and with nothing selected: no focus, or a
//   focus that left the view or died. Anything else selected: the button is as before.

import type { Vec3 } from '@flyffweb/protocol';
import { SkipList, pickTarget } from '../autoplay/targets';
import type { TargetMover } from '../autoplay/targets';
import { inTown } from './townRegions';

/** How far round the player the button looks, on the ground (m) (owner 2026-11-20: Auto Play's starting radius). */
export const NEAREST_RADIUS = 15;

/** What the pick reads: Auto Play's hooks (`AutoPlayHooks`), as its farm bot gives them. */
export interface NearestInput {
  self: TargetMover;
  movers: Iterable<TargetMover>;
  rankOf: (m: TargetMover) => number;
  attackable: (m: TargetMover) => boolean;
  /** Another player is fighting it (`OthersFighting.busy`). */
  busy: (m: TargetMover) => boolean;
  /** An object on the straight line to it; none: no such check (the button's enabled state, each frame). */
  blocked?: (m: TargetMover) => boolean;
  now: number;
}

/** The button skips nothing for a while and is hit by nobody: the farm bot's own lists stay its own. */
const NO_SKIP = new SkipList();
const NOBODY: ReadonlySet<number> = new Set();

/** The nearest monster the button may take, or null: `pickTarget` round the player with the owner's rules. */
export function pickNearest(input: NearestInput): TargetMover | null {
  const { self } = input;
  return pickTarget({
    self, anchor: self.act.body.pos, radius: NEAREST_RADIUS, movers: input.movers, rankOf: input.rankOf,
    hittingUs: NOBODY, attackable: input.attackable, busy: input.busy, skip: NO_SKIP, now: input.now, avoidGiants: true,
    ...(input.blocked === undefined ? {} : { blocked: input.blocked }),
  });
}

/** The own player and the selection, as the button's rule reads them. */
export interface NearestState {
  /** A mover is selected that is in view and alive. */
  selected: boolean;
  dead: boolean;
  flying: boolean;
  worldId: number;
  pos: Vec3;
}

/** Whether the button may take the nearest monster: nothing selected, alive, on foot, outside town. */
export function nearestAllowed(s: NearestState): boolean {
  return !s.selected && !s.dead && !s.flying && !inTown(s.worldId, s.pos);
}

/**
 * custom (owner 2026-11-15): Auto Play's choice of the next monster (docs/superpowers/specs/2026-11-15-auto-play-design.md,
 * 6.3). V15 has no "select nearest": Tab on the ground cycles only enemy guild players in the siege map
 * (`WndWorld.cpp:7664-7691`). The bot takes the nearest attackable monster inside the radius around where it started,
 * never a boss or a giant, never one another player is fighting; a monster hitting us comes first (self-defence).
 */
import type { Vec3 } from '@flyffweb/protocol';

/** What the choice reads of a mover (a `Mover` fits). */
export interface TargetMover {
  readonly objectId: number;
  readonly kind: 'player' | 'monster' | 'npc';
  readonly hp: number;
  readonly maxHp: number | null;
  readonly flying: boolean;
  readonly dest: { readonly targetId: number | null } | null;
  readonly act: { readonly body: { readonly pos: Vec3 } };
}

/** `RANK_BOSS`, `RANK_MIDBOSS`, `RANK_SUPER` (Resource/defineAttribute.h): never chosen unless they hit us first. */
export const NEVER_CHOSEN_RANKS: ReadonlySet<number> = new Set([4, 5, 7]);
/** How long another player's hit makes a monster theirs (ms). */
export const OTHERS_HIT_MS = 10_000;
/** No hit and no step closer for this long: the target cannot be reached (ms). */
export const STUCK_MS = 10_000;
/** A step closer counts from this much (m). */
const CLOSER_BY = 0.5;

/** The distance on the ground (x and z), as the bot measures its radius. */
export function groundDistance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

/** Who hit which monster, and when: kill stealing is a monster another player hits or follows. */
export class OthersFighting {
  private readonly hits = new Map<number, Map<number, number>>();

  onHit(attackerId: number, victimId: number, now: number): void {
    let by = this.hits.get(victimId);
    if (by === undefined) this.hits.set(victimId, by = new Map());
    by.set(attackerId, now);
  }

  /** A mover left the view or died: its hits go. */
  forget(objectId: number): void {
    this.hits.delete(objectId);
  }

  /**
   * Whether another player fights `m`: it follows a player who is not us or our party, or such a player hit it in the
   * last 10 s, or it lost HP with no hit from us or our party.
   */
  busy(m: TargetMover, now: number, us: number, party: ReadonlySet<number>, isPlayer: (objectId: number) => boolean): boolean {
    const ours = (id: number) => id === us || party.has(id);
    const followed = m.dest?.targetId ?? null;
    if (followed !== null && isPlayer(followed) && !ours(followed)) return true;
    const by = this.hits.get(m.objectId);
    let hitByUs = false;
    if (by !== undefined) {
      for (const [attacker, at] of by) {
        if (ours(attacker)) hitByUs = true;
        else if (isPlayer(attacker) && now - at <= OTHERS_HIT_MS) return true;
      }
    }
    return m.maxHp !== null && m.hp < m.maxHp && !hitByUs;
  }
}

/** Movers left alone until a time. */
export class SkipList {
  private readonly until = new Map<number, number>();

  add(objectId: number, now: number, ms: number): void {
    this.until.set(objectId, now + ms);
  }

  has(objectId: number, now: number): boolean {
    const until = this.until.get(objectId);
    if (until === undefined) return false;
    if (now < until) return true;
    this.until.delete(objectId);
    return false;
  }

  clear(): void {
    this.until.clear();
  }
}

export interface TargetInput {
  self: TargetMover;
  anchor: Vec3;
  radius: number;
  movers: Iterable<TargetMover>;
  rankOf: (m: TargetMover) => number;
  /** The monsters that hit us lately. */
  hittingUs: ReadonlySet<number>;
  attackable: (m: TargetMover) => boolean;
  busy: (m: TargetMover) => boolean;
  skip: SkipList;
  now: number;
}

/** The next monster to fight, or null. */
export function pickTarget(input: TargetInput): TargetMover | null {
  const { self, anchor, radius, rankOf, hittingUs, attackable, busy, skip, now } = input;
  const at = self.act.body.pos;
  let attacker: TargetMover | null = null, attackerDist = Infinity;
  let best: TargetMover | null = null, bestDist = Infinity;
  for (const m of input.movers) {
    if (m.objectId === self.objectId || m.kind !== 'monster' || !attackable(m)) continue;
    const dist = groundDistance(at, m.act.body.pos);
    if (hittingUs.has(m.objectId)) {
      if (dist < attackerDist) { attacker = m; attackerDist = dist; }
      continue;
    }
    if (dist >= bestDist || m.flying || skip.has(m.objectId, now)) continue;
    if (groundDistance(anchor, m.act.body.pos) > radius || NEVER_CHOSEN_RANKS.has(rankOf(m)) || busy(m)) continue;
    best = m;
    bestDist = dist;
  }
  return attacker ?? best;
}

/** Whether the chosen target can be reached: no hit or swing on it and no step closer for 10 s means stuck. */
export class StuckWatch {
  private target: number | null = null;
  private since = 0;
  private best = Infinity;
  private engaged = false;

  choose(objectId: number, dist: number, now: number): void {
    this.target = objectId;
    this.since = now;
    this.best = dist;
    this.engaged = false;
  }

  progress(dist: number, hitOrSwing: boolean, now: number): void {
    if (hitOrSwing) this.engaged = true;
    if (dist <= this.best - CLOSER_BY) {
      this.best = dist;
      this.since = now;
    }
  }

  stuck(now: number): boolean {
    return this.target !== null && !this.engaged && now - this.since >= STUCK_MS;
  }

  clear(): void {
    this.target = null;
    this.engaged = false;
  }
}

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

/**
 * `RANK_BOSS`, `RANK_MIDBOSS`, `RANK_SUPER` (Resource/defineAttribute.h), the giants and bosses: not chosen while "Avoid
 * giants" is on (owner 2026-11-17: an option, on by default), unless they hit us first.
 */
export const NEVER_CHOSEN_RANKS: ReadonlySet<number> = new Set([4, 5, 7]);
/** How long another player's hit makes a monster theirs (ms). */
export const OTHERS_HIT_MS = 10_000;
/** No attack of ours on the target for this long: another target (owner 2026-11-17: "hasn't attacked for 5 seconds") (ms). */
export const STUCK_MS = 5_000;

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
   * last 10 s. (A monster's HP below its maximum is no sign: the client's maximum is an estimate from the catalog and
   * the rate table, so a monster that came in at less would be skipped forever; the e2e Aibatt showed it.)
   */
  busy(m: TargetMover, now: number, us: number, party: ReadonlySet<number>, isPlayer: (objectId: number) => boolean): boolean {
    const ours = (id: number) => id === us || party.has(id);
    const followed = m.dest?.targetId ?? null;
    if (followed !== null && isPlayer(followed) && !ours(followed)) return true;
    const by = this.hits.get(m.objectId);
    if (by === undefined) return false;
    for (const [attacker, at] of by) if (!ours(attacker) && isPlayer(attacker) && now - at <= OTHERS_HIT_MS) return true;
    return false;
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
  /** Bosses, mid-bosses and giants left alone (default true). */
  avoidGiants?: boolean;
  /** The monster kinds (`added.index`) to fight; empty or absent: every kind. */
  only?: ReadonlySet<number>;
  /** A mover's kind (`added.index`), for `only`. */
  indexOf?: (m: TargetMover) => number;
  /** Whether an object stands on the straight line to the monster (`sightBlocked`): such a one comes after the clear ones. */
  blocked?: (m: TargetMover) => boolean;
}

/**
 * The next monster to fight, or null: one hitting us first (any distance, any kind); else, of the monsters inside the
 * radius that may be chosen, the nearest whose straight line is clear of objects, or the nearest of all when every line
 * is blocked (the side step and the 5 s rule then deal with it).
 */
export function pickTarget(input: TargetInput): TargetMover | null {
  const { self, anchor, radius, rankOf, hittingUs, attackable, busy, skip, now } = input;
  const avoidGiants = input.avoidGiants ?? true, only = input.only, indexOf = input.indexOf;
  const at = self.act.body.pos;
  let attacker: TargetMover | null = null, attackerDist = Infinity;
  const candidates: Array<{ m: TargetMover; dist: number }> = [];
  for (const m of input.movers) {
    if (m.objectId === self.objectId || m.kind !== 'monster' || !attackable(m)) continue;
    const dist = groundDistance(at, m.act.body.pos);
    if (hittingUs.has(m.objectId)) {
      if (dist < attackerDist) { attacker = m; attackerDist = dist; }
      continue;
    }
    if (m.flying || skip.has(m.objectId, now) || groundDistance(anchor, m.act.body.pos) > radius) continue;
    if (avoidGiants && NEVER_CHOSEN_RANKS.has(rankOf(m))) continue;
    if (only !== undefined && only.size > 0 && (indexOf === undefined || !only.has(indexOf(m)))) continue;
    if (busy(m)) continue;
    candidates.push({ m, dist });
  }
  if (attacker !== null) return attacker;
  candidates.sort((a, b) => a.dist - b.dist);
  const clear = input.blocked === undefined ? candidates[0] : candidates.find(({ m }) => !input.blocked!(m));
  return (clear ?? candidates[0])?.m ?? null;
}

/** Whether the chosen target is still worth it: 5 s with no attack of ours on it (since the choice or the last one) is not. */
export class StuckWatch {
  private target: number | null = null;
  private last = 0;

  choose(objectId: number, now: number): void {
    this.target = objectId;
    this.last = now;
  }

  /** Our swing, hit or skill landed on the target. */
  attacked(now: number): void {
    if (this.target !== null) this.last = now;
  }

  /** The time of the choice or of the last attack. */
  get lastAttack(): number {
    return this.last;
  }

  stuck(now: number): boolean {
    return this.target !== null && now - this.last >= STUCK_MS;
  }

  clear(): void {
    this.target = null;
  }
}

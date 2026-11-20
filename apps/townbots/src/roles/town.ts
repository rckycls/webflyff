// The town roles: wandering between the places players gather (standing, sitting, a motion now and then), AFK (one
// place for the whole role), and upgrading by the upgrade NPC (real tries on the bot's own spare gear: everyone nearby
// sees the success or fail sparkle the server sends).
import type { InventoryItem, Vec3 } from '@flyffweb/protocol';
import { ARRIVE_M } from './route';
import { between, groundDistance } from './types';
import type { RoleIo, RoleRunner, RoleStatus } from './types';

const SEC = 1000;
const MIN = 60 * SEC;
/** A walk in town with no arrival after this long: another place (ms). */
const TOWN_WALK_GIVE_UP_MS = 30 * SEC;
/** The highest upgrade a spare is tried for. */
const MAX_UPGRADE = 10;
/** An upgrade with no answer after this long is over (ms). */
const UPGRADE_ANSWER_MS = 10 * SEC;

const pick = <T>(list: readonly T[], random: () => number): T => list[Math.min(list.length - 1, Math.floor(random() * list.length))]!;
const near = (io: RoleIo, at: Vec3): boolean => {
  const pos = io.position();
  return pos !== undefined && groundDistance(pos, at) <= ARRIVE_M;
};

export class WanderRole implements RoleRunner {
  readonly role = 'wandering' as const;
  private readonly until: number;
  private target: Vec3 | null = null;
  private walkedAt = 0;
  /** Idle at a place until then. */
  private idleUntil = 0;

  constructor(private readonly town: readonly Vec3[], private readonly io: RoleIo, duration: () => number, private readonly motions: readonly number[]) {
    this.until = io.now() + duration();
  }

  tick(): RoleStatus {
    const now = this.io.now();
    if (now >= this.until) {
      if (this.io.sitting()) this.io.stand();
      return 'done';
    }
    if (this.target !== null) {
      if (near(this.io, this.target) || now - this.walkedAt > TOWN_WALK_GIVE_UP_MS) {
        this.target = null;
        this.arrive(now);
      }
      return 'running';
    }
    if (now < this.idleUntil) return 'running';
    if (this.io.sitting()) this.io.stand();
    this.target = pick(this.town, this.io.random);
    this.walkedAt = now;
    this.io.walkTo(this.target);
    if (near(this.io, this.target)) {
      this.target = null;
      this.arrive(now);
    }
    return 'running';
  }

  busy(): boolean { return false; }

  stop(): void {
    if (this.io.sitting()) this.io.stand();
  }

  /** At a place: sits 1-3 minutes (1 in 4), or plays a motion and stands (1 in 5), or stands 10-60 s. */
  private arrive(now: number): void {
    const roll = this.io.random();
    if (roll < 0.25) {
      this.io.sit();
      this.idleUntil = now + between(this.io.random, MIN, 3 * MIN);
    } else {
      if (roll < 0.45 && this.motions.length > 0) this.io.motion(pick(this.motions, this.io.random));
      this.idleUntil = now + between(this.io.random, 10 * SEC, 60 * SEC);
    }
  }
}

export class AfkRole implements RoleRunner {
  readonly role = 'afk' as const;
  private readonly until: number;
  private target: Vec3 | null = null;
  private settled = false;

  constructor(private readonly town: readonly Vec3[], private readonly io: RoleIo, duration: () => number) {
    this.until = io.now() + duration();
  }

  tick(): RoleStatus {
    if (this.io.now() >= this.until) {
      if (this.io.sitting()) this.io.stand();
      return 'done';
    }
    if (this.settled) return 'running';
    if (this.target === null) {
      this.target = pick(this.town, this.io.random);
      this.io.walkTo(this.target);
    }
    if (near(this.io, this.target)) {
      // two in three sit, the rest just stand there
      if (this.io.random() < 2 / 3) this.io.sit();
      this.settled = true;
    }
    return 'running';
  }

  busy(): boolean { return false; }

  stop(): void {
    if (this.io.sitting()) this.io.stand();
  }
}

export class UpgradeRole implements RoleRunner {
  readonly role = 'upgrading' as const;
  private readonly until: number;
  private walked = false;
  private arrived = false;
  private nextTry = Infinity;
  /** The try waiting for its answer: the spare as it was, the material's count, when it was sent. */
  private pending: { spare: InventoryItem; material: InventoryItem; at: number } | null = null;

  constructor(
    private readonly npcPos: Vec3,
    private readonly items: { materials: readonly number[]; spares: readonly number[] },
    private readonly io: RoleIo,
    duration: () => number,
  ) {
    this.until = io.now() + duration();
  }

  tick(): RoleStatus {
    const now = this.io.now();
    if (this.pending !== null) {
      if (this.answered(now)) this.pending = null;
      return 'running';
    }
    if (now >= this.until) return 'done';
    if (!this.walked) {
      this.io.walkTo(this.npcPos);
      this.walked = true;
    }
    if (!this.arrived) {
      if (!near(this.io, this.npcPos)) return 'running';
      this.arrived = true;
      this.nextTry = now + between(this.io.random, MIN, 3 * MIN);
      return 'running';
    }
    if (now < this.nextTry) return 'running';
    const bag = [...this.io.bag().values()];
    const spare = bag.filter((it) => this.items.spares.includes(it.itemId) && (it.abilityOption ?? 0) < MAX_UPGRADE)
      .sort((a, b) => (a.abilityOption ?? 0) - (b.abilityOption ?? 0))[0];
    const material = bag.find((it) => this.items.materials.includes(it.itemId) && it.count > 0);
    if (spare === undefined || material === undefined) {
      this.io.log('upgrade stock used up: refill');
      this.io.onDrop('upgrading');
      return 'done';
    }
    this.io.sendUpgrade(spare.objectId, material.objectId);
    this.pending = { spare: { ...spare }, material: { ...material }, at: now };
    this.nextTry = now + between(this.io.random, MIN, 3 * MIN);
    return 'running';
  }

  busy(): boolean {
    return this.pending !== null;
  }

  stop(): void {}

  /** The spare's upgrade changed or it broke, the material was used, or the answer is overdue. */
  private answered(now: number): boolean {
    const p = this.pending!;
    const bag = this.io.bag();
    const spare = bag.get(p.spare.objectId);
    const material = bag.get(p.material.objectId);
    return spare === undefined || (spare.abilityOption ?? 0) !== (p.spare.abilityOption ?? 0)
      || material === undefined || material.count !== p.material.count || now - p.at > UPGRADE_ANSWER_MS;
  }
}

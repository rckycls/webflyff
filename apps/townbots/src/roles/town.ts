// The town roles: wandering between the places players gather (standing, in combat stance now and then, a motion now
// and then), AFK (one place for the whole role), and upgrading by the upgrade NPC (real tries on the bot's own spare
// gear: everyone nearby sees the success or fail sparkle the server sends). Nobody sits, and a town place another bot
// of the region holds is never taken (`RoleIo.pickPlace`): with none free, the bot stays where it is and asks again.
import type { InventoryItem, Vec3 } from '@flyffweb/protocol';
import { TownWalk } from './route';
import { between } from './types';
import type { RoleIo, RoleRunner, RoleStatus } from './types';

const SEC = 1000;
const MIN = 60 * SEC;
/** The highest upgrade a spare is tried for. */
const MAX_UPGRADE = 10;
/** An upgrade with no answer after this long is over (ms). */
const UPGRADE_ANSWER_MS = 10 * SEC;
/** With every place held by others, a bot asks again after this long (ms). */
const NO_PLACE_WAIT_MS = 30 * SEC;

const pick = <T>(list: readonly T[], random: () => number): T => list[Math.min(list.length - 1, Math.floor(random() * list.length))]!;

export class WanderRole implements RoleRunner {
  readonly role = 'wandering' as const;
  private readonly until: number;
  /** The walk to the next place; one that gets stuck ends where the bot is, which idles there instead. */
  private walk: TownWalk | null = null;
  /** Idle at a place until then. */
  private idleUntil = 0;

  constructor(private readonly town: readonly Vec3[], private readonly io: RoleIo, duration: () => number, private readonly motions: readonly number[]) {
    this.until = io.now() + duration();
  }

  tick(): RoleStatus {
    const now = this.io.now();
    if (now >= this.until) return 'done';
    if (this.walk === null) {
      if (now < this.idleUntil) return 'running';
      const place = this.io.pickPlace(this.town);
      if (place === undefined) {
        this.idleUntil = now + NO_PLACE_WAIT_MS;
        return 'running';
      }
      this.walk = new TownWalk(place, this.io);
    }
    if (this.walk.tick() !== 'walking') {
      this.walk = null;
      this.arrive(now);
    }
    return 'running';
  }

  busy(): boolean { return false; }

  stop(): void {}

  /** At a place, for 10-60 s: plays a friendly motion (1 in 4), takes combat stance (1 in 4), or just stands. */
  private arrive(now: number): void {
    const roll = this.io.random();
    if (roll < 0.25 && this.motions.length > 0) this.io.motion(pick(this.motions, this.io.random));
    else if (roll < 0.5) this.io.combatStance();
    else this.io.peaceStance();
    this.idleUntil = now + between(this.io.random, 10 * SEC, 60 * SEC);
  }
}

export class AfkRole implements RoleRunner {
  readonly role = 'afk' as const;
  private readonly until: number;
  private walk: TownWalk | null = null;
  private settled = false;
  /** No free place: asks again then. */
  private askAt = 0;

  constructor(private readonly town: readonly Vec3[], private readonly io: RoleIo, duration: () => number) {
    this.until = io.now() + duration();
  }

  tick(): RoleStatus {
    const now = this.io.now();
    if (now >= this.until) return 'done';
    if (this.settled) return 'running';
    if (this.walk === null) {
      if (now < this.askAt) return 'running';
      const place = this.io.pickPlace(this.town);
      if (place === undefined) {
        this.askAt = now + NO_PLACE_WAIT_MS;
        return 'running';
      }
      this.walk = new TownWalk(place, this.io);
    }
    // there, or stuck on the way: it settles where it is, one in two in combat stance, the rest just standing
    if (this.walk.tick() !== 'walking') {
      if (this.io.random() < 0.5) this.io.combatStance();
      else this.io.peaceStance();
      this.settled = true;
    }
    return 'running';
  }

  busy(): boolean { return false; }

  stop(): void {}
}

export class UpgradeRole implements RoleRunner {
  readonly role = 'upgrading' as const;
  private readonly until: number;
  private walk: TownWalk | null = null;
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
    if (!this.arrived) {
      this.walk ??= new TownWalk(this.npcPos, this.io);
      const status = this.walk.tick();
      if (status === 'failed') {
        this.io.log('cannot reach the upgrade NPC: another role');
        return 'done';
      }
      if (status !== 'arrived') return 'running';
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

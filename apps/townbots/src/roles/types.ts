// What a role sees of its bot (`RoleIo`, which the runner makes from the bot's body) and what it gives back.
import type { InventoryItem, Vec3 } from '@flyffweb/protocol';
import type { FarmState } from '@flyffweb/client/src/world/autoplay/controller';
import type { AutoPlaySettings } from '@flyffweb/client/src/world/autoplay/settings';
import type { Role } from '../settings';

export type RoleStatus = 'running' | 'done';

export interface RoleRunner {
  readonly role: Role;
  /** Called every rules step: the role's next move. `done` once the role is over (time up, or it cannot go on). */
  tick(): RoleStatus;
  /** Mid-fight or mid-upgrade: not a moment to switch. */
  busy(): boolean;
  /** The role is taken away (the bot leaves the world): stop what runs, close what is open. */
  stop(): void;
}

export interface RoleIo {
  /** Milliseconds, any origin. */
  now(): number;
  random(): number;
  position(): Vec3 | undefined;
  worldId(): number;
  dead(): boolean;
  hpRatio(): number;
  /** A straight walk to `pos`, as a tap on the ground there. */
  walkTo(pos: Vec3): void;
  sitting(): boolean;
  sit(): void;
  stand(): void;
  /** A motion of the Motion window, by its `MOT_BASE_*` id. */
  motion(id: number): void;
  /** REVIVAL_TO_LODESTAR, as the revive window's button. */
  revive(): void;
  /** The bag by object id. */
  bag(): ReadonlyMap<number, InventoryItem>;
  /** ENCHANT: the item, then the material (`upgradeItems.ts`). */
  sendUpgrade(itemObjectId: number, materialObjectId: number): void;
  vendorOpen(title: string): void;
  vendorRegister(slot: number, objectId: number, count: number, cost: number): void;
  vendorClose(): void;
  /** Whether a real player (not a bot) is fighting a monster within `range` of `center`. */
  playersFightingNear(center: Vec3, range: number): boolean;
  /** The bot cannot do `role` any more (out of stock): the planner stops giving it. */
  onDrop(role: Role): void;
  log(line: string): void;
}

/** Auto Play as the farm role drives it (`AutoPlay` and its feed, for one bot). */
export interface FarmControl {
  farm: FarmState;
  start(settings: AutoPlaySettings): boolean;
  /** Every rules step (`WorldScreen.step` calls `autoPlay.step()`). */
  step(): void;
  stop(reason: string): void;
  /** A monster targeted or a fight on (the role does not end mid-fight). */
  fighting(): boolean;
}

/** Ground distance (x, z). */
export function groundDistance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

/** A random whole number of ms from `min` to `max`. */
export function between(random: () => number, min: number, max: number): number {
  return min + Math.floor(random() * (max - min));
}

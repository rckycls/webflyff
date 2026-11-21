// A walk along way points, each a straight walk (V15 has no path finding: the routes are drawn so that each leg is
// clear). A walk that makes no progress is asked again every few seconds; one stuck for 20 s turns back the way it came
// and then reports `failed`.
import type { Vec3 } from '@flyffweb/protocol';
import { groundDistance } from './types';
import type { RoleIo } from './types';

/** Within this of a point, the bot is there (m). */
export const ARRIVE_M = 2;
/** No progress of a metre for this long: the walk is asked again (ms). */
const ASK_AGAIN_MS = 5_000;
/** No progress of a metre for this long: stuck (ms). */
const STUCK_MS = 20_000;

export type WalkStatus = 'walking' | 'arrived' | 'failed';

export class RouteWalker {
  private points: Vec3[];
  private index = 0;
  private asked = false;
  private best = Infinity;
  private progressAt: number;
  private askedAt: number;
  private returning = false;
  private status: WalkStatus = 'walking';

  constructor(points: readonly Vec3[], private readonly io: RoleIo, opts: { reverse?: boolean } = {}) {
    this.points = opts.reverse === true ? [...points].reverse() : [...points];
    this.progressAt = io.now();
    this.askedAt = io.now();
  }

  tick(): WalkStatus {
    if (this.status !== 'walking') return this.status;
    const pos = this.io.position();
    if (pos === undefined) return this.status;
    // past every point already within reach
    while (this.index < this.points.length && groundDistance(pos, this.points[this.index]!) <= ARRIVE_M) this.next();
    if (this.index >= this.points.length) {
      this.status = this.returning ? 'failed' : 'arrived';
      return this.status;
    }
    const target = this.points[this.index]!;
    const now = this.io.now();
    if (!this.asked) {
      this.ask(target, now);
      return this.status;
    }
    const distance = groundDistance(pos, target);
    if (distance < this.best - 1) {
      this.best = distance;
      this.progressAt = now;
    } else if (now - this.progressAt > STUCK_MS) {
      this.turnBack(pos, now);
    } else if (now - this.askedAt > ASK_AGAIN_MS) {
      this.ask(target, now);
    }
    return this.status;
  }

  private next(): void {
    this.index++;
    this.asked = false;
    this.best = Infinity;
  }

  private ask(target: Vec3, now: number): void {
    const pos = this.io.position();
    this.io.walkTo(target);
    this.asked = true;
    this.askedAt = now;
    // a new leg: its distance as it starts is the mark progress is measured from
    if (this.best === Infinity) {
      this.best = pos === undefined ? Infinity : groundDistance(pos, target);
      this.progressAt = now;
    }
  }

  /** Back over the points already passed, the nearest first; nothing passed: failed now. */
  private turnBack(pos: Vec3, now: number): void {
    if (this.returning) {
      this.status = 'failed';
      return;
    }
    this.io.log(`stuck on the way to ${this.points[this.index]!.map(Math.round).join(',')}: turning back`);
    this.returning = true;
    this.points = this.points.slice(0, this.index).reverse();
    this.index = 0;
    this.asked = false;
    this.best = Infinity;
    while (this.index < this.points.length && groundDistance(pos, this.points[this.index]!) <= ARRIVE_M) this.index++;
    if (this.index >= this.points.length) {
      this.status = 'failed';
      return;
    }
    this.ask(this.points[this.index]!, now);
  }
}

/** A town walk that gets stuck is tried from this many different starting places in all before it fails. */
const TOWN_WALK_STARTS = 8;

/**
 * A walk to one place in town, through the places on the way (`RoleIo.pathTo`): the route walker (asked again every
 * few seconds, stuck after 20 s), and `arrived` as soon as the bot is within reach of the place, even in the tick that
 * asked for the walk. A stuck walk starts again from the next nearest place (the nearest may be behind a fence from
 * where the bot stands), `failed` after the 8th.
 */
export class TownWalk {
  private walker: RouteWalker;
  private starts = 1;

  constructor(private readonly target: Vec3, private readonly io: RoleIo) {
    this.walker = new RouteWalker(io.pathTo(target), io);
  }

  tick(): WalkStatus {
    let status = this.walker.tick();
    if (status === 'failed' && this.starts < TOWN_WALK_STARTS) {
      this.walker = new RouteWalker(this.io.pathTo(this.target, this.starts++), this.io);
      status = 'walking';
    }
    const pos = this.io.position();
    if (status === 'walking' && pos !== undefined && groundDistance(pos, this.target) <= ARRIVE_M) return 'arrived';
    return status;
  }
}

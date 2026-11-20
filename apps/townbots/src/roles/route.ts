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

/**
 * A walk to one place in town: the route walker (asked again every few seconds, `failed` after 20 s stuck), and
 * `arrived` as soon as the bot is within reach, even in the tick that asked for the walk.
 */
export class TownWalk {
  private readonly walker: RouteWalker;

  constructor(private readonly target: Vec3, private readonly io: RoleIo) {
    this.walker = new RouteWalker([target], io);
  }

  tick(): WalkStatus {
    const status = this.walker.tick();
    const pos = this.io.position();
    if (status === 'walking' && pos !== undefined && groundDistance(pos, this.target) <= ARRIVE_M) return 'arrived';
    return status;
  }
}

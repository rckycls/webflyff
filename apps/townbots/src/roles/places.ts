// The town places a region's bots hold (where each stands, or is walking to): a bot never takes a place within
// `minApart` of another bot's, so they spread over the town instead of standing in a crowd.
import type { Vec3 } from '@flyffweb/protocol';
import { groundDistance } from './types';

export class PlaceBook {
  private readonly held = new Map<string, Vec3>();

  constructor(private readonly minApart = 8) {}

  /** A random one of `candidates` at least `minApart` from every other bot's place, now `bot`'s; undefined when none is. */
  take(bot: string, candidates: readonly Vec3[], random: () => number): Vec3 | undefined {
    this.held.delete(bot);
    const others = [...this.held.values()];
    const free = candidates.filter((c) => others.every((o) => groundDistance(o, c) >= this.minApart));
    if (free.length === 0) return undefined;
    const place = free[Math.min(free.length - 1, Math.floor(random() * free.length))]!;
    this.held.set(bot, place);
    return place;
  }

  /** The bot left its place (another role, or the world). */
  release(bot: string): void {
    this.held.delete(bot);
  }
}

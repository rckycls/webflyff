// A limit per key (an address, or one key for the whole site) over a sliding hour (website spec §3.4). Kept in memory: a
// restart clears it. Keys with no entries left in the hour are deleted, so the map holds only the last hour's keys.

export const HOUR_MS = 3_600_000;

export class HourlyLimit {
  private readonly entries = new Map<string, number[]>();

  constructor(private readonly max: number, private readonly now: () => number) {}

  /** Whether `key` has fewer than `max` entries in the last hour. */
  allows(key: string): boolean {
    this.sweep();
    return (this.entries.get(key)?.length ?? 0) < this.max;
  }

  add(key: string): void {
    this.sweep();
    const times = this.entries.get(key);
    if (times === undefined) this.entries.set(key, [this.now()]);
    else times.push(this.now());
  }

  /** Takes back the newest entry of `key`: a place reserved for something that did not happen after all. */
  release(key: string): void {
    const times = this.entries.get(key);
    if (times === undefined) return;
    times.pop();
    if (times.length === 0) this.entries.delete(key);
  }

  /** How many keys are kept (for the tests). */
  size(): number {
    return this.entries.size;
  }

  private sweep(): void {
    const oldest = this.now() - HOUR_MS;
    for (const [key, times] of this.entries) {
      // the times are added in order: drop from the front
      let drop = 0;
      while (drop < times.length && times[drop]! <= oldest) drop++;
      if (drop === times.length) this.entries.delete(key);
      else if (drop > 0) times.splice(0, drop);
    }
  }
}

const WINDOW_MS = 1000;

/**
 * A sliding one-second window: `allow()` is true for at most `maxPerSecond` calls in any span of one second, and
 * records the call when it is. A refused call is not recorded, so it does not push the next allowed one back.
 * `now` is the clock in milliseconds (default: a monotonic one).
 */
export class RateWindow {
  /** When the allowed calls of the last second were made, oldest first. At most `maxPerSecond` entries. */
  private readonly calls: number[] = [];

  constructor(
    private readonly maxPerSecond: number,
    private readonly now: () => number = () => performance.now(),
  ) {}

  allow(): boolean {
    const now = this.now();
    // A call leaves the window one second after it was made.
    while (this.calls.length > 0 && now - this.calls[0]! >= WINDOW_MS) this.calls.shift();
    if (this.calls.length >= this.maxPerSecond) return false;
    this.calls.push(now);
    return true;
  }
}

/** Counts the open connections per address, up to `max` each. */
export class AddressCounter {
  private readonly counts = new Map<string, number>();

  constructor(private readonly max: number) {}

  /** Takes a slot for `address`; false, and nothing taken, when it already has `max`. */
  acquire(address: string): boolean {
    const count = this.counts.get(address) ?? 0;
    if (count >= this.max) return false;
    this.counts.set(address, count + 1);
    return true;
  }

  /** Gives a slot back. An address with none taken is left as it is. */
  release(address: string): void {
    const count = this.counts.get(address);
    if (count === undefined) return;
    if (count <= 1) this.counts.delete(address);
    else this.counts.set(address, count - 1);
  }
}

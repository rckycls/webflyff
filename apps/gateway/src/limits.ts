/**
 * A sliding window, one second unless `windowMs` says otherwise: `allow()` is true for at most `maxPerWindow` calls in
 * any span of `windowMs`, and records the call when it is. A refused call is not recorded, so it does not push the
 * next allowed one back. `now` is the clock in milliseconds (default: a monotonic one).
 */
export class RateWindow {
  /** When the allowed calls of the last window were made, oldest first. At most `maxPerWindow` entries. */
  private readonly calls: number[] = [];

  constructor(
    private readonly maxPerWindow: number,
    private readonly now: () => number = () => performance.now(),
    private readonly windowMs = 1000,
  ) {}

  allow(): boolean {
    const now = this.now();
    this.forget(now);
    if (this.calls.length >= this.maxPerWindow) return false;
    this.calls.push(now);
    return true;
  }

  /** True when no recorded call is still inside the window. */
  isIdle(): boolean {
    this.forget(this.now());
    return this.calls.length === 0;
  }

  /** A call leaves the window `windowMs` after it was made. */
  private forget(now: number): void {
    while (this.calls.length > 0 && now - this.calls[0]! >= this.windowMs) this.calls.shift();
  }
}

/**
 * A `RateWindow` per address. An address is forgotten once its window is idle: at most once every `windowMs`, at the
 * start of `allow`, every idle address is swept out, so the map holds only addresses seen in about the last two
 * windows.
 */
export class AddressRate {
  private readonly windows = new Map<string, RateWindow>();
  private lastSweep: number;

  constructor(
    private readonly maxPerWindow: number,
    private readonly windowMs: number,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.lastSweep = now();
  }

  allow(address: string): boolean {
    const now = this.now();
    if (now - this.lastSweep >= this.windowMs) {
      for (const [key, window] of this.windows) if (window.isIdle()) this.windows.delete(key);
      this.lastSweep = now;
    }
    let window = this.windows.get(address);
    if (window === undefined) {
      window = new RateWindow(this.maxPerWindow, this.now, this.windowMs);
      this.windows.set(address, window);
    }
    return window.allow();
  }

  /** How many addresses it remembers. */
  get size(): number {
    return this.windows.size;
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

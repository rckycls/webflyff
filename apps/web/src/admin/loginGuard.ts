// The panel's login limits (admin panel spec §5.3), kept in memory (a restart clears them):
// - 5 failures from one address within 15 minutes: that address is refused for 15 minutes from the 5th;
// - 20 failures from everywhere within an hour: the login is closed for everyone for 1 hour from the 20th.

export type GuardVerdict = 'ok' | 'address_wait' | 'closed';

const ADDRESS_FAILURES = 5;
const ADDRESS_WINDOW_MS = 15 * 60_000;
const ADDRESS_WAIT_MS = 15 * 60_000;
const ALL_FAILURES = 20;
const ALL_WINDOW_MS = 60 * 60_000;
const ALL_CLOSED_MS = 60 * 60_000;

export class LoginGuard {
  private readonly failures = new Map<string, number[]>();
  private readonly waitUntil = new Map<string, number>();
  private all: number[] = [];
  private closedUntil = 0;

  constructor(private readonly now: () => number) {}

  check(address: string): GuardVerdict {
    const now = this.now();
    this.sweep(now);
    if (now < this.closedUntil) return 'closed';
    if (now < (this.waitUntil.get(address) ?? 0)) return 'address_wait';
    return 'ok';
  }

  fail(address: string): void {
    const now = this.now();
    this.sweep(now);
    const times = this.failures.get(address) ?? [];
    times.push(now);
    this.failures.set(address, times);
    if (times.length >= ADDRESS_FAILURES) this.waitUntil.set(address, now + ADDRESS_WAIT_MS);
    this.all.push(now);
    if (this.all.length >= ALL_FAILURES) this.closedUntil = now + ALL_CLOSED_MS;
  }

  succeed(address: string): void {
    this.failures.delete(address);
    this.waitUntil.delete(address);
  }

  /** Drops failures past their window and waits that are over, so the maps hold only live entries. */
  private sweep(now: number): void {
    for (const [address, times] of this.failures) {
      const live = times.filter((t) => now - t < ADDRESS_WINDOW_MS);
      if (live.length === 0) this.failures.delete(address);
      else this.failures.set(address, live);
    }
    for (const [address, until] of this.waitUntil) if (now >= until) this.waitUntil.delete(address);
    this.all = this.all.filter((t) => now - t < ALL_WINDOW_MS);
  }
}

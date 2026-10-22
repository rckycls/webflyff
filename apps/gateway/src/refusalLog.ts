import type { Logger } from './log';

/** Why a connection was refused: before the upgrade (403, 404, 400), or with a close code after it. */
export type RefusalReason = 'origin' | 'path' | 'address' | 'route' | 'per-address' | 'rate' | 'full';

export interface RefusalLogOptions {
  /** How long one period lasts (default 60000 ms). The summary lines say "in the last minute". */
  periodMs?: number;
  /** How many address-and-reason pairs a period names (default 50). */
  maxNamed?: number;
}

/**
 * Logs refused connections without letting a flood fill the log. In each period, the first refusal of an address for
 * a reason is written at once, `refused <address> <reason>`; further ones are counted, and the period's end writes
 * one `refused <address> <reason> x<n> more in the last minute` per pair that had any. Past `maxNamed` pairs, a
 * refusal only adds to one number, written at the end as `refused <n> more connections from other addresses in the
 * last minute`. So a period writes at most 2 × `maxNamed` + 1 lines and keeps at most `maxNamed` pairs, however many
 * addresses are refused. A quiet period writes nothing. The period timer does not keep Node running.
 */
export class RefusalLog {
  private readonly maxNamed: number;
  /** The pairs named this period, `<address> <reason>`, with how many more refusals each had since its line. */
  private readonly repeats = new Map<string, number>();
  private overflow = 0;
  private readonly timer: NodeJS.Timeout;
  private closed = false;

  constructor(private readonly log: Logger, options: RefusalLogOptions = {}) {
    this.maxNamed = options.maxNamed ?? 50;
    this.timer = setInterval(() => this.flush(), options.periodMs ?? 60000);
    this.timer.unref();
  }

  refused(address: string, reason: RefusalReason): void {
    if (this.closed) return;
    const pair = `${address} ${reason}`;
    const repeats = this.repeats.get(pair);
    if (repeats !== undefined) {
      this.repeats.set(pair, repeats + 1);
    } else if (this.repeats.size < this.maxNamed) {
      this.repeats.set(pair, 0);
      this.log.info(`refused ${pair}`);
    } else {
      this.overflow++;
    }
  }

  /** Ends the period: writes its repeat lines, then its overflow line, and starts a new one. */
  flush(): void {
    for (const [pair, repeats] of this.repeats) {
      if (repeats > 0) this.log.info(`refused ${pair} x${repeats} more in the last minute`);
    }
    if (this.overflow > 0) {
      this.log.info(`refused ${this.overflow} more connections from other addresses in the last minute`);
    }
    this.repeats.clear();
    this.overflow = 0;
  }

  /** Writes what is pending and stops; later refusals are not logged. Safe to call twice. */
  close(): void {
    if (this.closed) return;
    this.flush();
    clearInterval(this.timer);
    this.closed = true;
  }
}

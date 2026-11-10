// The refused requests a flood can repeat without end (a wrong page, a body that is not a form, an address past its
// attempts), logged without letting them fill the disk, as the gateway's refusal log does (apps/gateway/src/refusalLog.ts).
// In each minute the first request of a kind (`signup <address> <result>`) is written at once; the rest are counted and
// the minute's end writes `<kind> x<n> more in the last minute`. Past `maxNamed` kinds, a request only adds to one
// number: `<n> more refused requests from other addresses in the last minute`. The timer does not keep Node running.

import type { Logger } from './log';

export interface RefusalLogOptions {
  periodMs?: number;
  maxNamed?: number;
}

export class RefusalLog {
  private readonly maxNamed: number;
  private readonly repeats = new Map<string, number>();
  private overflow = 0;
  private readonly timer: NodeJS.Timeout;

  constructor(private readonly log: Logger, options: RefusalLogOptions = {}) {
    this.maxNamed = options.maxNamed ?? 50;
    this.timer = setInterval(() => this.flush(), options.periodMs ?? 60_000);
    this.timer.unref();
  }

  /** A refusal of the kind `key`; `line` is what the log gets when it is the first of its kind this minute. */
  note(key: string, line: string): void {
    const repeats = this.repeats.get(key);
    if (repeats !== undefined) {
      this.repeats.set(key, repeats + 1);
    } else if (this.repeats.size < this.maxNamed) {
      this.repeats.set(key, 0);
      this.log.info(line);
    } else {
      this.overflow++;
    }
  }

  /** Ends the minute: its repeat lines, then its overflow line. */
  flush(): void {
    for (const [key, repeats] of this.repeats) if (repeats > 0) this.log.info(`${key} x${repeats} more in the last minute`);
    if (this.overflow > 0) this.log.info(`${this.overflow} more refused requests from other addresses in the last minute`);
    this.repeats.clear();
    this.overflow = 0;
  }

  close(): void {
    clearInterval(this.timer);
    this.flush();
  }
}

// When each bot logs in: one login every 5 s at most (the servers' accept limiter counts arrivals from one address, and
// a server restart would otherwise bring all of them back at once), and a bot whose session ended or whose login failed
// waits before it tries again, longer each time (30 s, 60 s, 120 s ... up to 10 minutes). Half an hour in the world
// forgets its waits.

export interface SchedulerOptions {
  gapMs: number;
  firstWaitMs: number;
  maxWaitMs: number;
  resetAfterMs: number;
}

const DEFAULTS: SchedulerOptions = { gapMs: 5_000, firstWaitMs: 30_000, maxWaitMs: 600_000, resetAfterMs: 1_800_000 };

interface BotTimes {
  /** When it may log in next; null while it is logging in or in the world. */
  dueAt: number | null;
  /** The wait before its next try. */
  wait: number;
  enteredAt: number | undefined;
}

export class LoginScheduler {
  private readonly bots = new Map<string, BotTimes>();
  private lastAt = -Infinity;
  private readonly opts: SchedulerOptions;

  constructor(private readonly now: () => number, opts: Partial<SchedulerOptions> = {}) {
    this.opts = { ...DEFAULTS, ...opts };
  }

  /** A bot to log in as soon as its turn comes. */
  add(bot: string): void {
    this.bots.set(bot, { dueAt: this.now(), wait: this.opts.firstWaitMs, enteredAt: undefined });
  }

  /** The bot to log in now, if one is due and the last login was long enough ago. */
  next(): string | undefined {
    const now = this.now();
    if (now - this.lastAt < this.opts.gapMs) return undefined;
    let pick: string | undefined;
    let pickAt = Infinity;
    for (const [bot, times] of this.bots) {
      if (times.dueAt !== null && times.dueAt <= now && times.dueAt < pickAt) {
        pick = bot;
        pickAt = times.dueAt;
      }
    }
    if (pick === undefined) return undefined;
    this.bots.get(pick)!.dueAt = null;
    this.lastAt = now;
    return pick;
  }

  /** The bot is in the world. */
  entered(bot: string): void {
    const times = this.bots.get(bot);
    if (times !== undefined) times.enteredAt = this.now();
  }

  /** Its login failed: it waits, longer next time. */
  failed(bot: string): void {
    this.retry(bot);
  }

  /** Its session ended: it waits, longer next time, unless it had been in the world half an hour. */
  ended(bot: string): void {
    const times = this.bots.get(bot);
    if (times === undefined) return;
    if (times.enteredAt !== undefined && this.now() - times.enteredAt >= this.opts.resetAfterMs) times.wait = this.opts.firstWaitMs;
    this.retry(bot);
  }

  /** Taken out (the program is stopping): never handed out again. */
  remove(bot: string): void {
    this.bots.delete(bot);
  }

  private retry(bot: string): void {
    const times = this.bots.get(bot);
    if (times === undefined) return;
    times.enteredAt = undefined;
    times.dueAt = this.now() + times.wait;
    times.wait = Math.min(times.wait * 2, this.opts.maxWaitMs);
  }
}

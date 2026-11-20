// When a bot renames itself with a Scroll of Name Change (QUERYSETPLAYERNAME, as a player does from the bag): every
// 5-7 hours, or within its first 30 minutes in the world when its name is still an old-style one (`renameSoon`). The
// Database server refuses a name a character has (TID_DIAG_0034, the scroll kept): with no answer within a minute the
// bot tries another name 2 minutes later, up to 3 times, then waits for the next 5-7 hours.

const MIN = 60_000;
const HOUR = 60 * MIN;
/** The first rename of an old-style name: 1-30 minutes in (the scrolls come by item send a moment after entering). */
const SOON: [number, number] = [MIN, 30 * MIN];
const EVERY: [number, number] = [5 * HOUR, 7 * HOUR];
/** No answer after this long: refused (ms). */
const ANSWER_MS = 60_000;
const RETRY_MS = 2 * MIN;
const RETRIES = 3;

export class RenameTimer {
  private dueAt: number;
  private sentAt: number | null = null;
  private retries = 0;

  constructor(private readonly random: () => number, private readonly now: () => number, soon: boolean) {
    this.dueAt = now() + this.span(soon ? SOON : EVERY);
  }

  /** Time for a rename, and none waiting for its answer. */
  due(): boolean {
    return this.sentAt === null && this.now() >= this.dueAt;
  }

  /** A rename was sent and has had no answer yet. */
  waiting(): boolean {
    return this.sentAt !== null;
  }

  /** The rename sent has had no answer for a minute: refused. */
  overdue(): boolean {
    return this.sentAt !== null && this.now() - this.sentAt >= ANSWER_MS;
  }

  sent(): void {
    this.sentAt = this.now();
  }

  /** The bot has its new name: the next in 5-7 hours. */
  answered(): void {
    this.sentAt = null;
    this.retries = 0;
    this.dueAt = this.now() + this.span(EVERY);
  }

  /** Refused (or no scroll to use): another try in 2 minutes, up to 3 times, then the next in 5-7 hours. */
  failed(): void {
    this.sentAt = null;
    if (this.retries < RETRIES) {
      this.retries++;
      this.dueAt = this.now() + RETRY_MS;
    } else {
      this.retries = 0;
      this.dueAt = this.now() + this.span(EVERY);
    }
  }

  private span([min, max]: [number, number]): number {
    return min + this.random() * (max - min);
  }
}

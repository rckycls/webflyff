// A dead bot is revived at the lodestar wherever it died and whatever its role: after 5 s dead (a moment, as a player
// reads the revive window), and again every 10 s while it stays dead (a revival the server did not take).

export class ReviveWatch {
  private deadSince: number | null = null;
  private sentAt: number | null = null;

  constructor(private readonly afterMs = 5_000, private readonly everyMs = 10_000) {}

  /** Whether to send REVIVAL_TO_LODESTAR now. */
  tick(dead: boolean, now: number): boolean {
    if (!dead) {
      this.deadSince = null;
      this.sentAt = null;
      return false;
    }
    this.deadSince ??= now;
    if (now - this.deadSince < this.afterMs) return false;
    if (this.sentAt !== null && now - this.sentAt < this.everyMs) return false;
    this.sentAt = now;
    return true;
  }
}

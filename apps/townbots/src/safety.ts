// The safety net: town bots must never gain EXP or make drops (the World server's town-bot change). If a bot's own EXP
// or level rises, or a drop of a bot's kill appears, the World server lacks that change: every bot stops fighting
// (the other roles go on) and the log says why, once.

export interface ExpState { level: number; exp: number }

const WHY = 'the World server lacks the town-bots change (a bot gained EXP or made a drop): every bot stops fighting';

export class SafetyNet {
  tripped = false;
  private start_: ExpState | undefined;

  constructor(private readonly onTrip: (why: string) => void) {}

  /** The bot's level and EXP as it entered the world. */
  start(state: ExpState): void {
    this.start_ = { ...state };
  }

  /** The bot's level and EXP now (after a SETEXPERIENCE). */
  onOwn(state: ExpState): void {
    const start = this.start_;
    if (start === undefined) return;
    if (state.level > start.level || (state.level === start.level && state.exp > start.exp)) this.trip();
    else this.start_ = { ...state }; // a loss on death lowers the mark
  }

  /** A drop appeared: `ofBot` when the kill that made it was a bot's. */
  onDrop(ofBot: boolean): void {
    if (ofBot) this.trip();
  }

  private trip(): void {
    if (this.tripped) return;
    this.tripped = true;
    this.onTrip(WHY);
  }
}

/** custom (owner 2026-11-15): Auto Play's counts since the farm bot started, for its window and the battery saver. */
import { formatDuration } from '../hud/duration';
import type { AutoPlayEvent } from './stopRules';

export class AutoPlayStats {
  kills = 0;
  exp = 0;
  picked = 0;
  potions = 0;

  /** 2026-11-18 (owner bug "still counting even when stopped"): when the run ended; the time stops there. */
  private ended: number | null = null;

  constructor(readonly started: number) {}

  /** The run ended at `now` (the first end counts). */
  end(now: number): void {
    this.ended ??= now;
  }

  onEvent(e: AutoPlayEvent): void {
    if (e.kind === 'kill') this.kills++;
    else if (e.kind === 'exp') this.exp += Math.max(0, e.gained);
    else if (e.kind === 'picked') this.picked++;
  }

  potionUsed(): void {
    this.potions++;
  }

  lines(now: number): string[] {
    return [
      `Time ${formatDuration((this.ended ?? now) - this.started, 'ms')}`,
      `Kills ${this.kills.toLocaleString('en-US')}`,
      `EXP +${this.exp.toLocaleString('en-US')}`,
      `Items ${this.picked.toLocaleString('en-US')}`,
      `Potions ${this.potions.toLocaleString('en-US')}`,
    ];
  }
}

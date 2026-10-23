// WASD and the arrow keys, as the world view's movement: W / up forward, S / down backward, A / left and D / right
// turn (as the Windows client's keyboard does), Shift runs. Keys are read by `code`, the key's place on the keyboard,
// so the layout does not matter.

/** What the player asks for: forward -1 to 1 (backward to forward), turn -1 to 1 (left to right), and run. */
export interface MoveIntent {
  forward: number;
  turn: number;
  run: boolean;
}

export const NO_INTENT: Readonly<MoveIntent> = { forward: 0, turn: 0, run: false };

const FORWARD = new Set(['KeyW', 'ArrowUp']);
const BACKWARD = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const RUN = new Set(['ShiftLeft', 'ShiftRight']);

type Listen = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

export class KeyboardInput {
  private readonly down = new Set<string>();
  private readonly onKeyDown = (event: Event): void => {
    const { code } = event as KeyboardEvent;
    if (FORWARD.has(code) || BACKWARD.has(code) || LEFT.has(code) || RIGHT.has(code)) event.preventDefault?.();
    this.down.add(code);
  };
  private readonly onKeyUp = (event: Event): void => {
    this.down.delete((event as KeyboardEvent).code);
  };
  /** A key let go while the page had no focus never sends its keyup. */
  private readonly onBlur = (): void => this.reset();

  /** `target` is usually `window`. */
  constructor(private readonly target: Listen) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
  }

  intent(): MoveIntent {
    const any = (keys: Set<string>): boolean => [...keys].some((code) => this.down.has(code));
    return {
      forward: Number(any(FORWARD)) - Number(any(BACKWARD)),
      turn: Number(any(RIGHT)) - Number(any(LEFT)),
      run: any(RUN),
    };
  }

  /** Lets go of every key, as losing the focus does: for a page that was hidden without losing it first. */
  reset(): void {
    this.down.clear();
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.down.clear();
  }
}

const clamp = (v: number): number => Math.max(-1, Math.min(1, v));

/** Two inputs at once (keyboard and joystick): their sums, clamped, and running if either runs. */
export function combineIntents(a: MoveIntent, b: MoveIntent): MoveIntent {
  return { forward: clamp(a.forward + b.forward), turn: clamp(a.turn + b.turn), run: a.run || b.run };
}

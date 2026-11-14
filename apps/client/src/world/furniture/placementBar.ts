// The furniture core's input (2026-11-15): what moves, turns, places and drops the piece `FurniturePlacement` holds.
//
// A computer has Neuz's (placement.ts's header): the mouse moves it, the wheel and Page Up / Page Down turn it, a left press
// places it (the screen's press handler), Escape drops it (the screen's Escape). A touch phone has no wheel, keys or hover,
// so while a piece is placed the touches on the drawing are this file's: a finger drag moves it (no camera turn, no walk),
// and a bar of four buttons in the phone's compact V15 look turns it 45 degrees either way (Page Up, Page Down), places it
// (OK, the left press) and drops it (Cancel, Escape).

import type { FurniturePlacement } from './placement';

/** What the bar's buttons and a computer's press do beyond the placing: the screen places through its feature's packet. */
export interface PlacementActions {
  /** OK (a finger) or the left press (the mouse): `confirm()` and what follows (`TID_GAME_HOUSING_INSTALL_FAIL01`, the request). */
  confirm(): void;
  /** Cancel (a finger). */
  cancel(): void;
}

const PAGE_DOWN = 'PageDown';
const PAGE_UP = 'PageUp';

/** The drawing's point of an event, in normalized device coordinates; null when the drawing has no size. */
function ndcOf(canvas: HTMLElement, event: { clientX: number; clientY: number }): [number, number] | null {
  const box = canvas.getBoundingClientRect();
  if (!(box.width > 0 && box.height > 0)) return null;
  return [((event.clientX - box.left) / box.width) * 2 - 1, 1 - ((event.clientY - box.top) / box.height) * 2];
}

export class PlacementControls {
  /** The phone's bar (shown while placing on a touch screen). */
  readonly bar: HTMLElement;
  private finger: number | null = null;

  constructor(
    private readonly placement: FurniturePlacement,
    private readonly canvas: HTMLElement,
    private readonly keys: EventTarget,
    private readonly actions: PlacementActions,
    private readonly phone: () => boolean,
    doc: Document = document,
  ) {
    const bar = doc.createElement('div');
    bar.className = 'hud-placement-bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Place furniture');
    bar.hidden = true;
    const button = (word: string, label: string, run: () => void): HTMLButtonElement => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.textContent = word;
      b.setAttribute('aria-label', label);
      b.addEventListener('click', (event) => { event.stopPropagation(); run(); });
      return b;
    };
    bar.append(
      button('↺ 45°', 'Turn left', () => placement.step(-1)),
      button('↻ 45°', 'Turn right', () => placement.step(1)),
      button('OK', 'Place', () => actions.confirm()),
      button('Cancel', 'Cancel', () => actions.cancel()),
    );
    this.bar = bar;
    canvas.addEventListener('pointerdown', this.down, true);
    canvas.addEventListener('pointermove', this.move, true);
    canvas.addEventListener('pointerup', this.up, true);
    canvas.addEventListener('pointercancel', this.up, true);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    keys.addEventListener('keydown', this.keyDown);
    keys.addEventListener('keyup', this.keyUp);
  }

  /** Each frame: the bar shows while a piece is placed on a touch screen. */
  update(): void {
    const show = this.placement.active && this.phone();
    if (this.bar.hidden === show) this.bar.hidden = !show;
    if (!this.placement.active) this.finger = null;
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.down, true);
    this.canvas.removeEventListener('pointermove', this.move, true);
    this.canvas.removeEventListener('pointerup', this.up, true);
    this.canvas.removeEventListener('pointercancel', this.up, true);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.keys.removeEventListener('keydown', this.keyDown);
    this.keys.removeEventListener('keyup', this.keyUp);
    this.bar.remove();
  }

  /** A finger's touches are the placing's while it runs: the camera and the walk never hear them. */
  private take(event: PointerEvent): boolean {
    if (!this.placement.active || event.pointerType !== 'touch') return false;
    event.stopImmediatePropagation();
    event.preventDefault();
    return true;
  }

  private readonly down = (event: PointerEvent): void => {
    if (!this.take(event)) return;
    if (this.finger !== null) return; // a second finger does nothing
    this.finger = event.pointerId;
    const ndc = ndcOf(this.canvas, event);
    if (ndc !== null) this.placement.pointer(...ndc);
  };

  private readonly move = (event: PointerEvent): void => {
    if (this.placement.active && event.pointerType !== 'touch') {
      // the mouse: the piece follows it (`GetMousePoint()` each frame); the move goes on to the others
      const ndc = ndcOf(this.canvas, event);
      if (ndc !== null) this.placement.pointer(...ndc);
      return;
    }
    if (!this.take(event) || event.pointerId !== this.finger) return;
    const ndc = ndcOf(this.canvas, event);
    if (ndc !== null) this.placement.pointer(...ndc);
  };

  private readonly up = (event: PointerEvent): void => {
    if (!this.take(event)) return;
    if (event.pointerId === this.finger) this.finger = null;
  };

  /** WM_MOUSEWHEEL (Neuz.cpp:1428-1443): down +2.5, up -2.5; no zoom meanwhile. */
  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.placement.active) return;
    event.preventDefault();
    if (event.deltaY !== 0) this.placement.wheel(event.deltaY > 0);
  };

  private readonly keyDown = (event: Event): void => {
    const key = (event as KeyboardEvent).key;
    if (this.placement.active && (key === PAGE_DOWN || key === PAGE_UP)) event.preventDefault();
  };

  /** WM_KEYUP (:1385-1405): Page Down +45, Page Up -45. */
  private readonly keyUp = (event: Event): void => {
    const key = (event as KeyboardEvent).key;
    if (!this.placement.active) return;
    if (key === PAGE_DOWN) this.placement.step(1);
    else if (key === PAGE_UP) this.placement.step(-1);
  };
}

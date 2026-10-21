// The on-screen joystick for touch screens: a 120 px base at the bottom left, its knob dragged with a finger. Up is
// forward, down backward, left and right turn (as the keyboard's W, S, A and D); pushed all the way it runs.

import type { MoveIntent } from './keyboard';
import { NO_INTENT } from './keyboard';

/** Half the base's 120 px. */
export const JOYSTICK_RADIUS = 60;
/** A push shorter than this share of the radius does nothing, so a resting thumb does not creep. */
const DEAD_ZONE = 0.15;
/** A push this long (as a share of the radius) or longer runs. */
const FULL = 0.95;
const KNOB = 48;
/** Above the nav bar. */
const BOTTOM = 56;
const LEFT = 16;

/** The intent of the knob pushed `(dx, dy)` pixels from the base's centre (y down, as on screen). */
export function joystickIntent(dx: number, dy: number, radius = JOYSTICK_RADIUS): MoveIntent {
  const length = Math.hypot(dx, dy) / radius;
  if (length < DEAD_ZONE) return { ...NO_INTENT };
  const scale = Math.min(length, 1) / length / radius;
  return { forward: 0 - dy * scale, turn: dx * scale, run: length >= FULL };
}

/**
 * True where the main pointer is a finger (phones, tablets). A computer with a touch screen as well as a mouse shows
 * the joystick from its first touch instead (see `onTouch`).
 */
function touchFirst(view: Window | null): boolean {
  return view?.matchMedia?.('(pointer: coarse)').matches === true;
}

export class Joystick {
  private readonly container: HTMLElement;
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;
  private pointer: number | null = null;
  private current: MoveIntent = { ...NO_INTENT };

  constructor(container: HTMLElement) {
    const doc = container.ownerDocument;
    this.base = doc.createElement('div');
    this.base.className = 'joystick';
    this.base.style.cssText =
      `position:absolute;left:${LEFT}px;bottom:${BOTTOM}px;z-index:1000;width:${JOYSTICK_RADIUS * 2}px;` +
      `height:${JOYSTICK_RADIUS * 2}px;border-radius:50%;background:rgba(0,0,0,.25);` +
      'border:2px solid rgba(255,255,255,.35);box-sizing:border-box;touch-action:none;user-select:none;' +
      `display:${touchFirst(doc.defaultView) ? 'block' : 'none'};`;
    this.knob = doc.createElement('div');
    this.knob.style.cssText =
      `position:absolute;left:50%;top:50%;width:${KNOB}px;height:${KNOB}px;margin:${-KNOB / 2}px 0 0 ${-KNOB / 2}px;` +
      'border-radius:50%;background:rgba(255,255,255,.55);pointer-events:none;';
    this.base.append(this.knob);
    container.append(this.base);

    this.container = container;
    container.addEventListener('pointerdown', this.onTouch);
    this.base.addEventListener('pointerdown', this.onDown);
    this.base.addEventListener('pointermove', this.onMove);
    this.base.addEventListener('pointerup', this.onUp);
    this.base.addEventListener('pointercancel', this.onUp);
  }

  intent(): MoveIntent {
    return this.current;
  }

  dispose(): void {
    this.container.removeEventListener('pointerdown', this.onTouch);
    this.base.removeEventListener('pointerdown', this.onDown);
    this.base.removeEventListener('pointermove', this.onMove);
    this.base.removeEventListener('pointerup', this.onUp);
    this.base.removeEventListener('pointercancel', this.onUp);
    this.base.remove();
  }

  /** A finger on the screen: the joystick shows from then on. */
  private readonly onTouch = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') this.base.style.display = 'block';
  };

  private readonly onDown = (event: PointerEvent): void => {
    if (this.pointer !== null) return;
    this.pointer = event.pointerId;
    this.base.setPointerCapture(event.pointerId);
    this.onMove(event);
  };

  private readonly onMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointer) return;
    event.preventDefault();
    const box = this.base.getBoundingClientRect();
    const dx = event.clientX - (box.left + box.width / 2);
    const dy = event.clientY - (box.top + box.height / 2);
    this.current = joystickIntent(dx, dy);
    // the knob follows the finger, but stays on the base
    const length = Math.hypot(dx, dy);
    const k = length > JOYSTICK_RADIUS ? JOYSTICK_RADIUS / length : 1;
    this.knob.style.transform = `translate(${dx * k}px,${dy * k}px)`;
  };

  private readonly onUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointer) return;
    this.pointer = null;
    this.current = { ...NO_INTENT };
    this.knob.style.transform = '';
  };
}

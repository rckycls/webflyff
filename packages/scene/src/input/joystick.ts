// The on-screen joystick for touch screens: a 120 px base at the bottom left, its knob dragged with a finger. Up is
// forward, down backward, left and right turn (as the keyboard's W, S, A and D); pushed all the way it runs.

import type { MoveIntent } from './keyboard';
import { NO_INTENT } from './keyboard';
import { watchTouch } from './touch';
import type { TouchWatch } from './touch';

/** Half the base's 120 px. */
export const JOYSTICK_RADIUS = 60;
/** A push shorter than this share of the radius does nothing, so a resting thumb does not creep. */
const DEAD_ZONE = 0.15;
/** A push under way lasts down to this share (6 px), so a thumb resting on the dead zone's edge does not start and stop. */
const DEAD_ZONE_HELD = 0.1;
/** A push this long (as a share of the radius) or longer runs. */
const FULL = 0.95;
/**
 * Running lasts down to this share (51 px), so a thumb resting at the edge of the base does not switch between walking
 * and running every frame (each switch is a packet to the server).
 */
const FULL_HELD = 0.85;
const KNOB = 48;
/** Above the nav bar. */
const BOTTOM = 56;
const LEFT = 16;

/**
 * The intent of the knob pushed `(dx, dy)` pixels from the base's centre (y down, as on screen). `previous` is the
 * intent of the push before (none for a new touch): a push already under way keeps going a little below the dead zone,
 * and a run keeps running a little below a full push.
 */
export function joystickIntent(dx: number, dy: number, previous: MoveIntent = NO_INTENT, radius = JOYSTICK_RADIUS): MoveIntent {
  const length = Math.hypot(dx, dy) / radius;
  const pushing = previous.forward !== 0 || previous.turn !== 0;
  if (length < (pushing ? DEAD_ZONE_HELD : DEAD_ZONE)) return { ...NO_INTENT };
  const scale = Math.min(length, 1) / length / radius;
  return { forward: 0 - dy * scale, turn: dx * scale, run: length >= (previous.run ? FULL_HELD : FULL) };
}

/** Where the joystick stands. */
export interface JoystickOptions {
  /** Its base's distance from the container's bottom, a CSS length: 56 px (above the nav bar) by default. */
  bottom?: string;
  /** Claim touch presses on the left 40% of the canvas and place the stick under that thumb. */
  floating?: boolean;
  /** A floating drag claimed the pointer, so a pending world tap must be cancelled. */
  onClaim?: () => void;
}

export class Joystick {
  private center: [number, number] | null = null;
  private floatingActive = false;
  private readonly base: HTMLElement;
  private readonly knob: HTMLElement;
  private pointer: number | null = null;
  private current: MoveIntent = { ...NO_INTENT };
  /**
   * The touch rule (`watchTouch`): the joystick shows where the main pointer is a finger, and on a computer with a touch
   * screen as well as a mouse from its first touch on.
   */
  private readonly touch: TouchWatch;

  constructor(private readonly container: HTMLElement, private readonly options: JoystickOptions = {}) {
    const doc = container.ownerDocument;
    this.touch = watchTouch(doc.defaultView ?? window, (touch) => {
      if (!touch) this.reset();
      if (!options.floating) this.base.style.display = touch ? 'block' : 'none';
    });
    this.base = doc.createElement('div');
    this.base.className = 'joystick';
    this.base.style.cssText =
      `position:absolute;left:${LEFT}px;bottom:${options.bottom ?? `${BOTTOM}px`};z-index:1000;width:${JOYSTICK_RADIUS * 2}px;` +
      `height:${JOYSTICK_RADIUS * 2}px;border-radius:50%;background:rgba(0,0,0,.25);` +
      'border:2px solid rgba(255,255,255,.35);box-sizing:border-box;touch-action:none;user-select:none;' +
      `display:${this.touch() ? 'block' : 'none'};`;
    this.knob = doc.createElement('div');
    this.knob.style.cssText =
      `position:absolute;left:50%;top:50%;width:${KNOB}px;height:${KNOB}px;margin:${-KNOB / 2}px 0 0 ${-KNOB / 2}px;` +
      'border-radius:50%;background:rgba(255,255,255,.55);pointer-events:none;';
    this.base.append(this.knob);
    container.append(this.base);
    if (options.floating) {
      this.base.style.display = 'none';
      this.base.style.pointerEvents = 'none';
    }
    const target = options.floating ? container : this.base;
    target.addEventListener('pointerdown', this.onDown, !!options.floating);
    target.addEventListener('pointermove', this.onMove, !!options.floating);
    target.addEventListener('pointerup', this.onUp, !!options.floating);
    target.addEventListener('pointercancel', this.onUp, !!options.floating);
    target.addEventListener('lostpointercapture', this.onLostCapture, !!options.floating);
  }

  intent(): MoveIntent {
    return this.current;
  }

  /**
   * Lets go, as if the finger had lifted: for a page that lost focus or was hidden, where the finger's pointerup may never
   * come. That finger moves the knob no more; the next touch does.
   */
  reset(): void {
    this.pointer = null;
    this.current = { ...NO_INTENT };
    this.knob.style.transform = '';
    this.center = null;
    this.floatingActive = false;
    if (this.options.floating) this.base.style.display = 'none';
  }

  dispose(): void {
    this.touch.dispose();
    const target = this.options.floating ? this.container : this.base;
    target.removeEventListener('pointerdown', this.onDown, !!this.options.floating);
    target.removeEventListener('pointermove', this.onMove, !!this.options.floating);
    target.removeEventListener('pointerup', this.onUp, !!this.options.floating);
    target.removeEventListener('pointercancel', this.onUp, !!this.options.floating);
    target.removeEventListener('lostpointercapture', this.onLostCapture, !!this.options.floating);
    this.base.remove();
  }

  private readonly onDown = (event: PointerEvent): void => {
    if (this.pointer !== null) return;
    if (this.options.floating) {
      if (event.pointerType !== 'touch' || (event.target as HTMLElement | null)?.tagName !== 'CANVAS') return;
      if (this.container.classList.contains('world-modal') || this.container.classList.contains('world-menu-open')) return;
      const box = this.container.getBoundingClientRect();
      if (event.clientX - box.left > box.width * 0.4) return;
      this.center = [event.clientX, event.clientY];
      this.base.style.left = `${event.clientX - box.left - JOYSTICK_RADIUS}px`;
      this.base.style.top = `${event.clientY - box.top - JOYSTICK_RADIUS}px`;
      this.base.style.bottom = 'auto';
      this.base.style.display = 'block';
      // Preserve a short tap for the world; camera input ignores this reserved left-thumb press.
      event.preventDefault();
    }
    this.pointer = event.pointerId;
    if (!this.options.floating) this.base.setPointerCapture(event.pointerId);
    this.onMove(event);
  };

  private readonly onMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointer) return;
    event.preventDefault();
    const box = this.base.getBoundingClientRect();
    const dx = event.clientX - (this.center?.[0] ?? box.left + box.width / 2);
    const dy = event.clientY - (this.center?.[1] ?? box.top + box.height / 2);
    if (this.options.floating) {
      if (!this.floatingActive) {
        if (Math.hypot(dx, dy) <= 8) return;
        this.floatingActive = true;
        this.container.setPointerCapture(event.pointerId);
        this.options.onClaim?.();
      }
      event.stopPropagation();
    }
    this.current = joystickIntent(dx, dy, this.current);
    // the knob follows the finger, but stays on the base
    const length = Math.hypot(dx, dy);
    const k = length > JOYSTICK_RADIUS ? JOYSTICK_RADIUS / length : 1;
    this.knob.style.transform = `translate(${dx * k}px,${dy * k}px)`;
  };

  private readonly onUp = (event: PointerEvent): void => {
    if (event.pointerId === this.pointer) this.reset();
  };

  private readonly onLostCapture = (event: PointerEvent): void => {
    // Ignore the canvas losing its implicit capture when this container takes over the same touch.
    const owner = this.options.floating ? this.container : this.base;
    if (event.target === owner && event.pointerId === this.pointer) this.reset();
  };
}

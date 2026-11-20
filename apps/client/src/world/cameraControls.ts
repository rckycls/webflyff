// The camera's own input: the arrows, a right mouse drag, a touch drag past the same 8px threshold as world taps; and
// 2026-11-20 (mouse-drag, docs/2026-11-20-mouse-drag.md) V15's other mouse camera (`CWndWorld::OnMouseMove`,
// `OnMouseWheel`, `OnRButtonDblClk`, `OnMButtonUp`, `WndWorld.cpp:7121-7613`, and `CWndWorld::Process`'s keys, :8696-8803):
//
//   right drag        on the ground the camera turns from the first pixel, 0.2 degrees a pixel (m_MouseSpeed 1, V15's
//                     only setting: `__SFX_OPT` hides its radios); in the air it steers the flier with the cursor locked
//                     and hidden (`ShowCursor( FALSE )`, the cursor put back in the middle at the edges, :7465-7495)
//   right double click on the ground the camera goes behind the character; in the air the steering without a button
//                     (`m_nMouseMode ^= 1`, :7317-7332) goes on or off
//   middle drag       in the air the camera turns round the flier (:7510-7513); let go, it goes back behind (Unlock)
//   right let go      in the air the camera goes back behind the flier (Unlock, :7143-7144)
//   wheel             the zoom (`BackCamera.wheel`); a laptop's pinch (a wheel with Ctrl) and the phone's pinch too
//   PageUp/PageDown   the zoom, 0.6 a frame
//   arrows            4 degrees a frame round, 2 up and down
//
// A phone keeps its own drag (0.005 rad a pixel, ×1.5 round and ×0.35 up and down, past 8 px). 2026-11-20
// (phone-camera-invert, docs/2026-11-20-phone-camera-invert.md): it turns the view as the phone games' finger drag does
// (`TOUCH_DOWN_SIGN`), and the Option window's "Invert Camera" turns either way round (`touchInvert`).

/** What the camera's input turns, in V15's units (`BackCamera`, with the own mover's angle bound in for `behind`). */
export interface CameraView {
  /** `m_fRotx` and `m_fRoty` in degrees; positive `up` lifts the camera. */
  turn(yaw: number, up: number): void;
  /** Wheel notches, positive rolled toward the player (in). */
  wheel(notches: number): void;
  /** One frame of PageUp (-1) or PageDown (1). */
  page(direction: -1 | 1): void;
  /** The camera behind the own character (a right double click on the ground). */
  behind(): void;
  /** In flight: the camera back behind the flier. */
  unlock(): void;
}

/** `fRotSpeed` for m_MouseSpeed 1 (`WndWorld.cpp:7555-7567`): degrees a pixel. */
export const MOUSE_DEGREES_PER_PIXEL = 0.2;
/**
 * Which way a vertical mouse drag lifts the camera: -1, a drag down lowers it, as this client has had it since Piece 5
 * M1 (`docs/piece5-m1-checkpoint.md`). V15 is the other way (`m_fRoty += dy`, :7586: a drag down lifts the camera): 1.
 */
export const DRAG_UP_SIGN = -1;
/** The phone's finger drag: `rotate`'s pixels for each pixel round, and up and down. */
const TOUCH_TURN = 1.5;
const TOUCH_UP = .35;
/**
 * 2026-11-20 (phone-camera-invert): which way a finger dragged down moves the camera, in `rotate`'s pixels (where a
 * positive dy lowers the camera): -1, a drag down lifts the camera, so the view tilts down, and a drag up tilts it up,
 * as the phone games' finger drag does (PUBG Mobile, Call of Duty Mobile, Roblox: the finger turns the view as a mouse
 * turns a mouse-look camera). From Piece 5 M1 to now it was 1 (a drag down lowered the camera), which players called
 * inverted. Left and right already matched the games (a drag right turns the view right) and stay.
 */
export const TOUCH_DOWN_SIGN = -1;

/** 2026-11-20 (phone-camera-invert): the Option window's "Invert Camera": either axis of the finger drag turned round. */
export interface TouchInvert {
  up: boolean;
  turn: boolean;
}
/** The arrows a frame: 4 degrees round (:8698, :8716), 2 up and down (:8733, :8749). */
const ARROW_YAW = 4;
const ARROW_UP = 2;
/** Windows' double click: within 500 ms and 2 px of the first press (as `TapToWalk`'s). */
const DOUBLE_MS = 500;
const DOUBLE_PX = 2;
/** A wheel event of this many pixels or more is a mouse's notch; smaller ones (a trackpad's) add up to 100 a notch. */
const NOTCH_PIXELS = 100;
const NOTCH_EVENT = 50;
/** The phone's pinch: this many pixels of the fingers' spread make a notch. */
const PINCH_PIXELS = 40;

/** `PointerEvent.buttons`' bit of each `button`. */
const BUTTON_BIT = [1, 4, 2] as const;
const RIGHT = 2;
const MIDDLE = 1;

export class CameraControls {
  private press: { id: number; x: number; y: number; dragging: boolean; touch: boolean } | null = null;
  private readonly arrows = new Set<string>();
  private readonly pages = new Set<string>();
  /** 2026-11-20: the mouse buttons held on the canvas (right, middle), and where the mouse last was. */
  private right = false;
  private middle = false;
  private mouseAt: { x: number; y: number } | null = null;
  private lastRight: { x: number; y: number; time: number } | null = null;
  /** 2026-11-20: `m_nMouseMode == 1`, the flier steered by the mouse alone. */
  private steering = false;
  /** 2026-11-20: the touches on the canvas, for the phone's pinch. */
  private readonly touches = new Map<number, { x: number; y: number }>();
  private pinch: number | null = null;
  private wheelPixels = 0;
  /**
   * Piece 7 M5: in flight a right mouse drag steers the flier (`ControlFlying`'s mouse, Neuz's mode 0): called with each
   * move's pixels, it answers true when it took the move, which then does not turn the camera. Touch drags never steer.
   */
  steer: ((dx: number, dy: number) => boolean) | null = null;
  /** 2026-11-20: the camera in V15's units; without it a mouse drag goes to `rotate` in pixels. */
  view: CameraView | null = null;
  /** 2026-11-20: whether the own mover flies (the air's right drag, middle drag and double click). */
  flying: (() => boolean) | null = null;
  /** 2026-11-20: while true the wheel and PageUp / PageDown do not zoom (a piece of furniture being placed, :7348). */
  zoomBlocked: (() => boolean) | null = null;
  /** 2026-11-20 (phone-camera-invert): the finger drag's inverts, read at each move (the options, kept per browser). */
  touchInvert: (() => TouchInvert) | null = null;

  constructor(
    private readonly canvas: HTMLElement,
    private readonly rotate: (dx: number, dy: number) => void,
    private readonly keys: EventTarget | undefined = canvas.ownerDocument?.defaultView ?? undefined,
  ) {
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('pointercancel', this.cancel);
    canvas.addEventListener('lostpointercapture', this.lost);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.ownerDocument?.addEventListener('pointerlockchange', this.lockChange);
    keys?.addEventListener('keydown', this.keyDown);
    keys?.addEventListener('keyup', this.keyUp);
    keys?.addEventListener('blur', this.blur);
  }

  /** Whether the right button is held on the world (the camera lock waits while it is, `!m_bRButtonDown`, :8011). */
  get rightHeld(): boolean { return this.right; }

  /** Whether the middle button is held on the world (CUR_CAMERA, `OnSetCursor`, `WndWorld.cpp:2567-2571`). */
  get middleHeld(): boolean { return this.middle; }

  /** Whether the flier is steered by the mouse alone (`m_nMouseMode == 1`). */
  get steeringMode(): boolean { return this.steering; }

  /** Read held arrows and PageUp / PageDown once per 60Hz rules step. */
  step(): void {
    const dx = Number(this.arrows.has('ArrowRight')) - Number(this.arrows.has('ArrowLeft'));
    const dy = Number(this.arrows.has('ArrowDown')) - Number(this.arrows.has('ArrowUp'));
    if (dx !== 0 || dy !== 0) {
      if (this.view !== null) this.view.turn(dx * ARROW_YAW, -dy * ARROW_UP);
      else this.rotate(dx * 4, dy * 4);
    }
    if (this.view !== null && this.zoomBlocked?.() !== true) {
      if (this.pages.has('PageUp')) this.view.page(-1);
      if (this.pages.has('PageDown')) this.view.page(1);
    }
    // a landing ends the steering without a button (it is the air's only)
    if (this.steering && this.flying?.() !== true) this.endSteering();
  }

  reset(): void {
    this.press = null;
    this.arrows.clear();
    this.pages.clear();
    this.right = this.middle = false;
    this.mouseAt = null;
    this.touches.clear();
    this.pinch = null;
    this.wheelPixels = 0;
    this.endSteering();
  }

  dispose(): void {
    this.canvas.removeEventListener('pointerdown', this.down);
    this.canvas.removeEventListener('pointermove', this.move);
    this.canvas.removeEventListener('pointerup', this.up);
    this.canvas.removeEventListener('pointercancel', this.cancel);
    this.canvas.removeEventListener('lostpointercapture', this.lost);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.ownerDocument?.removeEventListener('pointerlockchange', this.lockChange);
    this.keys?.removeEventListener('keydown', this.keyDown);
    this.keys?.removeEventListener('keyup', this.keyUp);
    this.keys?.removeEventListener('blur', this.blur);
    this.reset();
  }

  /** The canvas has the pointer locked (the cursor hidden; moves come as movementX / movementY). */
  private locked(): boolean {
    const doc = this.canvas.ownerDocument as Document | null | undefined;
    return doc !== null && doc !== undefined && 'pointerLockElement' in doc && doc.pointerLockElement === this.canvas;
  }

  private lock(): void {
    if (this.locked()) return;
    try {
      const asked = (this.canvas as HTMLElement & { requestPointerLock?: () => unknown }).requestPointerLock?.();
      // newer browsers answer with a promise, which is refused right after the player let it go with Escape
      if (asked instanceof Promise) asked.catch(() => undefined);
    } catch { /* not allowed now: the cursor stays, as before */ }
  }

  private unlockPointer(): void {
    if (!this.locked()) return;
    try { (this.canvas.ownerDocument as Document).exitPointerLock?.(); } catch { /* already gone */ }
  }

  private endSteering(): void {
    if (!this.steering) return;
    this.steering = false;
    if (!this.right) this.unlockPointer();
  }

  /** A mouse button went down (`pointerdown`, or a second button's `pointermove` with its `button`). */
  private mouseDown(event: PointerEvent, button: number): void {
    const flying = this.flying?.() === true;
    if (button === RIGHT) {
      this.right = true;
      const time = event.timeStamp;
      const last = this.lastRight;
      const double = last !== null && time - last.time <= DOUBLE_MS && Math.abs(event.clientX - last.x) <= DOUBLE_PX
        && Math.abs(event.clientY - last.y) <= DOUBLE_PX;
      this.lastRight = double ? null : { x: event.clientX, y: event.clientY, time };
      if (double && flying) {
        // OnRButtonDblClk in the air: the steering without a button on or off (ClipCursor, :7317-7332)
        this.steering = !this.steering;
        if (this.steering) this.lock();
        else this.unlockPointer();
      } else if (double) {
        this.view?.behind(); // on the ground: the camera behind the character (:7336-7339)
      }
      // the air's right drag steers with the cursor hidden (ShowCursor( FALSE ), :7480)
      if (flying && this.steer !== null) this.lock();
    } else if (button === MIDDLE) {
      this.middle = true;
    }
  }

  /** A mouse button let go. */
  private mouseUp(button: number): void {
    if (button === RIGHT && this.right) {
      this.right = false;
      if (!this.steering) this.unlockPointer();
      if (this.flying?.() === true) this.view?.unlock();
    } else if (button === MIDDLE && this.middle) {
      this.middle = false;
      if (this.flying?.() === true) this.view?.unlock();
    }
  }

  private readonly down = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') {
      this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.touches.size === 2) {
        // two fingers on the world: the pinch, and the first finger's drag ends
        this.press = null;
        this.pinch = this.spread();
        return;
      }
      if (event.defaultPrevented || this.press !== null) return;
      this.press = { id: event.pointerId, x: event.clientX, y: event.clientY, dragging: false, touch: true };
      this.canvas.setPointerCapture?.(event.pointerId);
      return;
    }
    if (event.defaultPrevented) return;
    this.mouseAt = { x: event.clientX, y: event.clientY };
    this.mouseDown(event, event.button);
    if (event.button === RIGHT || event.button === MIDDLE) {
      this.press ??= { id: event.pointerId, x: event.clientX, y: event.clientY, dragging: true, touch: false };
      this.canvas.setPointerCapture?.(event.pointerId);
    }
  };

  private readonly move = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') {
      this.touchMove(event);
      return;
    }
    // a second button pressed or let go while one is held comes as a move with its `button` (Pointer Events' chords)
    if (typeof event.buttons === 'number' && event.button >= 0 && event.button <= 2) {
      const held = (event.buttons & BUTTON_BIT[event.button as 0 | 1 | 2]) !== 0;
      if (held) this.mouseDown(event, event.button);
      else this.mouseUp(event.button);
      if (held && (event.button === RIGHT || event.button === MIDDLE)) {
        this.press ??= { id: event.pointerId, x: event.clientX, y: event.clientY, dragging: true, touch: false };
      }
    }
    const locked = this.locked();
    const at = this.mouseAt;
    const dx = locked ? (event.movementX ?? 0) : at === null ? 0 : event.clientX - at.x;
    const dy = locked ? (event.movementY ?? 0) : at === null ? 0 : event.clientY - at.y;
    this.mouseAt = { x: event.clientX, y: event.clientY };
    if (dx === 0 && dy === 0) return;
    const flying = this.flying?.() === true;
    // the air: the right drag (or the steering without a button) steers the flier, the middle drag turns the camera
    if ((this.right || this.steering) && this.steer !== null && this.steer(dx, dy)) event.preventDefault();
    else if (this.right && !flying) this.turnBy(dx, dy, event);
    if (this.middle && flying) this.turnBy(dx, dy, event);
  };

  /** A mouse drag's turn: V15's degrees through `view`, else the old pixels. */
  private turnBy(dx: number, dy: number, event: PointerEvent): void {
    event.preventDefault();
    if (this.view !== null) this.view.turn(dx * MOUSE_DEGREES_PER_PIXEL, DRAG_UP_SIGN * dy * MOUSE_DEGREES_PER_PIXEL);
    else this.rotate(dx, dy);
  }

  private touchMove(event: PointerEvent): void {
    if (this.touches.has(event.pointerId)) this.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pinch !== null && this.touches.size >= 2) {
      const spread = this.spread();
      const change = spread - this.pinch;
      this.pinch = spread;
      // fingers apart: in (as a wheel rolled toward the player)
      if (change !== 0) this.view?.wheel(change / PINCH_PIXELS);
      event.preventDefault();
      return;
    }
    const press = this.press;
    if (press === null || press.id !== event.pointerId) return;
    const dx = event.clientX - press.x;
    const dy = event.clientY - press.y;
    if (!press.dragging && Math.hypot(dx, dy) <= 8) return;
    press.dragging = true;
    press.x = event.clientX;
    press.y = event.clientY;
    event.preventDefault();
    const invert = this.touchInvert?.();
    const turn = invert?.turn === true ? -1 : 1;
    const up = invert?.up === true ? -1 : 1;
    // (+ 0: no -0 for a move along one axis)
    this.rotate(turn * dx * TOUCH_TURN + 0, up * TOUCH_DOWN_SIGN * dy * TOUCH_UP + 0);
  }

  /** How far apart the first two touches are. */
  private spread(): number {
    const [a, b] = [...this.touches.values()];
    return a === undefined || b === undefined ? 0 : Math.hypot(a.x - b.x, a.y - b.y);
  }

  private readonly up = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') {
      this.touches.delete(event.pointerId);
      if (this.touches.size < 2) this.pinch = null;
      if (event.pointerId === this.press?.id) this.press = null;
      return;
    }
    // the last button let go: `pointerup` names it; any other still marked held went with it
    this.mouseUp(event.button);
    if ((event.buttons ?? 0) === 0) {
      if (this.right) this.mouseUp(RIGHT);
      if (this.middle) this.mouseUp(MIDDLE);
      if (event.pointerId === this.press?.id) this.press = null;
    }
  };

  private readonly cancel = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') {
      this.touches.delete(event.pointerId);
      if (this.touches.size < 2) this.pinch = null;
    } else {
      if (this.right) this.mouseUp(RIGHT);
      if (this.middle) this.mouseUp(MIDDLE);
    }
    if (event.pointerId === this.press?.id) this.press = null;
  };

  /** The canvas lost the pointer it kept: as a cancel, except that a pointer lock takes the capture over (the air's steering). */
  private readonly lost = (event: PointerEvent): void => {
    if (event.pointerType !== 'touch' && this.locked()) return;
    this.cancel(event);
  };

  /** The pointer lock ended: Escape (or the page) let it go, so the steering without a button ends too. */
  private readonly lockChange = (): void => {
    if (!this.locked() && this.steering) this.steering = false;
  };

  private readonly onWheel = (event: Event): void => {
    const wheel = event as WheelEvent;
    if (this.view === null || this.zoomBlocked?.() === true) return;
    wheel.preventDefault();
    const pixels = wheel.deltaMode === 1 ? wheel.deltaY * 33 : wheel.deltaMode === 2 ? wheel.deltaY * NOTCH_PIXELS : wheel.deltaY;
    // a laptop's pinch comes as a wheel with Ctrl: as many notches as it moves
    if (wheel.ctrlKey) {
      this.view.wheel(pixels / NOTCH_PIXELS);
      return;
    }
    if (Math.abs(pixels) >= NOTCH_EVENT) {
      this.wheelPixels = 0;
      this.view.wheel(Math.sign(pixels) * Math.max(1, Math.round(Math.abs(pixels) / NOTCH_PIXELS)));
      return;
    }
    this.wheelPixels += pixels;
    while (Math.abs(this.wheelPixels) >= NOTCH_PIXELS) {
      const sign = Math.sign(this.wheelPixels);
      this.view.wheel(sign);
      this.wheelPixels -= sign * NOTCH_PIXELS;
    }
  };

  private readonly keyDown = (event: Event): void => {
    const key = event as KeyboardEvent;
    const arrow = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key.code);
    const page = key.code === 'PageUp' || key.code === 'PageDown';
    if ((!arrow && !page) || event.defaultPrevented) return;
    const field = event.target as HTMLElement | null;
    if (field?.tagName === 'INPUT' || field?.tagName === 'TEXTAREA' || field?.tagName === 'SELECT' || field?.isContentEditable) return;
    if (page && (this.view === null || this.zoomBlocked?.() === true)) return;
    event.preventDefault();
    if (arrow) this.arrows.add(key.code);
    else this.pages.add(key.code);
  };
  private readonly keyUp = (event: Event): void => {
    this.arrows.delete((event as KeyboardEvent).code);
    this.pages.delete((event as KeyboardEvent).code);
  };
  private readonly blur = (): void => this.reset();
}

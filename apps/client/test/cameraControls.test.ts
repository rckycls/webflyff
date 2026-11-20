import { describe, expect, it } from 'vitest';
import { forwardOf } from '@flyffweb/scene';
import { BackCamera } from '../src/world/backCamera';
import { CameraControls, TOUCH_DOWN_SIGN } from '../src/world/cameraControls';
import type { TouchInvert } from '../src/world/cameraControls';

function pointer(target: EventTarget, type: string, id: number, x: number, y: number, button = 0, pointerType = 'touch') {
  target.dispatchEvent(Object.assign(new Event(type), { pointerId: id, clientX: x, clientY: y, button, pointerType }));
}

describe('camera gestures', () => {
  it('uses stronger horizontal and gentler vertical touch drag sensitivity', () => {
    const canvas = new EventTarget();
    const turns: number[][] = [];
    const controls = new CameraControls(canvas as HTMLElement, (x, y) => turns.push([x, y]));
    pointer(canvas, 'pointerdown', 1, 0, 0);
    pointer(canvas, 'pointermove', 1, 20, 20);
    // 2026-11-20 (phone-camera-invert): a drag down is a negative dy for `rotate` (it lifts the camera)
    expect(turns).toEqual([[30, -7]]);
    controls.dispose();
  });

  describe('2026-11-20 (phone-camera-invert): the finger drag turns the view as the phone games do', () => {
    /** A finger dragged by (dx, dy) on a fresh BackCamera through CameraControls, as WorldScreen wires them. */
    function drag(dx: number, dy: number, invert: TouchInvert | null = null): { camera: BackCamera; heading0: number; rotY0: number } {
      const canvas = new EventTarget();
      const camera = new BackCamera();
      camera.heading = 0;
      const rotY0 = camera.rotY;
      const controls = new CameraControls(canvas as HTMLElement, (x, y) => camera.rotate(x, y));
      if (invert !== null) controls.touchInvert = () => invert;
      pointer(canvas, 'pointerdown', 1, 100, 100);
      pointer(canvas, 'pointermove', 1, 100 + dx, 100 + dy);
      controls.dispose();
      return { camera, heading0: 0, rotY0 };
    }
    /** How far the view's new forward leans to its old right: positive, the view turned right. */
    function turnedRight(heading0: number, heading: number): number {
      const [fx, fz] = forwardOf(heading0);
      const [nx, nz] = forwardOf(heading);
      // the screen's right of a camera looking along (fx, fz) with y up is (-fz, fx)
      return nx * -fz + nz * fx;
    }

    it('a finger dragged up tilts the view up (the camera lower); dragged down, down (the camera higher)', () => {
      expect(TOUCH_DOWN_SIGN).toBe(-1);
      const up = drag(0, -40);
      expect(up.camera.rotY).toBeLessThan(up.rotY0);
      const down = drag(0, 40);
      expect(down.camera.rotY).toBeGreaterThan(down.rotY0);
    });

    it('a finger dragged right turns the view right, as before', () => {
      const right = drag(40, 0);
      expect(turnedRight(right.heading0, right.camera.heading!)).toBeGreaterThan(0);
      const left = drag(-40, 0);
      expect(turnedRight(left.heading0, left.camera.heading!)).toBeLessThan(0);
    });

    it('"Invert Camera" turns either axis round, and only that axis', () => {
      const upInverted = drag(0, -40, { up: true, turn: false });
      expect(upInverted.camera.rotY).toBeGreaterThan(upInverted.rotY0);
      const rightUpInverted = drag(40, 0, { up: true, turn: false });
      expect(turnedRight(0, rightUpInverted.camera.heading!)).toBeGreaterThan(0);
      const turnInverted = drag(40, 0, { up: false, turn: true });
      expect(turnedRight(0, turnInverted.camera.heading!)).toBeLessThan(0);
      const upTurnInverted = drag(0, -40, { up: false, turn: true });
      expect(upTurnInverted.camera.rotY).toBeLessThan(upTurnInverted.rotY0);
      const both = drag(40, -40, { up: true, turn: true });
      expect(turnedRight(0, both.camera.heading!)).toBeLessThan(0);
      expect(both.camera.rotY).toBeGreaterThan(both.rotY0);
    });

    it('the inverts are read at each move, so a change in the Option window applies to the next drag at once', () => {
      const canvas = new EventTarget();
      const turns: number[][] = [];
      const invert: TouchInvert = { up: false, turn: false };
      const controls = new CameraControls(canvas as HTMLElement, (x, y) => turns.push([x, y]));
      controls.touchInvert = () => invert;
      pointer(canvas, 'pointerdown', 1, 0, 0);
      pointer(canvas, 'pointermove', 1, 20, 20);
      invert.up = true;
      invert.turn = true;
      pointer(canvas, 'pointermove', 1, 40, 40);
      expect(turns).toEqual([[30, -7], [-30, 7]]);
      controls.dispose();
    });

    it('the mouse drag and the arrows do not read them (desktop unchanged)', () => {
      const canvas = new EventTarget();
      const turns: number[][] = [];
      const controls = new CameraControls(canvas as HTMLElement, (x, y) => turns.push([x, y]));
      controls.touchInvert = () => ({ up: true, turn: true });
      pointer(canvas, 'pointerdown', 1, 10, 10, 2, 'mouse');
      pointer(canvas, 'pointermove', 1, 30, 15, 2, 'mouse');
      expect(turns).toEqual([[20, 5]]);
      controls.dispose();
    });
  });
  it('in flight a right mouse drag steers instead of turning the camera (Piece 7 M5)', () => {
    const canvas = new EventTarget();
    const turns: number[][] = [];
    const steered: number[][] = [];
    const controls = new CameraControls(canvas as HTMLElement, (x, y) => turns.push([x, y]));
    controls.steer = (dx, dy) => { steered.push([dx, dy]); return true; };
    pointer(canvas, 'pointerdown', 1, 0, 0, 2, 'mouse');
    pointer(canvas, 'pointermove', 1, 3, 2, 2, 'mouse'); // no 8 px threshold: every move steers
    pointer(canvas, 'pointermove', 1, 7, 2, 2, 'mouse');
    expect(steered).toEqual([[3, 2], [4, 0]]);
    expect(turns).toEqual([]);
    // a touch drag still turns the camera; on the ground (steer answers false) the mouse does too
    pointer(canvas, 'pointerup', 1, 7, 2, 2, 'mouse');
    controls.steer = () => false;
    pointer(canvas, 'pointerdown', 2, 0, 0, 2, 'mouse');
    pointer(canvas, 'pointermove', 2, 20, 0, 2, 'mouse');
    expect(turns).toEqual([[20, 0]]);
    controls.dispose();
  });

  it('holds arrow keys as camera rotation and releases them on blur', () => {
    const canvas = new EventTarget();
    const keys = new EventTarget();
    const turns: number[][] = [];
    const controls = new CameraControls(canvas as HTMLElement, (x, y) => turns.push([x, y]), keys);
    const press = new Event('keydown', { cancelable: true });
    Object.assign(press, { code: 'ArrowRight' });
    keys.dispatchEvent(press);
    controls.step();
    controls.step();
    expect(turns.length).toBe(2);
    expect(turns[0]![0]).toBeGreaterThan(0);
    expect(press.defaultPrevented).toBe(true);
    keys.dispatchEvent(new Event('blur'));
    controls.step();
    expect(turns.length).toBe(2);
    controls.dispose();
  });
  it('ignores taps and left mouse drags, rotates right mouse drags directly', () => {
    const target = new EventTarget();
    const deltas: number[][] = [];
    const controls = new CameraControls(target as HTMLElement, (x, y) => deltas.push([x, y]));
    pointer(target, 'pointerdown', 1, 10, 10, 0, 'mouse');
    pointer(target, 'pointermove', 1, 50, 20, 0, 'mouse');
    expect(deltas).toEqual([]);
    pointer(target, 'pointerdown', 2, 10, 10, 2, 'mouse');
    pointer(target, 'pointermove', 2, 30, 15, 2, 'mouse');
    pointer(target, 'pointermove', 2, 35, 17, 2, 'mouse');
    expect(deltas).toEqual([[20, 5], [5, 2]]);
    controls.dispose();
  });

  it('accepts a second touch independently and stops on cancel or reset', () => {
    const target = new EventTarget();
    const deltas: number[][] = [];
    const controls = new CameraControls(target as HTMLElement, (x, y) => deltas.push([x, y]));
    pointer(target, 'pointerdown', 42, 10, 10);
    pointer(target, 'pointermove', 42, 13, 11);
    expect(deltas).toEqual([]);
    pointer(target, 'pointermove', 42, 30, 10);
    pointer(target, 'pointercancel', 42, 30, 10);
    pointer(target, 'pointermove', 42, 50, 10);
    expect(deltas).toEqual([[30, 0]]);
    pointer(target, 'pointerdown', 44, 0, 0);
    controls.reset();
    pointer(target, 'pointermove', 44, 40, 0);
    expect(deltas).toHaveLength(1);
    controls.dispose();
  });
});

describe("V15's mouse camera (2026-11-20, mouse-drag: WndWorld.cpp:7121-7613)", () => {
  function mouse(target: EventTarget, type: string, x: number, y: number, button: number, buttons: number, time = 0) {
    const event = Object.assign(new Event(type, { cancelable: true }), {
      pointerId: 1, clientX: x, clientY: y, button, buttons, pointerType: 'mouse',
    });
    Object.defineProperty(event, 'timeStamp', { value: time });
    target.dispatchEvent(event);
  }
  function rig(flying = false) {
    const canvas = new EventTarget();
    const keys = new EventTarget();
    const calls: string[] = [];
    const controls = new CameraControls(canvas as HTMLElement, (x, y) => calls.push(`rotate ${x} ${y}`), keys);
    controls.view = {
      turn: (yaw, up) => calls.push(`turn ${yaw.toFixed(2)} ${up.toFixed(2)}`),
      wheel: (n) => calls.push(`wheel ${n}`),
      page: (d) => calls.push(`page ${d}`),
      behind: () => calls.push('behind'),
      unlock: () => calls.push('unlock'),
    };
    controls.flying = () => flying;
    return { canvas, keys, calls, controls };
  }

  it('a right drag turns the camera from the first pixel, 0.2 degrees a pixel', () => {
    const { canvas, calls } = rig();
    mouse(canvas, 'pointerdown', 100, 100, 2, 2);
    mouse(canvas, 'pointermove', 101, 102, -1, 2);
    mouse(canvas, 'pointermove', 111, 102, -1, 2);
    expect(calls).toEqual(['turn 0.20 -0.40', 'turn 2.00 0.00']);
    mouse(canvas, 'pointerup', 111, 102, 2, 0);
    mouse(canvas, 'pointermove', 150, 102, -1, 0);
    expect(calls).toHaveLength(2);
  });

  it('a right press added to a held left (a chord) turns it too; the left alone never does', () => {
    const { canvas, calls } = rig();
    mouse(canvas, 'pointerdown', 100, 100, 0, 1);
    mouse(canvas, 'pointermove', 120, 100, -1, 1);
    expect(calls).toEqual([]);
    mouse(canvas, 'pointermove', 120, 100, 2, 3);
    mouse(canvas, 'pointermove', 125, 100, -1, 3);
    expect(calls).toEqual(['turn 1.00 0.00']);
  });

  it('the arrows: 4 degrees round, 2 up and down a frame; PageUp / PageDown zoom', () => {
    const { keys, calls, controls } = rig();
    const key = (type: string, code: string) => keys.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { code }));
    key('keydown', 'ArrowLeft');
    key('keydown', 'ArrowUp');
    key('keydown', 'PageDown');
    controls.step();
    expect(calls).toEqual(['turn -4.00 2.00', 'page 1']);
    key('keyup', 'ArrowLeft');
    key('keyup', 'ArrowUp');
    key('keyup', 'PageDown');
    key('keydown', 'PageUp');
    controls.zoomBlocked = () => true; // a piece of furniture being placed
    controls.step();
    expect(calls).toHaveLength(2);
  });

  it('the wheel: a mouse notch is one, small deltas add up to 100 a notch, and Ctrl (a laptop pinch) as it moves', () => {
    const { canvas, calls } = rig();
    const wheel = (deltaY: number, ctrlKey = false) =>
      canvas.dispatchEvent(Object.assign(new Event('wheel', { cancelable: true }), { deltaY, deltaMode: 0, ctrlKey }));
    wheel(100);
    wheel(-120);
    wheel(30);
    wheel(30);
    wheel(30);
    expect(calls).toEqual(['wheel 1', 'wheel -1']);
    wheel(30);
    expect(calls).toEqual(['wheel 1', 'wheel -1', 'wheel 1']);
    wheel(-50, true);
    expect(calls.at(-1)).toBe('wheel -0.5');
  });

  it('a right double click on the ground puts the camera behind the character', () => {
    const { canvas, calls } = rig();
    mouse(canvas, 'pointerdown', 100, 100, 2, 2, 1000);
    mouse(canvas, 'pointerup', 100, 100, 2, 0, 1050);
    mouse(canvas, 'pointerdown', 101, 100, 2, 2, 1200);
    expect(calls).toEqual(['behind']);
  });

  it('in the air: the right drag steers; let go, the camera goes back behind; the middle drag turns the camera', () => {
    const { canvas, calls, controls } = rig(true);
    const steered: number[][] = [];
    controls.steer = (dx, dy) => { steered.push([dx, dy]); return true; };
    mouse(canvas, 'pointerdown', 100, 100, 2, 2);
    mouse(canvas, 'pointermove', 104, 102, -1, 2);
    mouse(canvas, 'pointerup', 104, 102, 2, 0);
    expect(steered).toEqual([[4, 2]]);
    expect(calls).toEqual(['unlock']);
    mouse(canvas, 'pointerdown', 100, 100, 1, 4);
    mouse(canvas, 'pointermove', 110, 100, -1, 4);
    mouse(canvas, 'pointerup', 110, 100, 1, 0);
    expect(calls).toEqual(['unlock', 'turn 2.00 0.00', 'unlock']);
  });

  it('in the air a right double click steers without a button until the next one or the landing', () => {
    let flying = true;
    const canvas = new EventTarget();
    const controls = new CameraControls(canvas as HTMLElement, () => {});
    controls.flying = () => flying;
    const steered: number[][] = [];
    controls.steer = (dx, dy) => { steered.push([dx, dy]); return true; };
    mouse(canvas, 'pointerdown', 100, 100, 2, 2, 1000);
    mouse(canvas, 'pointerup', 100, 100, 2, 0, 1050);
    mouse(canvas, 'pointerdown', 100, 100, 2, 2, 1200);
    mouse(canvas, 'pointerup', 100, 100, 2, 0, 1250);
    expect(controls.steeringMode).toBe(true);
    mouse(canvas, 'pointermove', 103, 100, -1, 0);
    expect(steered).toEqual([[3, 0]]);
    flying = false;
    controls.step();
    expect(controls.steeringMode).toBe(false);
  });

  it("the phone's pinch zooms: fingers apart go in", () => {
    const { canvas, calls } = rig();
    pointer(canvas, 'pointerdown', 1, 100, 100);
    pointer(canvas, 'pointerdown', 2, 140, 100);
    pointer(canvas, 'pointermove', 2, 220, 100);
    expect(calls).toEqual(['wheel 2']);
  });
});

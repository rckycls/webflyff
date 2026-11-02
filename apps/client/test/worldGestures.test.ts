// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Joystick } from '@flyffweb/scene';
import { CameraControls } from '../src/world/cameraControls';
import { TapToWalk } from '../src/world/controls';

function pointer(target: HTMLElement, type: string, id: number, x: number, y: number, primary = true): void {
  target.dispatchEvent(Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
    pointerId: id, pointerType: 'touch', isPrimary: primary, button: 0, clientX: x, clientY: y,
  }));
}

describe('world touch ownership', () => {
  it('lets a stationary left-side touch select, while a left-side drag belongs to the joystick', () => {
    const root = document.createElement('div');
    const canvas = document.createElement('canvas');
    root.append(canvas);
    document.body.append(root);
    root.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 400 }) as DOMRect;
    canvas.getBoundingClientRect = root.getBoundingClientRect;
    root.setPointerCapture = () => {};
    canvas.setPointerCapture = () => {};
    const selected: number[] = [];
    const tap = new TapToWalk(canvas, () => ({ mover: 7 }), undefined, (press) => selected.push(press.mover!));
    const joystick = new Joystick(root, { floating: true, onClaim: () => tap.reset() });
    const rotations: number[][] = [];
    const camera = new CameraControls(canvas, (dx, dy) => rotations.push([dx, dy]));
    pointer(canvas, 'pointerdown', 1, 100, 250);
    pointer(canvas, 'pointerup', 1, 100, 250);
    expect(selected).toEqual([7]);
    pointer(canvas, 'pointerdown', 2, 100, 250);
    pointer(canvas, 'pointermove', 2, 100, 190);
    pointer(root, 'pointerup', 2, 100, 190);
    expect(selected).toEqual([7]);
    expect(rotations).toEqual([]);
    camera.dispose();
    joystick.dispose();
    tap.dispose();
    root.remove();
  });
  it('holds a floating left stick while a second finger rotates the camera, without selecting a mover', () => {
    const root = document.createElement('div');
    const canvas = document.createElement('canvas');
    root.append(canvas);
    document.body.append(root);
    root.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 400 }) as DOMRect;
    canvas.getBoundingClientRect = root.getBoundingClientRect;
    root.setPointerCapture = () => {};
    canvas.setPointerCapture = () => {};
    const joystick = new Joystick(root, { floating: true });
    const rotates: number[][] = [];
    const selects: number[] = [];
    const camera = new CameraControls(canvas, (dx, dy) => rotates.push([dx, dy]));
    const tap = new TapToWalk(canvas, () => ({ mover: 7 }), undefined, (press) => selects.push(press.mover!));
    pointer(canvas, 'pointerdown', 1, 100, 250);
    pointer(root, 'pointermove', 1, 100, 190);
    expect(joystick.intent().forward).toBe(1);
    // Browsers implicitly capture touches on the canvas. Transferring to the stick emits this descendant event.
    pointer(canvas, 'lostpointercapture', 1, 100, 190);
    expect(joystick.intent().forward).toBe(1);
    pointer(root, 'pointermove', 1, 100, 220);
    expect(joystick.intent().forward).toBeCloseTo(.5);
    pointer(root, 'pointermove', 1, 100, 190);
    pointer(canvas, 'pointerdown', 3, 700, 150, false);
    pointer(canvas, 'pointermove', 3, 703, 152, false);
    pointer(canvas, 'pointerup', 3, 703, 152, false);
    expect(selects).toEqual([7]);
    expect(rotates).toEqual([]);
    expect(joystick.intent().forward).toBe(1);
    selects.length = 0;
    pointer(canvas, 'pointerdown', 2, 700, 150, false);
    pointer(canvas, 'pointermove', 2, 730, 150, false);
    expect(rotates).toEqual([[45, 0]]);
    expect(joystick.intent().forward).toBe(1);
    expect(selects).toEqual([]);
    pointer(canvas, 'pointerup', 2, 730, 150, false);
    pointer(root, 'pointerup', 1, 100, 190);
    expect(joystick.intent().forward).toBe(0);
    joystick.reset();
    camera.dispose();
    tap.dispose();
    joystick.dispose();
    root.remove();
  });
});

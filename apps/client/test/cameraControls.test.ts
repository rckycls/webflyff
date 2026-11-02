import { describe, expect, it } from 'vitest';
import { CameraControls } from '../src/world/cameraControls';

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
    expect(turns).toEqual([[30, 7]]);
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

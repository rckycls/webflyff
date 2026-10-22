import { describe, expect, it } from 'vitest';
import { JOYSTICK_RADIUS, joystickIntent } from '../src/input/joystick';
import { KeyboardInput, combineIntents } from '../src/input/keyboard';

function key(type: 'keydown' | 'keyup', code: string): Event {
  return Object.assign(new Event(type), { code });
}

describe('KeyboardInput', () => {
  it('maps WASD and the arrows to forward and turn, Shift to run', () => {
    const target = new EventTarget();
    const keyboard = new KeyboardInput(target);
    expect(keyboard.intent()).toEqual({ forward: 0, turn: 0, run: false });

    target.dispatchEvent(key('keydown', 'KeyW'));
    target.dispatchEvent(key('keydown', 'KeyD'));
    expect(keyboard.intent()).toEqual({ forward: 1, turn: 1, run: false });

    target.dispatchEvent(key('keydown', 'ShiftLeft'));
    expect(keyboard.intent().run).toBe(true);

    target.dispatchEvent(key('keyup', 'KeyW'));
    target.dispatchEvent(key('keyup', 'KeyD'));
    target.dispatchEvent(key('keydown', 'ArrowDown'));
    target.dispatchEvent(key('keydown', 'ArrowLeft'));
    expect(keyboard.intent()).toEqual({ forward: -1, turn: -1, run: true });

    target.dispatchEvent(key('keydown', 'KeyS'));
    target.dispatchEvent(key('keydown', 'KeyW'));
    expect(keyboard.intent().forward).toBe(0);
  });

  it('lets go of every key when the window loses focus', () => {
    const target = new EventTarget();
    const keyboard = new KeyboardInput(target);
    target.dispatchEvent(key('keydown', 'KeyW'));
    target.dispatchEvent(new Event('blur'));
    expect(keyboard.intent()).toEqual({ forward: 0, turn: 0, run: false });
  });

  it('stops listening on dispose', () => {
    const target = new EventTarget();
    const keyboard = new KeyboardInput(target);
    keyboard.dispose();
    target.dispatchEvent(key('keydown', 'KeyW'));
    expect(keyboard.intent().forward).toBe(0);
  });
});

describe('joystickIntent', () => {
  it('has a 120 px base', () => {
    expect(JOYSTICK_RADIUS * 2).toBe(120);
  });

  it('pushes forward when the knob goes up, turns with left and right', () => {
    const intent = joystickIntent(0, -30);
    expect(intent.forward).toBeCloseTo(0.5);
    expect(intent.turn).toBeCloseTo(0);
    expect(intent.run).toBe(false);
    expect(joystickIntent(30, 0).turn).toBeCloseTo(0.5);
  });

  it('runs at full push, and clamps beyond the base', () => {
    const full = joystickIntent(0, -JOYSTICK_RADIUS);
    expect(full).toEqual({ forward: 1, turn: 0, run: true });
    const beyond = joystickIntent(300, -400);
    expect(beyond.forward).toBeCloseTo(0.8);
    expect(beyond.turn).toBeCloseTo(0.6);
    expect(beyond.run).toBe(true);
  });

  it('ignores a small push (dead zone)', () => {
    expect(joystickIntent(3, -4)).toEqual({ forward: 0, turn: 0, run: false });
  });
});

describe('combineIntents', () => {
  it('adds the inputs up, clamped, and runs if any says run', () => {
    expect(
      combineIntents({ forward: 1, turn: 0, run: false }, { forward: 0.5, turn: -0.25, run: true }),
    ).toEqual({ forward: 1, turn: -0.25, run: true });
  });
});

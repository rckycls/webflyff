import { describe, expect, it } from 'vitest';
import { JOYSTICK_RADIUS, Joystick, joystickIntent } from '../src/input/joystick';
import { KeyboardInput, NO_INTENT, combineIntents } from '../src/input/keyboard';

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

  it('lets go of every key on reset', () => {
    const target = new EventTarget();
    const keyboard = new KeyboardInput(target);
    target.dispatchEvent(key('keydown', 'KeyW'));
    target.dispatchEvent(key('keydown', 'ShiftLeft'));
    keyboard.reset();
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

  it('keeps running down to 0.85 of the radius once it runs, so a thumb at the edge does not switch every frame', () => {
    const running = joystickIntent(0, -58); // 0.97: runs
    expect(running.run).toBe(true);
    expect(joystickIntent(0, -56).run).toBe(false); // 0.93, from walking: still walks
    expect(joystickIntent(0, -56, running).run).toBe(true); // from running: still runs
    expect(joystickIntent(0, -52, running).run).toBe(true);
    expect(joystickIntent(0, -50, running).run).toBe(false); // 0.83: walks again
  });

  it('keeps pushing down to 0.10 of the radius once it pushes, so a thumb at the dead zone\'s edge does not start and stop', () => {
    const pushing = joystickIntent(0, -10); // 0.17: out of the dead zone
    expect(pushing.forward).toBeCloseTo(10 / 60);
    expect(joystickIntent(0, -8)).toEqual(NO_INTENT); // 0.13, from rest: inside it
    expect(joystickIntent(0, -8, pushing).forward).toBeCloseTo(8 / 60); // from a push: still pushing
    expect(joystickIntent(0, -5, pushing)).toEqual(NO_INTENT); // 0.08: let go
  });
});

/** Just enough of an element for the joystick: children, listeners, a style, a 120 px box at (0, 0), pointer capture. */
class FakeElement {
  className = '';
  readonly style: Record<string, string> = { cssText: '' };
  readonly children: FakeElement[] = [];
  readonly listeners = new Map<string, (event: unknown) => void>();
  constructor(readonly ownerDocument: FakeDocument) {}
  append(...nodes: FakeElement[]): void {
    this.children.push(...nodes);
  }
  remove(): void {}
  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(type, listener);
  }
  removeEventListener(type: string): void {
    this.listeners.delete(type);
  }
  getBoundingClientRect(): { left: number; top: number; width: number; height: number } {
    return { left: 0, top: 0, width: 2 * JOYSTICK_RADIUS, height: 2 * JOYSTICK_RADIUS };
  }
  setPointerCapture(): void {}
}

class FakeDocument {
  readonly defaultView = { matchMedia: () => ({ matches: true }) };
  readonly created: FakeElement[] = [];
  createElement(): FakeElement {
    const element = new FakeElement(this);
    this.created.push(element);
    return element;
  }
}

/** A joystick on a fake page, and a finger to put on its base at a point counted from the base's centre. */
function stick() {
  const doc = new FakeDocument();
  const joystick = new Joystick(new FakeElement(doc) as unknown as HTMLElement);
  const [base, knob] = doc.created as [FakeElement, FakeElement];
  const finger = (type: string, dx: number, dy: number, pointerId = 1): void => {
    base.listeners.get(type)!({
      pointerId, pointerType: 'touch', clientX: JOYSTICK_RADIUS + dx, clientY: JOYSTICK_RADIUS + dy, preventDefault() {},
    });
  };
  return { joystick, knob, finger };
}

describe('Joystick', () => {
  it('follows the finger, remembers that it ran, and lets go when the finger lifts', () => {
    const { joystick, knob, finger } = stick();
    finger('pointerdown', 0, -30);
    expect(joystick.intent().forward).toBeCloseTo(0.5);
    finger('pointermove', 0, -58);
    expect(joystick.intent().run).toBe(true);
    finger('pointermove', 0, -56);
    expect(joystick.intent().run).toBe(true);
    expect(knob.style.transform).toBe('translate(0px,-56px)');
    finger('pointerup', 0, -56);
    expect(joystick.intent()).toEqual(NO_INTENT);
    expect(knob.style.transform).toBe('');
  });

  it('reset lets go of a push whose finger never lifted, and that finger moves it no more', () => {
    const { joystick, knob, finger } = stick();
    finger('pointerdown', 0, -50);
    expect(joystick.intent().forward).toBeGreaterThan(0);
    joystick.reset();
    expect(joystick.intent()).toEqual(NO_INTENT);
    expect(knob.style.transform).toBe('');
    finger('pointermove', 0, -50);
    expect(joystick.intent()).toEqual(NO_INTENT);
    // a new touch works as before
    finger('pointerdown', 0, -30, 2);
    expect(joystick.intent().forward).toBeCloseTo(0.5);
  });
});

describe('combineIntents', () => {
  it('adds the inputs up, clamped, and runs if any says run', () => {
    expect(
      combineIntents({ forward: 1, turn: 0, run: false }, { forward: 0.5, turn: -0.25, run: true }),
    ).toEqual({ forward: 1, turn: -0.25, run: true });
  });
});

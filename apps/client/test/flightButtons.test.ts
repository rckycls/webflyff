// @vitest-environment jsdom
// The phone's flight buttons (Piece 7 M5, Decision 4): Accelerate held, Turbo and Land, shown only while flying.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { FlightButtons } from '../src/world/hud/flightButtons';

const touch = (type: string): Event => Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
  pointerType: 'touch', pointerId: 1, isPrimary: true, button: 0,
});

afterEach(() => {
  document.body.replaceChildren();
});

function rig() {
  const actions = { accelerate: vi.fn(), turbo: vi.fn(), land: vi.fn() };
  const buttons = new FlightButtons(document, actions);
  document.body.append(buttons.element);
  const button = (name: string) => buttons.element.querySelector<HTMLButtonElement>(`[data-flight="${name}"]`)!;
  return { actions, buttons, button };
}

describe('FlightButtons', () => {
  it('Accelerate reports held on press and let-go', () => {
    const { actions, buttons, button } = rig();
    buttons.update(true, false);
    button('accelerate').dispatchEvent(touch('pointerdown'));
    expect(actions.accelerate.mock.calls).toEqual([[true]]);
    button('accelerate').dispatchEvent(touch('pointerup'));
    expect(actions.accelerate.mock.calls).toEqual([[true], [false]]);
    buttons.dispose();
  });

  it('Turbo and Land run their actions; Turbo only with fuel for it', () => {
    const { actions, buttons, button } = rig();
    buttons.update(true, false);
    expect(button('turbo').disabled).toBe(true);
    button('turbo').dispatchEvent(touch('pointerdown'));
    expect(actions.turbo).not.toHaveBeenCalled();
    buttons.update(true, true);
    button('turbo').dispatchEvent(touch('pointerdown'));
    button('land').dispatchEvent(touch('pointerdown'));
    expect(actions.turbo).toHaveBeenCalledTimes(1);
    expect(actions.land).toHaveBeenCalledTimes(1);
    expect(button('land').getAttribute('aria-label')).toBe('Land');
    buttons.dispose();
  });

  it('they show only while flying', () => {
    const { buttons, button } = rig();
    expect(buttons.element.hidden).toBe(true);
    buttons.update(true, true);
    expect(buttons.element.hidden).toBe(false);
    expect(button('accelerate').disabled).toBe(false);
    buttons.update(false, true);
    expect(buttons.element.hidden).toBe(true);
    expect(button('accelerate').disabled).toBe(true);
    buttons.dispose();
  });
});

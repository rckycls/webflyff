// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { DropBox } from '../src/world/hud/dropBox';

const ART = { url: (key: string) => key, sheets: null };
let boxes: DropBox[] = [];
afterEach(() => {
  for (const box of boxes) box.dispose();
  boxes = [];
  document.body.replaceChildren();
});

function make() {
  const box = new DropBox(ART, document);
  boxes.push(box);
  document.body.append(box.element);
  const calls: string[] = [];
  box.onReconnect = () => calls.push('reconnect');
  box.onBack = () => calls.push('back');
  const button = (name: string) => box.element.querySelector<HTMLButtonElement>(`[data-button="${name}"]`)!;
  return { box, calls, button };
}

describe('DropBox (Piece 6 M3: the world dropped, in a Neuz message box)', () => {
  it('shows the reason, Reconnect and Back to login', () => {
    const { box, button } = make();
    box.show({ text: 'The connection to the game was lost.', canReconnect: true, busy: false }, 800);
    expect(box.isOpen).toBe(true);
    expect(box.element.textContent).toContain('The connection to the game was lost.');
    expect(button('reconnect').textContent).toBe('Reconnect');
    expect(button('back').textContent).toBe('Back to login');
    expect(button('reconnect').hidden).toBe(false);
    expect(button('reconnect').disabled).toBe(false);
  });

  it('greys Reconnect while an attempt runs, and hides it once the login is gone', () => {
    const { box, button } = make();
    box.show({ text: 'Reconnecting…', canReconnect: true, busy: true }, 800);
    expect(button('reconnect').disabled).toBe(true);
    expect(box.element.textContent).toContain('Reconnecting…');
    box.show({ text: 'The saved login has expired.', canReconnect: false, busy: false }, 800);
    expect(button('reconnect').hidden).toBe(true);
    expect(button('back').hidden).toBe(false);
  });

  it('calls each button\'s callback once a press', () => {
    const { box, calls, button } = make();
    box.show({ text: 'x', canReconnect: true, busy: false }, 800);
    button('reconnect').click();
    button('back').click();
    expect(calls).toEqual(['reconnect', 'back']);
  });

  it('is not closed by Escape, and has no close button', () => {
    const { box } = make();
    box.show({ text: 'x', canReconnect: true, busy: false }, 800);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(box.isOpen).toBe(true);
    expect(box.element.querySelector('.hud-window-close')).toBeNull();
  });
});

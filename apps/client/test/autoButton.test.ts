// @vitest-environment jsdom
// custom (owner 2026-11-15): the AUTO button and the stopped title (hud/autoPlay/autoButton.ts).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AutoButton, flashStoppedTitle } from '../src/world/hud/autoPlay/autoButton';

/** A finger's pointer event (jsdom's boxes are all 0 x 0 at 0, 0: (0, 0) is on a button, anything else off it). */
function finger(type: string, id: number, x = 0, y = 0): Event {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperties(event, { pointerType: { value: 'touch' }, pointerId: { value: id } });
  return event;
}

afterEach(() => { document.body.replaceChildren(); });

function rig() {
  let opened = 0;
  const play = {
    farm: 'off' as 'off' | 'running' | 'stopped',
    lastStop: null as string | null,
    start: () => { play.farm = 'running'; play.lastStop = null; return true; },
    stop: (reason: string) => { play.farm = 'stopped'; play.lastStop = reason; },
    startMode: () => { play.farm = 'running'; play.lastStop = null; modeStarts++; return true; },
  };
  let modeStarts = 0;
  const button = new AutoButton(play, () => { opened++; }, document);
  document.body.append(button.element);
  return { button, play, opened: () => opened, modeStarts: () => modeStarts };
}

describe('AutoButton', () => {
  it("is Auto Play's own icon, no word (2026-11-20, owner: \"move Autoplay button icon to the place of Auto icon\")", () => {
    const { button } = rig();
    expect(button.element.textContent).toBe('');
    expect(button.element.getAttribute('aria-label')).toBe('Auto Play');
    expect(button.element.querySelector<HTMLElement>('.hud-auto-icon')!.style.backgroundImage).toMatch(/icon_autoplay\.png/);
  });

  it('a click starts the farm bot, a second click stops it', () => {
    const { button, play } = rig();
    button.element.click();
    expect(play.farm).toBe('running');
    button.refresh();
    expect(button.element.dataset.state).toBe('running');
    button.element.click();
    expect(play.lastStop).toBe('you took control');
  });

  it('shows ! after a stop, with the reason, and clears it on the next start', () => {
    const { button, play } = rig();
    play.farm = 'stopped';
    play.lastStop = 'you died';
    button.refresh();
    expect(button.element.dataset.state).toBe('stopped');
    expect(button.element.querySelector('.hud-auto-mark')!.textContent).toBe('!');
    expect(button.element.title).toBe('Auto Play stopped: you died');
    button.element.click();
    button.refresh();
    expect(button.element.dataset.state).toBe('running');
    expect(button.element.querySelector('.hud-auto-mark')!.textContent).toBe('');
  });

  it('a right-click opens the window and starts nothing', () => {
    const { button, play, opened } = rig();
    button.element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    expect(opened()).toBe(1);
    expect(play.farm).toBe('off');
  });
});

describe('AutoButton on a phone (M4)', () => {
  it("a finger's lift starts it (a second finger's too, while the first walks), and the click after it does nothing", () => {
    const { button, play } = rig();
    button.element.dispatchEvent(finger('pointerdown', 2));
    button.element.dispatchEvent(finger('pointerup', 2));
    expect(play.farm).toBe('running');
    button.element.click();
    expect(play.farm).toBe('running');
  });

  it("a finger's long press opens the window and its lift starts nothing", () => {
    vi.useFakeTimers();
    try {
      const { button, play, opened } = rig();
      button.element.dispatchEvent(finger('pointerdown', 3));
      vi.advanceTimersByTime(500);
      expect(opened()).toBe(1);
      button.element.dispatchEvent(finger('pointerup', 3));
      button.element.click();
      expect(play.farm).toBe('off');
    } finally {
      vi.useRealTimers();
    }
  });

  it('a long press (500 ms) opens the window and the click after it starts nothing; a short tap starts', () => {
    vi.useFakeTimers();
    try {
      const { button, play, opened } = rig();
      button.element.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      vi.advanceTimersByTime(499);
      expect(opened()).toBe(0);
      vi.advanceTimersByTime(1);
      expect(opened()).toBe(1);
      button.element.dispatchEvent(new Event('pointerup', { bubbles: true }));
      button.element.click();
      expect(play.farm).toBe('off');
      button.element.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      vi.advanceTimersByTime(200);
      button.element.dispatchEvent(new Event('pointerup', { bubbles: true }));
      button.element.click();
      expect(play.farm).toBe('running');
      expect(opened()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('flashStoppedTitle', () => {
  function setHidden(hidden: boolean): void {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
  }

  it('marks the title only while the tab is hidden, and puts it back when the tab is seen', () => {
    document.title = 'FlyffWeb';
    setHidden(false);
    flashStoppedTitle(document);
    expect(document.title).toBe('FlyffWeb');
    setHidden(true);
    flashStoppedTitle(document);
    flashStoppedTitle(document);
    expect(document.title).toBe('(!) Stopped - FlyffWeb');
    setHidden(false);
    expect(document.title).toBe('FlyffWeb');
  });
});

describe('AutoButton: the mode last started (2026-11-17)', () => {
  it('a click starts the mode last started (startMode), farm or Support', () => {
    const { button, modeStarts } = rig();
    button.element.click();
    expect(modeStarts()).toBe(1);
  });
});

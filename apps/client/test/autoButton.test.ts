// @vitest-environment jsdom
// custom (owner 2026-11-15): the AUTO button and the stopped title (hud/autoPlay/autoButton.ts).
import { afterEach, describe, expect, it } from 'vitest';
import { AutoButton, flashStoppedTitle } from '../src/world/hud/autoPlay/autoButton';

afterEach(() => { document.body.replaceChildren(); });

function rig() {
  let toggles = 0;
  const play = {
    farm: 'off' as 'off' | 'running' | 'stopped',
    lastStop: null as string | null,
  };
  const button = new AutoButton(play, () => { toggles++; }, document);
  document.body.append(button.element);
  return { button, play, toggles: () => toggles };
}

describe('AutoButton', () => {
  it("is Auto Play's own icon, no word (2026-11-20, owner: \"move Autoplay button icon to the place of Auto icon\")", () => {
    const { button } = rig();
    expect(button.element.textContent).toBe('');
    expect(button.element.getAttribute('aria-label')).toBe('Auto Play');
    expect(button.element.querySelector<HTMLElement>('.hud-auto-icon')!.style.backgroundImage).toMatch(/icon_autoplay\.png/);
  });

  // 2026-11-20 (owner): "the autoplay icon on display should open the autoplay window when clicked and not just stop and
  // start the autoplay. stop and start should be inside the autoplay window"
  it('a click opens (or closes) the Auto Play window and starts or stops nothing', () => {
    const { button, play, toggles } = rig();
    button.element.click();
    expect(toggles()).toBe(1);
    expect(play.farm).toBe('off');
    play.farm = 'running';
    button.refresh();
    button.element.click();
    expect(toggles()).toBe(2);
    expect(play.farm).toBe('running');
  });

  it('glows while Auto Play runs (data-state), and its tip says so', () => {
    const { button, play } = rig();
    expect(button.element.dataset.state).toBe('off');
    expect(button.element.title).toBe('Auto Play');
    play.farm = 'running';
    button.refresh();
    expect(button.element.dataset.state).toBe('running');
    expect(button.element.title).toBe('Auto Play: running');
  });

  it('shows ! after a stop, with the reason, and clears it when it runs again', () => {
    const { button, play } = rig();
    play.farm = 'stopped';
    play.lastStop = 'you died';
    button.refresh();
    expect(button.element.dataset.state).toBe('stopped');
    expect(button.element.querySelector('.hud-auto-mark')!.textContent).toBe('!');
    expect(button.element.title).toBe('Auto Play stopped: you died');
    play.farm = 'running';
    play.lastStop = null;
    button.refresh();
    expect(button.element.dataset.state).toBe('running');
    expect(button.element.querySelector('.hud-auto-mark')!.textContent).toBe('');
  });

  it('a right-click (or a long press) brings no browser menu and does nothing else', () => {
    const { button, play, toggles } = rig();
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    button.element.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
    expect(toggles()).toBe(0);
    expect(play.farm).toBe('off');
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

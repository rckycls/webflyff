// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OptionWindow } from '../src/world/hud/optionWindow';
import type { OptionHost } from '../src/world/hud/optionWindow';
import { DEFAULT_GAME_OPTIONS } from '../src/world/options/gameOptions';
import { DEFAULT_OPTIONS } from '../src/world/friends/messenger';

const ART = { url: (key: string) => key, sheets: null };

let made: OptionWindow[] = [];
afterEach(() => {
  for (const w of made) w.dispose();
  made = [];
  document.body.replaceChildren();
});

function make(settings: { effects: number; music: number } | null = { effects: 10, music: 5 }, mode = 0) {
  const calls: string[] = [];
  const audio = settings === null ? null : {
    settings,
    setEffects: (step: number) => { calls.push(`effects ${step}`); audio!.settings = { ...audio!.settings, effects: step }; },
    setMusic: (step: number) => { calls.push(`music ${step}`); audio!.settings = { ...audio!.settings, music: step }; },
  };
  const host: OptionHost = {
    audio,
    game: { ...DEFAULT_GAME_OPTIONS },
    friend: { ...DEFAULT_OPTIONS },
    saveGame: () => calls.push('saveGame'),
    saveFriend: () => calls.push('saveFriend'),
    ownMode: () => mode,
    sendEquipSetting: (allow) => calls.push(`equip ${allow}`),
    sendDuelRequests: (accept) => calls.push(`duel ${accept}`),
    translucent: (on) => calls.push(`translucent ${on}`),
  };
  const w = new OptionWindow(ART, host, document);
  made.push(w);
  document.body.append(w.frame.element);
  w.toggle();
  const bar = (which: 'music' | 'effects') => w.frame.element.querySelector<HTMLElement>(`[data-volume="${which}"]`)!;
  const knob = (which: 'music' | 'effects') => bar(which).querySelector<HTMLElement>('.hud-option-knob')!;
  // jsdom lays nothing out: a bar's box is at 0, so these x are the bar's own pixels
  const press = (which: 'music' | 'effects', x: number) => bar(which).dispatchEvent(new MouseEvent('pointerdown', { clientX: x, bubbles: true }));
  const move = (which: 'music' | 'effects', x: number) => bar(which).dispatchEvent(new MouseEvent('pointermove', { clientX: x, bubbles: true }));
  const release = (which: 'music' | 'effects') => bar(which).dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
  const radio = (option: string, value: 'on' | 'off') =>
    w.frame.element.querySelector<HTMLButtonElement>(`.hud-radio[data-option="${option}"][data-value="${value}"]`)!;
  const check = (option: string) => w.frame.element.querySelector<HTMLButtonElement>(`.hud-six-frame[data-option="${option}"]`)!;
  return { w, host, calls, bar, knob, press, move, release, radio, check };
}

describe('OptionWindow: Neuz\'s Option window, its Game / Audio page (APP_OPTEX_GAME12, WndOptionGame.cpp)', () => {
  it('has the two tabs, Video greyed and Game / Audio chosen, and every group of the page at its resdata.inc rect', () => {
    const { w, radio } = make();
    expect(w.frame.isOpen).toBe(true);
    const text = w.frame.element.textContent ?? '';
    for (const label of [
      'Option', 'Game Options', 'Trading', 'Whispers & Messages', 'Friend Invites', 'Duel Requests', 'Party Invites',
      'Automatic Attack', 'Allow Inventory View', 'Message Alarm', 'Help Option', 'Beginner Guide', 'Info Pang',
      'Window Effects', 'Translucency', 'Sound Option', 'BGM', 'Sound Effect', 'Battle Music',
    ]) expect(text).toContain(label);
    // Automatic P.K Mode is hidden (__CSC_VER9_REMOVE_PKSETTING)
    expect(text).not.toContain('P.K');
    const tabs = [...w.frame.element.querySelectorAll<HTMLButtonElement>('.hud-tab-title')];
    expect(tabs.map((t) => t.textContent)).toEqual(['Video', 'Game / Audio']);
    expect(tabs[0]!.disabled).toBe(true);
    expect(tabs[1]!.getAttribute('aria-selected')).toBe('true');
    // the page at (15, 6) of the client area (the tab control's 10, 6 and the page's 5): Trading's Allow at 8,44;
    // Duel Requests moved up to the hidden P.K mode's 8,182
    expect([radio('trade', 'on').style.left, radio('trade', 'on').style.top]).toEqual(['23px', '50px']);
    expect([radio('duel', 'off').style.left, radio('duel', 'off').style.top]).toEqual(['119px', '188px']);
    expect([radio('equip', 'off').style.left, radio('equip', 'off').style.top]).toEqual(['347px', '50px']);
  });

  it('shows the kept options and the own mode: duels and the inventory view refused by PVPCONFIRM_MODE and EQUIP_DENIAL_MODE', () => {
    const open = make(undefined, 0);
    for (const option of ['trade', 'say', 'messenger', 'duel', 'party', 'autoAttack', 'equip', 'join']) {
      expect(open.radio(option, 'on').getAttribute('aria-checked')).toBe('true');
      expect(open.radio(option, 'off').getAttribute('aria-checked')).toBe('false');
    }
    const refused = make(undefined, 0x2000 | 0x20000);
    expect(refused.radio('duel', 'off').getAttribute('aria-checked')).toBe('true');
    expect(refused.radio('equip', 'off').getAttribute('aria-checked')).toBe('true');
  });

  it('a radio sets its option and keeps it, or tells the server, and shows the press', () => {
    const { host, calls, radio } = make();
    radio('trade', 'off').click();
    radio('party', 'off').click();
    radio('autoAttack', 'off').click();
    expect([host.game.trade, host.game.party, host.game.autoAttack]).toEqual([false, false, false]);
    radio('say', 'off').click();
    radio('messenger', 'off').click();
    radio('join', 'off').click();
    expect(host.friend).toEqual({ say: false, messenger: false, join: false });
    radio('duel', 'off').click();
    radio('equip', 'off').click();
    radio('equip', 'on').click();
    expect(calls).toEqual(['saveGame', 'saveGame', 'saveGame', 'saveFriend', 'saveFriend', 'saveFriend', 'duel false', 'equip false', 'equip true']);
    expect(radio('trade', 'off').getAttribute('aria-checked')).toBe('true');
    expect(radio('trade', 'on').getAttribute('aria-checked')).toBe('false');
  });

  it('Translucency and Battle Music are checks kept with the options; the instant help and Info Pang are greyed', () => {
    const { host, calls, check } = make();
    check('translucent').click();
    check('battleMusic').click();
    expect([host.game.translucent, host.game.battleMusic]).toEqual([true, true]);
    expect(calls).toEqual(['translucent true', 'saveGame', 'saveGame']);
    expect(check('translucent').getAttribute('aria-checked')).toBe('true');
    expect(check('instantHelp').disabled).toBe(true);
    expect(check('guide').disabled).toBe(true);
  });

  it('2026-11-20 (phone-camera-invert): the desktop page has no "Invert Camera" (the mouse does not read it)', () => {
    const { w, check } = make();
    expect(w.frame.element.textContent).not.toContain('Invert Camera');
    expect(check('invertCameraUp')).toBeNull();
    expect(check('invertCameraTurn')).toBeNull();
  });

  it('2026-11-20 (phone-camera-invert): the phone has "Invert Camera", Up/Down and Left/Right side by side, kept with the options', () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    try {
      const { w, host, calls, check } = make();
      expect(w.frame.element.hasAttribute('data-phone')).toBe(true);
      const heading = w.frame.element.querySelector<HTMLElement>('[data-static="camera"]')!;
      expect(heading.textContent).toBe('Invert Camera');
      const up = check('invertCameraUp');
      const turn = check('invertCameraTurn');
      expect(up.getAttribute('aria-label')).toBe('Invert Camera: Up/Down');
      expect(turn.getAttribute('aria-label')).toBe('Invert Camera: Left/Right');
      expect([up.getAttribute('aria-checked'), turn.getAttribute('aria-checked')]).toEqual(['false', 'false']);
      // under its heading, the two in one row, as a pair of radios stands
      const top = (element: HTMLElement) => parseFloat(element.style.top);
      const left = (element: HTMLElement) => parseFloat(element.style.left);
      expect(top(up)).toBeGreaterThan(top(heading));
      expect(top(turn)).toBe(top(up));
      expect(left(turn)).toBeGreaterThan(left(up));
      // the second column: under Automatic Attack, at its left
      const autoAttack = w.frame.element.querySelector<HTMLElement>('[data-static="autoAttack"]')!;
      expect(left(heading)).toBe(left(autoAttack));
      expect(top(heading)).toBeGreaterThan(top(autoAttack));
      up.click();
      expect(host.game.invertCameraUp).toBe(true);
      expect(host.game.invertCameraTurn).toBe(false);
      expect(up.getAttribute('aria-checked')).toBe('true');
      turn.click();
      turn.click();
      expect(host.game.invertCameraTurn).toBe(false);
      expect(calls).toEqual(['saveGame', 'saveGame', 'saveGame']);
      // shown as kept the next time it opens
      w.toggle();
      host.game.invertCameraTurn = true;
      w.toggle();
      expect([up.getAttribute('aria-checked'), turn.getAttribute('aria-checked')]).toEqual(['true', 'true']);
    } finally { window.matchMedia = original; }
  });

  it('2026-11-20 (phone-camera-invert): the new group keeps the phone window at its height (the fourth column is taller)', () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    try {
      const { w } = make();
      const bottomOf = (selector: string) => {
        const element = w.frame.element.querySelector<HTMLElement>(selector)!;
        return parseFloat(element.style.top) + parseFloat(element.style.height);
      };
      expect(bottomOf('.hud-six-frame[data-option="invertCameraUp"]')).toBeLessThan(bottomOf('.hud-six-frame[data-option="battleMusic"]'));
    } finally { window.matchMedia = original; }
  });

  it('the sliders at the saved steps, at their rects', () => {
    const { bar, knob } = make();
    expect(bar('music').getAttribute('role')).toBe('slider');
    expect(bar('music').getAttribute('aria-valuenow')).toBe('5');
    expect(bar('music').style.left).toBe('363px');
    expect(bar('music').style.top).toBe('250px');
    expect(bar('effects').style.top).toBe('272px');
    expect(knob('music').style.left).toBe('50px'); // step 5 of the 110 px bar: 5 * trunc(110 / 11)
    expect(knob('effects').style.left).toBe('100px');
  });

  it('a press on the bar beside the knob moves it one step toward the press', () => {
    const { calls, press, knob } = make();
    press('music', 80);
    expect(calls).toEqual(['music 6']);
    expect(knob('music').style.left).toBe('60px');
    press('music', 10);
    expect(calls).toEqual(['music 6', 'music 5']);
  });

  it('a press on the knob drags it one step per move toward the pointer', () => {
    const { calls, press, move, release } = make();
    press('music', 55);
    expect(calls).toEqual([]);
    move('music', 200);
    move('music', 200);
    move('music', 200);
    release('music');
    move('music', 200);
    expect(calls).toEqual(['music 6', 'music 7', 'music 8']);
  });

  it('at step 10 the knob covers the bar\'s right end, so a press there changes nothing', () => {
    const { calls, press, move } = make();
    press('effects', 108);
    move('effects', 300);
    expect(calls).toEqual([]);
  });

  it('takes the arrow keys on a focused bar, kept to 0..10', () => {
    const { calls, bar } = make({ effects: 10, music: 0 });
    bar('effects').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    bar('effects').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    bar('effects').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    bar('music').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(calls).toEqual(['effects 9', 'effects 10']);
  });

  it('shows the steps and the options as they are when it opens again', () => {
    const { w, host, knob, radio } = make();
    w.toggle();
    expect(w.frame.isOpen).toBe(false);
    (host.audio as unknown as { settings: { effects: number; music: number } }).settings = { effects: 2, music: 9 };
    host.game.trade = false;
    w.toggle();
    expect(knob('music').style.left).toBe('90px');
    expect(knob('effects').style.left).toBe('20px');
    expect(radio('trade', 'off').getAttribute('aria-checked')).toBe('true');
  });

  it('without sound the sliders are greyed and take nothing', () => {
    const { calls, bar, press } = make(null);
    expect(bar('music').getAttribute('aria-disabled')).toBe('true');
    press('music', 80);
    expect(calls).toEqual([]);
  });
});

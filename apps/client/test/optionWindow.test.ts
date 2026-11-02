// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { OptionWindow } from '../src/world/hud/optionWindow';

const ART = { url: (key: string) => key, sheets: null };

let made: OptionWindow[] = [];
afterEach(() => {
  for (const w of made) w.dispose();
  made = [];
  document.body.replaceChildren();
});

function make(settings = { effects: 10, music: 5 }) {
  const calls: string[] = [];
  const audio = {
    settings,
    setEffects: (step: number) => { calls.push(`effects ${step}`); audio.settings = { ...audio.settings, effects: step }; },
    setMusic: (step: number) => { calls.push(`music ${step}`); audio.settings = { ...audio.settings, music: step }; },
  };
  const w = new OptionWindow(ART, audio, document);
  made.push(w);
  document.body.append(w.frame.element);
  w.toggle();
  const bar = (which: 'music' | 'effects') => w.frame.element.querySelector<HTMLElement>(`[data-volume="${which}"]`)!;
  const knob = (which: 'music' | 'effects') => bar(which).querySelector<HTMLElement>('.hud-option-knob')!;
  // jsdom lays nothing out: a bar's box is at 0, so these x are the bar's own pixels
  const press = (which: 'music' | 'effects', x: number) => bar(which).dispatchEvent(new MouseEvent('pointerdown', { clientX: x, bubbles: true }));
  const move = (which: 'music' | 'effects', x: number) => bar(which).dispatchEvent(new MouseEvent('pointermove', { clientX: x, bubbles: true }));
  const release = (which: 'music' | 'effects') => bar(which).dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
  return { w, calls, bar, knob, press, move, release };
}

describe('OptionWindow (CWndOptionGame\'s Sound Option, ResData.inc APP_OPTEX_GAME12, WndOptionGame.cpp)', () => {
  it('is Neuz\'s Option window with the BGM and Sound Effect sliders, their knobs at the saved steps', () => {
    const { w, bar, knob } = make();
    expect(w.frame.isOpen).toBe(true);
    const text = w.frame.element.textContent ?? '';
    for (const label of ['Option', 'Sound Option', 'BGM', 'Sound Effect']) expect(text).toContain(label);
    expect(bar('music').getAttribute('role')).toBe('slider');
    expect(bar('music').getAttribute('aria-valuenow')).toBe('5');
    expect(bar('music').style.left).toBe('116px');
    expect(bar('music').style.top).toBe('28px');
    expect(bar('effects').style.top).toBe('50px');
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

  it('shows the steps as they are when it opens again', () => {
    const { w, knob } = make();
    w.toggle();
    expect(w.frame.isOpen).toBe(false);
    (w as unknown as { audio: { settings: { effects: number; music: number } } }).audio.settings = { effects: 2, music: 9 };
    w.toggle();
    expect(knob('music').style.left).toBe('90px');
    expect(knob('effects').style.left).toBe('20px');
  });
});

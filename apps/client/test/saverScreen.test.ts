// @vitest-environment jsdom
// custom (owner 2026-11-15): Auto Play's battery saver screen (hud/autoPlay/saverScreen.ts).
import { afterEach, describe, expect, it } from 'vitest';
import { SAVER_AFTER_MS, SaverScreen } from '../src/world/hud/autoPlay/saverScreen';

afterEach(() => { document.body.replaceChildren(); });

function rig(phone = true) {
  const shows: boolean[] = [];
  const play = {
    farm: 'running' as 'off' | 'running' | 'stopped', lastStop: null as string | null, phase: 'fighting',
    stats: { lines: () => ['Time 2m', 'Kills 3'] },
  };
  const saver = new SaverScreen(play, {
    isPhone: () => phone,
    gauges: () => ({ hp: 500, maxHp: 1000, mp: 50, maxMp: 100, fp: 10, maxFp: 100 }),
    onShow: (shown) => shows.push(shown),
  }, document);
  document.body.append(saver.element);
  return { saver, play, shows };
}

describe('SaverScreen', () => {
  it('opens by itself after 2 min with no touch on a phone while the farm bot runs', () => {
    const { saver, shows } = rig();
    saver.step(0);
    saver.step(SAVER_AFTER_MS - 1);
    expect(saver.shown).toBe(false);
    saver.step(SAVER_AFTER_MS);
    expect(saver.shown).toBe(true);
    expect(shows).toEqual([true]);
    expect(saver.element.hidden).toBe(false);
    expect(saver.element.textContent).toContain('Auto Play running');
    expect(saver.element.textContent).toContain('Kills 3');
    expect(saver.element.querySelector<HTMLElement>('.saver-gauge[data-gauge="hp"] .saver-fill')!.style.width).toBe('50%');
  });

  it('not by itself on a desktop, nor while the farm bot is off', () => {
    const desk = rig(false);
    desk.saver.step(0);
    desk.saver.step(SAVER_AFTER_MS * 3);
    expect(desk.saver.shown).toBe(false);
    const off = rig();
    off.play.farm = 'off';
    off.saver.step(0);
    off.saver.step(SAVER_AFTER_MS * 3);
    expect(off.saver.shown).toBe(false);
  });

  it('a touch resets the timer', () => {
    const { saver } = rig();
    saver.step(0);
    saver.touched(SAVER_AFTER_MS - 10);
    saver.step(SAVER_AFTER_MS + 10);
    expect(saver.shown).toBe(false);
  });

  it('a tap hides it: onShow(true) once, then onShow(false) once', () => {
    const { saver, shows } = rig(false);
    saver.show();
    saver.show();
    saver.element.click();
    expect(saver.shown).toBe(false);
    expect(shows).toEqual([true, false]);
  });

  it('a stop hides it by itself', () => {
    const { saver, play, shows } = rig();
    saver.show();
    play.farm = 'stopped';
    play.lastStop = 'you died';
    saver.step(1000);
    expect(saver.shown).toBe(false);
    expect(shows).toEqual([true, false]);
  });
});

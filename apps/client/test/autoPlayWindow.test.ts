// @vitest-environment jsdom
// custom (owner 2026-11-15): the Auto Play window (hud/autoPlay/autoPlayWindow.ts).
import { afterEach, describe, expect, it } from 'vitest';
import type { UiArt } from '../src/world/hud/art';
import { AutoPlayWindow } from '../src/world/hud/autoPlay/autoPlayWindow';
import type { AutoPlayItemChoice } from '../src/world/hud/autoPlay/autoPlayWindow';
import { defaultSettings } from '../src/world/autoplay/settings';
import type { AutoPlaySettings } from '../src/world/autoplay/settings';

const art: UiArt = { url: () => '', sheets: null };
afterEach(() => { document.body.replaceChildren(); });

const RED = 1001, BLUE = 1002;
const CHOICES: AutoPlayItemChoice[] = [
  { itemIndex: RED, name: 'Red Potion', icon: null, count: 12 },
  { itemIndex: BLUE, name: 'Blue Refresher', icon: null, count: 4 },
];

function rig(settings: AutoPlaySettings = defaultSettings()) {
  let saves = 0;
  const play = { settings, saved: () => { saves++; } };
  const w = new AutoPlayWindow(art, play, {
    potionChoices: () => CHOICES,
    item: (itemIndex) => CHOICES.find((c) => c.itemIndex === itemIndex) ?? null,
    count: (itemIndex) => CHOICES.find((c) => c.itemIndex === itemIndex)?.count ?? 0,
  }, document);
  document.body.append(w.frame.element);
  const row = (name: 'hp' | 'mp' | 'fp') => w.frame.element.querySelector<HTMLElement>(`.auto-pot-row[data-row="${name}"]`)!;
  const press = (within: HTMLElement, label: string) =>
    [...within.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.getAttribute('aria-label') === label || b.textContent === label)!.click();
  return { w, play, saves: () => saves, row, press };
}

describe('AutoPlayWindow: Potions tab', () => {
  it('opens on the Potions tab; Farm and Skills are there but greyed in M1', () => {
    const { w } = rig();
    w.open();
    const tabs = [...w.frame.element.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs.map((t) => t.textContent)).toEqual(['Farm', 'Potions', 'Skills']);
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    expect(tabs.map((t) => t.disabled)).toEqual([true, false, true]);
    expect(w.frame.element.querySelectorAll('.auto-pot-row')).toHaveLength(3);
  });

  it('+ on HP moves 50 → 55 and saves', () => {
    const { w, play, saves, row, press } = rig();
    w.open();
    press(row('hp'), 'HP higher');
    expect(play.settings.pots.rows.hp.below).toBe(55);
    expect(saves()).toBe(1);
    expect(row('hp').querySelector('.auto-pot-below')!.textContent).toBe('55%');
  });

  it('- at 10 stays 10, + at 90 stays 90', () => {
    const s = defaultSettings();
    s.pots.rows.fp.below = 10;
    s.pots.rows.mp.below = 90;
    const { w, play, row, press } = rig(s);
    w.open();
    press(row('fp'), 'FP lower');
    press(row('mp'), 'MP higher');
    expect(play.settings.pots.rows.fp.below).toBe(10);
    expect(play.settings.pots.rows.mp.below).toBe(90);
  });

  it('choosing item 1002 for MP sets mp.itemIndex 1002 and shows its count', () => {
    const { w, play, row, press } = rig();
    w.open();
    press(row('mp'), 'Choose the MP item');
    const list = w.frame.element.querySelector<HTMLElement>('.auto-pick-list')!;
    expect([...list.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Red Potion ×12', 'Blue Refresher ×4']);
    press(list, 'Blue Refresher ×4');
    expect(play.settings.pots.rows.mp.itemIndex).toBe(BLUE);
    expect(w.frame.element.querySelector('.auto-pick-list')).toBeNull();
    expect(row('mp').querySelector('.auto-pot-count')!.textContent).toBe('×4');
  });

  it('the clear button empties a row; the Auto pots box switches them on', () => {
    const s = defaultSettings();
    s.pots.rows.hp.itemIndex = RED;
    const { w, play, row, press } = rig(s);
    w.open();
    press(row('hp'), 'Clear the HP item');
    expect(play.settings.pots.rows.hp.itemIndex).toBe(0);
    const box = w.frame.element.querySelector<HTMLInputElement>('input[name="auto-pots"]')!;
    box.click();
    expect(play.settings.pots.enabled).toBe(true);
  });

  it('a row whose item the bag no longer holds shows ×0 greyed', () => {
    const s = defaultSettings();
    s.pots.rows.hp.itemIndex = 4242;
    const { w, row } = rig(s);
    w.open();
    expect(row('hp').querySelector('.auto-pot-count')!.textContent).toBe('×0');
    expect(row('hp').classList.contains('is-missing')).toBe(true);
  });
});

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
const SKILLS = [
  { skillIndex: 3, name: 'Slash', icon: null },
  { skillIndex: 4, name: 'Keenwheel', icon: null },
  { skillIndex: 5, name: 'Protect', icon: null },
  { skillIndex: 6, name: 'Blitz', icon: null },
  { skillIndex: 7, name: 'Sneaker', icon: null },
];
const CHOICES: AutoPlayItemChoice[] = [
  { itemIndex: RED, name: 'Red Potion', icon: null, count: 12 },
  { itemIndex: BLUE, name: 'Blue Refresher', icon: null, count: 4 },
];

function rig(settings: AutoPlaySettings = defaultSettings(), allowed = true) {
  let saves = 0;
  const play = {
    settings, saved: () => { saves++; },
    farm: 'off' as 'off' | 'running' | 'stopped', phase: 'seeking' as const, lastStop: null as string | null, bagIsFull: false,
    stats: { lines: () => ['Time 0s', 'Kills 0'] },
    start: () => { play.farm = 'running'; return true; },
    stop: (reason: string) => { play.farm = 'stopped'; play.lastStop = reason; },
  };
  const w = new AutoPlayWindow(art, play, {
    potionChoices: () => CHOICES,
    item: (itemIndex) => CHOICES.find((c) => c.itemIndex === itemIndex) ?? null,
    count: (itemIndex) => CHOICES.find((c) => c.itemIndex === itemIndex)?.count ?? 0,
    farmAllowed: () => allowed,
    now: () => 0,
    skillChoices: () => SKILLS,
    skill: (skillIndex) => SKILLS.find((c) => c.skillIndex === skillIndex) ?? null,
    buffItemChoices: () => [{ itemIndex: 3001, name: 'Strength Scroll', icon: null, count: 2 }],
  }, document);
  document.body.append(w.frame.element);
  const row = (name: 'hp' | 'mp' | 'fp') => w.frame.element.querySelector<HTMLElement>(`.auto-pot-row[data-row="${name}"]`)!;
  const press = (within: HTMLElement, label: string) =>
    [...within.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.getAttribute('aria-label') === label || b.textContent === label)!.click();
  return { w, play, saves: () => saves, row, press };
}

describe('AutoPlayWindow: Potions tab', () => {
  it('opens on the Farm tab; Potions has its three rows', () => {
    const { w } = rig();
    w.open();
    const tabs = [...w.frame.element.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs.map((t) => t.textContent)).toEqual(['Farm', 'Potions', 'Skills']);
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(tabs.map((t) => t.disabled)).toEqual([false, false, false]);
    w.showTab('potions');
    expect(w.frame.element.querySelectorAll('.auto-pot-row')).toHaveLength(3);
  });

  it('+ on HP moves 50 → 55 and saves', () => {
    const { w, play, saves, row, press } = rig();
    w.open('potions');
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
    w.open('potions');
    press(row('fp'), 'FP lower');
    press(row('mp'), 'MP higher');
    expect(play.settings.pots.rows.fp.below).toBe(10);
    expect(play.settings.pots.rows.mp.below).toBe(90);
  });

  it('choosing item 1002 for MP sets mp.itemIndex 1002 and shows its count', () => {
    const { w, play, row, press } = rig();
    w.open('potions');
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
    w.open('potions');
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
    w.open('potions');
    expect(row('hp').querySelector('.auto-pot-count')!.textContent).toBe('×0');
    expect(row('hp').classList.contains('is-missing')).toBe(true);
  });
});

describe('AutoPlayWindow: Farm tab', () => {
  const farm = (w: AutoPlayWindow) => w.frame.element.querySelector<HTMLElement>('.auto-farm')!;

  it('radius + from 30 stays 30; - from 15 → 10, saved', () => {
    const s = defaultSettings();
    const { w, play, saves, press } = rig(s);
    w.open();
    press(farm(w), 'Radius smaller');
    expect(play.settings.farm.radius).toBe(10);
    expect(saves()).toBe(1);
    play.settings.farm.radius = 30;
    press(farm(w), 'Radius larger');
    expect(play.settings.farm.radius).toBe(30);
    expect(farm(w).querySelector('.auto-farm-radius')!.textContent).toBe('30 m');
  });

  it('stop after: off → 1h → 2h, and back to off', () => {
    const { w, play, press } = rig();
    w.open();
    press(farm(w), 'Stop later');
    expect(play.settings.farm.stopAfterMin).toBe(60);
    press(farm(w), 'Stop later');
    expect(play.settings.farm.stopAfterMin).toBe(120);
    expect(farm(w).querySelector('.auto-farm-stop-after')!.textContent).toBe('2h');
    press(farm(w), 'Stop sooner');
    press(farm(w), 'Stop sooner');
    expect(play.settings.farm.stopAfterMin).toBe(0);
    expect(farm(w).querySelector('.auto-farm-stop-after')!.textContent).toBe('off');
  });

  it('the Pick up drops box', () => {
    const { w, play } = rig();
    w.open();
    farm(w).querySelector<HTMLInputElement>('input[name="auto-loot"]')!.click();
    expect(play.settings.farm.loot).toBe(false);
  });

  it('Start runs it; then Stop stops it as "you took control"', () => {
    const { w, play, press } = rig();
    w.open();
    press(farm(w), 'Start');
    expect(play.farm).toBe('running');
    w.refresh();
    press(farm(w), 'Stop');
    expect(play.lastStop).toBe('you took control');
  });

  it('Start is greyed where farming is not allowed', () => {
    const { w } = rig(defaultSettings(), false);
    w.open();
    const start = [...farm(w).querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Start')!;
    expect(start.disabled).toBe(true);
    expect(farm(w).textContent).toContain('Not allowed here.');
  });

  it('the status shows the stop reason after a stop, and the counts', () => {
    const { w, play } = rig();
    play.farm = 'stopped';
    play.lastStop = 'you died';
    w.open();
    expect(farm(w).querySelector('.auto-farm-state')!.textContent).toBe('Stopped: you died');
    expect(farm(w).querySelector('.auto-farm-stats')!.textContent).toContain('Kills 0');
  });
});

describe('AutoPlayWindow: Skills tab', () => {
  const page = (w: AutoPlayWindow) => w.frame.element.querySelector<HTMLElement>('.auto-skills')!;

  it('choosing a skill for ready slot 1 saves it; the Action Slot box', () => {
    const { w, play, saves, press } = rig();
    w.open('skills');
    press(page(w), 'Choose ready skill 1');
    press(page(w).querySelector<HTMLElement>('.auto-pick-list')!, 'Keenwheel');
    expect(play.settings.skills.ready).toEqual([4]);
    expect(saves()).toBe(1);
    page(w).querySelector<HTMLInputElement>('input[name="auto-action-slot"]')!.click();
    expect(play.settings.skills.actionSlot).toBe(false);
  });

  it('four ready slots: a fifth skill has no slot', () => {
    const s = defaultSettings();
    s.skills.ready = [3, 4, 5, 6];
    const { w } = rig(s);
    w.open('skills');
    expect(page(w).querySelectorAll('.auto-ready .auto-slot')).toHaveLength(4);
  });

  it('an item on a buff slot saves kind "item"; a skill saves kind "skill"', () => {
    const { w, play, press } = rig();
    w.open('skills');
    press(page(w), 'Choose buff 1');
    press(page(w).querySelector<HTMLElement>('.auto-pick-list')!, 'Strength Scroll ×2');
    press(page(w), 'Choose buff 2');
    press(page(w).querySelector<HTMLElement>('.auto-pick-list')!, 'Protect');
    expect(play.settings.skills.buffs).toEqual([{ kind: 'item', index: 3001 }, { kind: 'skill', index: 5 }]);
    expect(page(w).querySelectorAll('.auto-buffs .auto-slot')).toHaveLength(8);
  });

  it('a skill the character no longer has shows greyed; × clears it', () => {
    const s = defaultSettings();
    s.skills.ready = [42];
    const { w, play, press } = rig(s);
    w.open('skills');
    const first = page(w).querySelector<HTMLElement>('.auto-ready .auto-slot')!;
    expect(first.classList.contains('is-missing')).toBe(true);
    press(page(w), 'Clear ready skill 1');
    expect(play.settings.skills.ready).toEqual([]);
  });
});

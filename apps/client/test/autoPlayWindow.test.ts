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
const NEAR = [{ index: 20, name: 'Small Aibatt', level: 1, count: 3 }, { index: 21, name: 'Aibatt', level: 3, count: 1 }];
const NAMES = new Map([[20, 'Small Aibatt'], [21, 'Aibatt'], [55, 'Mia']]);
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

let target: { playerId: number; name: string } | null = { playerId: 501, name: 'Rocky' };
let usage: { usedMin: number; limitMin: number | null; resetsAt: string } | null = null;
function rig(settings: AutoPlaySettings = defaultSettings(), allowed = true) {
  let saves = 0, savers = 0;
  const play = {
    settings, saved: () => { saves++; },
    farm: 'off' as 'off' | 'running' | 'stopped', phase: 'seeking' as const, lastStop: null as string | null, bagIsFull: false,
    stats: { lines: () => ['Time 0s', 'Kills 0'] },
    start: () => { play.farm = 'running'; play.mode = 'farm'; return true; },
    startSupport: () => { play.farm = 'running'; play.mode = 'support'; return true; },
    mode: 'farm' as 'farm' | 'support',
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
    showSaver: () => { savers++; },
    monstersNear: () => NEAR,
    monsterName: (index) => NAMES.get(index) ?? '?',
    targetPlayer: () => target,
    usage: () => usage,
  }, document);
  document.body.append(w.frame.element);
  const row = (name: 'hp' | 'mp' | 'fp') => w.frame.element.querySelector<HTMLElement>(`.auto-pot-row[data-row="${name}"]`)!;
  const press = (within: HTMLElement, label: string) =>
    [...within.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.getAttribute('aria-label') === label || b.textContent === label)!.click();
  return { w, play, saves: () => saves, savers: () => savers, row, press };
}
/** 2026-11-20: the Start / Stop bar under the tabs, its button and its state line. */
const bar = (w: AutoPlayWindow) => w.frame.element.querySelector<HTMLElement>('.auto-play-run')!;
const goButton = (w: AutoPlayWindow) => bar(w).querySelector<HTMLButtonElement>('[data-auto-play="go"]')!;
const state = (w: AutoPlayWindow) => bar(w).querySelector('.auto-farm-state')!.textContent;

describe('AutoPlayWindow: Potions tab', () => {
  it('opens on the Farm tab; Potions has its three rows', () => {
    const { w } = rig();
    w.open();
    const tabs = [...w.frame.element.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    // (2026-11-16: no Loot tab: the Pet Filter window, U, took its place)
    expect(tabs.map((t) => t.textContent)).toEqual(['Farm', 'Potions', 'Skills', 'Support']);
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false', 'false']);
    expect(tabs.map((t) => t.disabled)).toEqual([false, false, false, false]);
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
    const box = w.frame.element.querySelector<HTMLButtonElement>('[data-name="auto-pots"]')!;
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
    farm(w).querySelector<HTMLButtonElement>('[data-name="auto-loot"]')!.click();
    expect(play.settings.farm.loot).toBe(false);
  });

  it('Start runs it; then Stop stops it as "you took control"', () => {
    const { w, play, press } = rig();
    w.open();
    press(bar(w), 'Start');
    expect(play.farm).toBe('running');
    w.refresh();
    press(bar(w), 'Stop');
    expect(play.lastStop).toBe('you took control');
  });

  it('while it runs, Battery saver opens the saver screen', () => {
    const { w, press, savers } = rig();
    w.open();
    expect([...bar(w).querySelectorAll('button')].some((b) => b.textContent === 'Battery saver')).toBe(false);
    press(bar(w), 'Start');
    press(bar(w), 'Battery saver');
    expect(savers()).toBe(1);
  });

  it('Start is greyed where farming is not allowed', () => {
    const { w } = rig(defaultSettings(), false);
    w.open();
    expect(goButton(w).textContent).toBe('Start');
    expect(goButton(w).disabled).toBe(true);
    expect(state(w)).toBe('Not allowed here.');
  });

  it('the status shows the stop reason after a stop, and the counts', () => {
    const { w, play } = rig();
    play.farm = 'stopped';
    play.lastStop = 'you died';
    w.open();
    expect(state(w)).toBe('Stopped: you died');
    expect(farm(w).querySelector('.auto-farm-stats')!.textContent).toContain('Kills 0');
  });
});

// 2026-11-20 (owner): "stop and start should be inside the autoplay window": one bar under the tabs, on every tab
describe('AutoPlayWindow: the Start / Stop bar', () => {
  it('is under the tab strip on every tab, Start while off, Stop while it runs, with what it does beside it', () => {
    const { w, play } = rig();
    w.open();
    for (const tab of ['farm', 'potions', 'skills', 'support'] as const) {
      w.showTab(tab);
      expect(bar(w).parentElement).toBe(w.frame.body);
      expect(goButton(w).getAttribute('data-auto-play')).toBe('go');
    }
    w.showTab('potions');
    expect([goButton(w).textContent, state(w)]).toEqual(['Start', 'Off']);
    goButton(w).click();
    expect([play.farm, play.mode]).toEqual(['running', 'farm']);
    w.refresh();
    expect([goButton(w).textContent, state(w), bar(w).dataset.state]).toEqual(['Stop', 'Running: seeking', 'running']);
    play.bagIsFull = true;
    w.refresh();
    expect(state(w)).toBe('Running: seeking (bag full)');
  });

  it('Stop on any tab stops what runs, Support mode too', () => {
    const { w, play, press } = rig();
    w.open('support');
    press(w.frame.element.querySelector<HTMLElement>('.auto-support')!, 'Use target');
    goButton(w).click();
    expect([play.farm, play.mode]).toEqual(['running', 'support']);
    w.showTab('skills');
    expect(goButton(w).textContent).toBe('Stop');
    expect(bar(w).querySelector('[data-auto-play="saver"]')).toBeNull(); // the saver is the farm bot's
    goButton(w).click();
    expect([play.farm, play.lastStop]).toEqual(['stopped', 'you took control']);
  });

  it('the week used up: Start greyed and "Weekly limit reached." on every tab, the stop line after a run cut short', () => {
    usage = { usedMin: 840, limitMin: 840, resetsAt: '' };
    try {
      const { w, play } = rig();
      w.open();
      expect([goButton(w).disabled, state(w)]).toEqual([true, 'Weekly limit reached.']);
      w.showTab('support');
      expect([goButton(w).disabled, state(w)]).toEqual([true, 'Weekly limit reached.']);
      play.farm = 'stopped';
      play.lastStop = 'weekly limit reached';
      w.showTab('farm');
      expect(state(w)).toBe('Weekly limit reached.');
      usage = { usedMin: 10, limitMin: 840, resetsAt: '' };
      w.refresh();
      expect([goButton(w).disabled, state(w)]).toEqual([false, 'Stopped: weekly limit reached']);
    } finally {
      usage = null;
    }
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
    page(w).querySelector<HTMLButtonElement>('[data-name="auto-action-slot"]')!.click();
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

// 2026-11-17 (owner, "make the whole auto play window follow the v15 theme")
describe('AutoPlayWindow: the V15 look', () => {
  it('every check box is Neuz\'s ButtCheck.bmp: frame 1 unticked, frame 3 ticked', () => {
    const { w } = rig();
    w.open('potions');
    const box = w.frame.element.querySelector<HTMLElement>('[data-name="auto-pots"]')!;
    expect(box.querySelector<HTMLElement>('.auto-v15-check')!.dataset.frame).toBe('1');
    box.click();
    expect(w.frame.element.querySelector<HTMLElement>('[data-name="auto-pots"] .auto-v15-check')!.dataset.frame).toBe('3');
    expect(w.frame.element.querySelectorAll('input')).toHaveLength(0);
  });

  it('every word button of every tab is a silver word button (no browser checkbox anywhere)', () => {
    const { w } = rig();
    for (const tab of ['farm', 'potions', 'skills'] as const) {
      w.open(tab);
      const page = w.frame.element.querySelector<HTMLElement>('.hud-gc-page:not([hidden])')!;
      expect(page.querySelectorAll('input')).toHaveLength(0);
      const words = [...page.querySelectorAll<HTMLButtonElement>('button')].filter((b) => !b.classList.contains('auto-slot') && b.getAttribute('role') !== 'checkbox' && b.getAttribute('role') !== 'radio' && !b.classList.contains('auto-pick'));
      expect(words.every((b) => b.classList.contains('auto-word')), tab).toBe(true);
    }
  });
});

// 2026-11-17 (owner): "avoid giants, select specific monster on the said radius and only attack that mob"
describe('AutoPlayWindow: Farm tab, the monster options', () => {
  const farm = (w: AutoPlayWindow) => w.frame.element.querySelector<HTMLElement>('.auto-farm')!;
  const ticked = (b: HTMLElement) => b.getAttribute('aria-checked') === 'true';

  it('Avoid giants and bosses: on by default; a press turns it off and saves', () => {
    const { w, play, saves } = rig();
    w.open();
    const box = farm(w).querySelector<HTMLButtonElement>('[data-name="auto-avoid-giants"]')!;
    expect(box.textContent).toContain('Avoid giants and bosses');
    expect(ticked(box)).toBe(true);
    box.click();
    expect(play.settings.farm.avoidGiants).toBe(false);
    expect(saves()).toBe(1);
  });

  it('Monsters: All by default; Choose lists the kinds in the radius (name, level, how many)', () => {
    const { w, press } = rig();
    w.open();
    expect(farm(w).querySelector('.auto-farm-only')!.textContent).toBe('All');
    press(farm(w), 'Choose');
    const rows = [...farm(w).querySelectorAll<HTMLElement>('.auto-only-list [role="checkbox"]')];
    expect(rows.map((r) => r.textContent)).toEqual(['Small Aibatt Lv 1 ×3', 'Aibatt Lv 3 ×1']);
    expect(rows.every((r) => !ticked(r))).toBe(true);
  });

  it('ticking a kind keeps the bot to it; the line names it; All lets every kind again', () => {
    const { w, play, press } = rig();
    w.open();
    press(farm(w), 'Choose');
    farm(w).querySelector<HTMLButtonElement>('[data-name="auto-only-21"]')!.click();
    expect(play.settings.farm.only).toEqual([21]);
    expect(farm(w).querySelector('.auto-farm-only')!.textContent).toBe('Aibatt');
    expect(ticked(farm(w).querySelector<HTMLButtonElement>('[data-name="auto-only-21"]')!)).toBe(true);
    press(farm(w), 'All kinds');
    expect(play.settings.farm.only).toEqual([]);
  });

  it('a chosen kind no longer in the radius is still listed, ticked, to be taken off', () => {
    const s = defaultSettings();
    s.farm.only = [55];
    const { w, play, press } = rig(s);
    w.open();
    expect(farm(w).querySelector('.auto-farm-only')!.textContent).toBe('Mia');
    press(farm(w), 'Choose');
    const mia = farm(w).querySelector<HTMLButtonElement>('[data-name="auto-only-55"]')!;
    expect(mia.textContent).toBe('Mia');
    expect(ticked(mia)).toBe(true);
    mia.click();
    expect(play.settings.farm.only).toEqual([]);
  });
});

// 2026-11-17 (owner): "another tab solely for buffers (Ringmaster): follows another player and just heals/buffs it"
describe('AutoPlayWindow: Support tab', () => {
  const page = (w: AutoPlayWindow) => w.frame.element.querySelector<HTMLElement>('.auto-support')!;

  it('Use target makes the targeted player the partner; Clear empties it; nobody targeted says so', () => {
    const { w, play, press } = rig();
    w.open('support');
    expect(page(w).querySelector('.auto-support-partner')!.textContent).toBe('None');
    press(page(w), 'Use target');
    expect([play.settings.support.partnerPlayerId, play.settings.support.partnerName]).toEqual([501, 'Rocky']);
    expect(page(w).querySelector('.auto-support-partner')!.textContent).toBe('Rocky');
    press(page(w), 'Clear');
    expect(play.settings.support.partnerPlayerId).toBe(0);
    target = null;
    press(page(w), 'Use target');
    expect(page(w).querySelector('.auto-support-partner')!.textContent).toBe('Target a player first');
    target = { playerId: 501, name: 'Rocky' };
  });

  it('Heals: 2 slots taking a learned skill; Partner buffs: 8 slots', () => {
    const { w, play, press } = rig();
    w.open('support');
    expect(page(w).querySelectorAll('.auto-heals .auto-slot')).toHaveLength(2);
    expect(page(w).querySelectorAll('.auto-partnerBuffs .auto-slot')).toHaveLength(8);
    press(page(w), 'Choose heal 1');
    press(page(w).querySelector<HTMLElement>('.auto-pick-list')!, 'Slash');
    expect(play.settings.support.heals).toEqual([3]);
    press(page(w), 'Choose partner buff 1');
    press(page(w).querySelector<HTMLElement>('.auto-pick-list')!, 'Protect');
    expect(play.settings.support.buffs).toEqual([5]);
  });

  it('heal percents step by 5; Resurrect partner is a V15 box, on by default', () => {
    const { w, play, press } = rig();
    w.open('support');
    press(page(w), 'Partner HP higher');
    press(page(w), 'My HP lower');
    expect([play.settings.support.partnerBelow, play.settings.support.selfBelow]).toEqual([75, 45]);
    const res = page(w).querySelector<HTMLButtonElement>('[data-name="auto-resurrect"]')!;
    expect(res.getAttribute('aria-checked')).toBe('true');
    res.click();
    expect(play.settings.support.resurrect).toBe(false);
  });

  it('Start runs Support mode; while it runs the button says Stop; Start is greyed with no partner', () => {
    const s = defaultSettings();
    const { w, play, press } = rig(s);
    w.open('support');
    expect([goButton(w).disabled, state(w)]).toEqual([true, 'No partner.']);
    press(page(w), 'Use target');
    expect([goButton(w).disabled, state(w)]).toEqual([false, 'Off']);
    press(bar(w), 'Start');
    expect([play.farm, play.mode]).toEqual(['running', 'support']);
    w.refresh();
    press(bar(w), 'Stop');
    expect(play.lastStop).toBe('you took control');
  });
});

// 2026-11-17 (owner): the weekly hours by VIP level
describe('AutoPlayWindow: the hours of this week', () => {
  afterEach(() => { usage = null; });
  const line = (w: AutoPlayWindow, page: string) => w.frame.element.querySelector<HTMLElement>(`${page} .auto-week`);

  it('Farm and Support show the time left of the hours of the week', () => {
    usage = { usedMin: 50, limitMin: 840, resetsAt: '2026-11-23T00:00:00.000Z' };
    const { w } = rig();
    w.open('farm');
    expect(line(w, '.auto-farm')!.textContent).toBe('This week: 13h10m left of 14h');
    w.open('support');
    expect(line(w, '.auto-support')!.textContent).toBe('This week: 13h10m left of 14h');
  });

  it('used up: 0 left, and Start greyed; VIP4: no limit; unknown: no line', () => {
    usage = { usedMin: 840, limitMin: 840, resetsAt: '' };
    const { w } = rig();
    w.open('farm');
    expect(line(w, '.auto-farm')!.textContent).toBe('This week: 0s left of 14h');
    expect(goButton(w).disabled).toBe(true);
    usage = { usedMin: 9000, limitMin: null, resetsAt: '' };
    w.refresh();
    expect(line(w, '.auto-farm')!.textContent).toBe('This week: no limit');
    usage = null;
    w.refresh();
    expect(line(w, '.auto-farm')).toBeNull();
  });
});

// 2026-11-18 (owner): the hunting area's centre
describe('AutoPlayWindow: the hunting centre', () => {
  it('Centre: Last kill chosen by default; Start point chooses the start, as V15 radio buttons, saved', () => {
    const { w, play, saves } = rig();
    w.open('farm');
    const farm = w.frame.element.querySelector<HTMLElement>('.auto-farm')!;
    const last = farm.querySelector<HTMLButtonElement>('[data-name="auto-center-lastKill"]')!;
    const start = farm.querySelector<HTMLButtonElement>('[data-name="auto-center-start"]')!;
    expect([last.getAttribute('role'), last.getAttribute('aria-checked'), start.getAttribute('aria-checked')]).toEqual(['radio', 'true', 'false']);
    start.click();
    expect(play.settings.farm.center).toBe('start');
    expect(saves()).toBe(1);
    const now = w.frame.element.querySelector<HTMLElement>('.auto-farm')!;
    expect(now.querySelector('[data-name="auto-center-start"]')!.getAttribute('aria-checked')).toBe('true');
    expect(now.querySelector('[data-name="auto-center-lastKill"]')!.getAttribute('aria-checked')).toBe('false');
  });
});

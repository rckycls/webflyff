// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OwnQuest } from '@flyffweb/protocol';
import type { WebQuest } from '@flyffweb/formats';
import { QuestWindow, type QuestWindowState } from '../src/world/hud/quests/questWindow';
import type { QuestNames, QuestOwner } from '../src/world/quests/questRules';

const art = { url: (key: string) => `/assets/${key}`, sheets: null };
const node = (id: number, title: string, head: number, extra: Partial<WebQuest> = {}): WebQuest => ({ id, title, head, states: {}, ...extra });
const MERCENARY = node(151, 'The Path of the Mercenary', 6051, {
  endNpc: 'MaFl_Mustang', endGoal: { x: 7153, z: 3244, text: 1 },
  kills: [{ slot: 0, mover: 20, count: 10, goal: { x: 7128, z: 3333, text: 1 } }],
  rewards: { gold: [1500, 1500] }, states: { 0: 'Slay 10 Small Aibatts.', 14: '' },
});
const CATALOG = new Map<number, WebQuest>([
  [6000, node(6000, 'Scenario', 0)], [6001, node(6001, 'General', 0)], [6002, node(6002, 'Request Office', 0)],
  [6003, node(6003, 'Event', 0)], [6051, node(6051, '1st Job Change', 6001)], [6004, node(6004, 'Flaris', 6001)],
  [151, MERCENARY], [83, node(83, 'Find Red Bang Thieves', 6004, { states: { 0: 'x' } })],
  [84, node(84, '<b>x</b>', 6004, { noRemove: true, states: { 0: 'y' }, kills: [{ slot: 0, mover: 20, count: 1 }] })],
]);
const own = (id: number, kills = 0): OwnQuest => ({ id, state: 0, time: 0, kills: [kills, 0], patrol: false, dialog: false });
const OWNER: QuestOwner = {
  level: 15, job: 0, sex: 0, gold: 0, expPercent: 0, skillLevel: () => 0, itemCount: () => 0, completed: [],
};
const NAMES: QuestNames = { mover: () => 'Small Aibatt', item: () => 'item', npc: () => 'Mustang' };
const state = (extra: Partial<QuestWindowState> = {}): QuestWindowState => ({
  catalog: CATALOG, current: new Map([[151, own(151, 3)], [84, own(84)]]), completed: [83], checked: [],
  owner: OWNER, dialogueOpen: false, ...extra,
});

const windows: QuestWindow[] = [];
afterEach(() => {
  for (const window of windows.splice(0)) window.dispose();
  document.body.replaceChildren();
});
/** The windows in a layer of `size` (jsdom lays nothing out, so the layer's size is given). */
function make(first: QuestWindowState = state(), size = { width: 0, height: 0 }) {
  const actions = { check: vi.fn(), abandon: vi.fn(), destination: vi.fn(), say: vi.fn() };
  const window = new QuestWindow(art, new Map(), NAMES, actions, document);
  windows.push(window);
  const layer = document.createElement('div');
  Object.defineProperty(layer, 'clientWidth', { value: size.width });
  Object.defineProperty(layer, 'clientHeight', { value: size.height });
  document.body.append(layer);
  for (const element of window.elements) layer.append(element);
  window.toggle(size.width, first);
  const q = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector);
  const qa = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)];
  const general = () => q('[data-quest-tab="6001"]')!.click();
  const filter = (value: 'all' | 'current' | 'completed') => {
    q('.quest-filter-field')!.click();
    q(`.quest-filter-list [data-filter="${value}"]`)!.click();
  };
  return { window, actions, q, qa, general, filter };
}

describe('QuestWindow (APP_QUEST_EX_LIST, APP_QUEST_EX_DETAIL; WndQuest.cpp)', () => {
  it('opens on Scenario and In Progress (TreeInformation.cpp:36-37); the tab and filter survive reopening', () => {
    const { window, q, qa, general, filter } = make();
    expect(window.list.isOpen).toBe(true);
    expect(qa('[data-quest-tab]').map((tab) => tab.textContent)).toEqual(['Scenario', 'General', 'Request Office', 'Event']);
    expect(q('[data-quest-tab="6000"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(q('.quest-filter-field')!.textContent).toBe('In Progress');
    expect(qa('[data-quest-id]')).toEqual([]);
    general();
    filter('all');
    window.toggle(800, state());
    expect(window.list.isOpen).toBe(false);
    window.toggle(800, state());
    expect(q('[data-quest-tab="6001"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(q('.quest-filter-field')!.textContent).toBe('All Quests');
  });

  it('the tab strip is at the bottom of the tiled tab control, its titles centred, the chosen one black', () => {
    const { q } = make();
    const control = q('.quest-tabctrl')!;
    expect(control.style.top).toBe('28px');
    expect(control.style.height).toBe('300px');
    // rows − 2 of 8 px: (300 / 8 − 2) × 8 = 280 (CWndTabCtrl::AdditionalSkinTexture, WndControl.cpp:4396-4398)
    const strip = control.querySelector<HTMLElement>('.hud-tab-strip')!;
    expect(strip.style.top).toBe('280px');
    expect(strip.classList.contains('quest-tab-strip')).toBe(true);
    expect(control.querySelector('.hud-edit-tiles')).not.toBeNull();
  });

  it('the header bars are WndEditTile200 bars; the detail\'s title is empty (resData.txt.txt:6719)', () => {
    const { window, q, qa, general } = make();
    expect(q('.hud-quests .quest-header')!.textContent).toBe('Quest List');
    expect(q<HTMLElement>('.hud-quests .quest-header .hud-edit-tiles > div')!.style.backgroundImage).toContain('wndedittile200');
    general();
    q('[data-quest-id="151"] .quest-title')!.click();
    expect(window.detail.isOpen).toBe(true);
    expect(qa('.hud-quest-detail .quest-header').map((bar) => bar.textContent)).toEqual(['Quest Contents', 'Requirement', 'Reward']);
    expect(q('.hud-quest-detail > .hud-window-title')!.textContent).toBe('');
    expect(window.detail.element.getAttribute('aria-label')).toBe('The Path of the Mercenary');
  });

  it('a folder opens or closes by its picture or a double press; one press only chooses it (WndControl.cpp:1306-1385)', () => {
    const { q, qa, general, filter } = make();
    general();
    filter('all');
    expect(q('[data-quest-folder="6051"] .quest-fold img')!.getAttribute('src')).toContain('butttreeopen');
    q('[data-quest-folder="6051"] .quest-folder-title')!.click();
    expect(q('[data-quest-id="151"]')).not.toBeNull();
    expect(q('[data-quest-folder="6051"]')!.classList.contains('selected')).toBe(true);
    q('[data-quest-folder="6051"] .quest-fold')!.click();
    expect(q('[data-quest-folder="6051"] .quest-fold img')!.getAttribute('src')).toContain('butttreeclose');
    expect(q('[data-quest-id="151"]')).toBeNull();
    q('[data-quest-folder="6051"] .quest-folder-title')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(q('[data-quest-id="151"] .quest-check')).not.toBeNull();
    const done = q('[data-quest-id="83"]')!;
    expect(done.classList.contains('completed')).toBe(true);
    expect(done.querySelector('.quest-check')).toBeNull();
    expect(qa('[data-quest-id]').map((leaf) => leaf.dataset.questId)).toEqual(['151', '84', '83']);
  });

  it('the chosen row is blue text with no bar, 16 px a level', () => {
    const { q, general } = make();
    general();
    q('[data-quest-id="151"] .quest-title')!.click();
    const leaf = q('[data-quest-id="151"]')!;
    expect(leaf.classList.contains('selected')).toBe(true);
    expect(leaf.style.paddingLeft).toBe('16px');
    expect(q('[data-quest-folder="6051"]')!.style.paddingLeft).toBe('0px');
  });

  it('a tick sends check; the box shows what QUEST_CHECKED says, not the click', () => {
    const { window, actions, q, general } = make();
    general();
    q('[data-quest-id="151"] .quest-check')!.click();
    expect(actions.check).toHaveBeenCalledWith(151, true);
    expect(q('[data-quest-id="151"] .quest-check')!.dataset.checked).toBe('false');
    window.update(state({ checked: [151] }));
    expect(q('[data-quest-id="151"] .quest-check')!.dataset.checked).toBe('true');
    q('[data-quest-id="151"] .quest-check')!.click();
    expect(actions.check).toHaveBeenLastCalledWith(151, false);
  });

  it('a sixth tick sends nothing and says why', () => {
    const five = new Map([1, 2, 3, 4, 5, 151].map((id) => [id, own(id)]));
    const { actions, q, general } = make(state({ current: five, checked: [1, 2, 3, 4, 5] }));
    general();
    q('[data-quest-id="151"] .quest-check')!.click();
    expect(actions.check).not.toHaveBeenCalled();
    expect(actions.say).toHaveBeenCalledWith('You cannot check that anymore.');
  });

  it('a leaf toggles the detail with its state text, rows and rewards, each on edit tiles with a scroll bar', () => {
    const { window, q, general } = make();
    general();
    q('[data-quest-id="151"] .quest-title')!.click();
    expect(window.detail.isOpen).toBe(true);
    expect(q('.quest-contents')!.textContent).toContain('Slay 10 Small Aibatts.');
    expect(q('.quest-conditions')!.textContent).toContain('Defeat Small Aibatt (3/10)');
    expect(q('.quest-rewards')!.textContent).toContain('Penya: 1500');
    for (const words of ['.quest-contents', '.quest-conditions', '.quest-rewards']) {
      const box = q(words)!.parentElement!;
      expect(box.querySelector('.hud-edit-tiles'), words).not.toBeNull();
      expect(box.querySelector('.hud-res-scroll'), words).not.toBeNull();
    }
    q('[data-quest-id="151"] .quest-title')!.click();
    expect(window.detail.isOpen).toBe(false);
    // the tree keeps its choice (m_pFocusElem) when the detail closes
    expect(q('[data-quest-id="151"]')!.classList.contains('selected')).toBe(true);
  });

  it('a new tab or filter closes the detail (WndQuest.cpp:1230-1234)', () => {
    const { window, q, general, filter } = make();
    general();
    q('[data-quest-id="151"] .quest-title')!.click();
    q('[data-quest-tab="6002"]')!.click();
    expect(window.detail.isOpen).toBe(false);
    general();
    q('[data-quest-id="151"] .quest-title')!.click();
    expect(window.detail.isOpen).toBe(true);
    filter('all');
    expect(window.detail.isOpen).toBe(false);
  });

  it('the filter is a read-only combo box: its field and drop button open the list under it', () => {
    const { q, qa } = make();
    const list = q('.quest-filter-list')!;
    expect(list.hidden).toBe(true);
    expect(q('.quest-filter .hud-edit-tiles')).not.toBeNull();
    q('.quest-filter .hud-res-combo-drop')!.click();
    expect(list.hidden).toBe(false);
    expect(qa('.quest-filter-list [data-filter]').map((row) => row.textContent)).toEqual(['All Quests', 'In Progress', 'Completed']);
    q('.quest-filter-field')!.click();
    expect(list.hidden).toBe(true);
    expect(q('select')).toBeNull();
  });

  it('abandon is offered only for a removable current quest; the box closes the detail and keeps the quest', () => {
    const { window, actions, q, general } = make();
    general();
    const remove = () => q<HTMLButtonElement>('button.quest-remove')!;
    expect(remove().disabled).toBe(true); // nothing chosen
    q('[data-quest-folder="6051"] .quest-folder-title')!.click();
    expect(remove().disabled).toBe(true); // a folder
    q('[data-quest-id="151"] .quest-title')!.click();
    expect(remove().disabled).toBe(false);
    window.update(state({ dialogueOpen: true }));
    expect(remove().disabled).toBe(true);
    window.update(state());
    q('[data-quest-id="84"] .quest-title')!.click(); // noRemove
    expect(remove().disabled).toBe(true);
    q('[data-quest-id="151"] .quest-title')!.click();
    remove().click();
    expect(window.detail.isOpen).toBe(false);
    expect(q('.quest-confirm')!.textContent).toContain('Are you going to cancel the quest?');
    q<HTMLButtonElement>('.quest-confirm [data-button="cancel"]')!.click();
    expect(actions.abandon).not.toHaveBeenCalled();
    remove().click();
    q<HTMLButtonElement>('.quest-confirm [data-button="ok"]')!.click();
    expect(actions.abandon).toHaveBeenCalledTimes(1);
    expect(actions.abandon).toHaveBeenCalledWith(151);
  });

  it('a row with a goal calls destination and turns blue; one without does nothing', () => {
    const { actions, q, general } = make();
    general();
    q('[data-quest-id="151"] .quest-title')!.click();
    q<HTMLButtonElement>('.quest-conditions [data-row="0"]')!.click();
    expect(actions.destination).toHaveBeenCalledWith({ x: 7128, z: 3333, text: 1 });
    expect(q('.quest-conditions [data-row="0"]')!.classList.contains('selected')).toBe(true);
    q('[data-quest-id="84"] .quest-title')!.click();
    q<HTMLButtonElement>('.quest-conditions [data-row="0"]')!.click();
    expect(actions.destination).toHaveBeenCalledTimes(1);
  });

  it('catalog titles go in as text', () => {
    const { q, general } = make();
    general();
    const title = q('[data-quest-id="84"] .quest-title')!;
    expect(title.textContent).toBe('<b>x</b>');
    expect(title.querySelector('b')).toBeNull();
  });

  it('an update that changes nothing keeps the rows, so a press between two frames lands', () => {
    const { window, q, general } = make();
    general();
    const row = q('[data-quest-id="151"]');
    window.update(state());
    expect(q('[data-quest-id="151"]')).toBe(row);
    window.update(state({ current: new Map([[151, own(151, 4)], [84, own(84)]]) })); // the tree shows no count
    expect(q('[data-quest-id="151"]')).toBe(row);
    window.update(state({ checked: [151] }));
    expect(q('[data-quest-id="151"]')).not.toBe(row);
  });

  it('the detail opened alone (the tracker\'s title) follows the quest', () => {
    const { window, q } = make();
    window.toggle(800, state());
    window.showDetail(151, state());
    expect(window.list.isOpen).toBe(false);
    window.update(state({ current: new Map([[151, own(151, 4)], [84, own(84)]]) }));
    expect(q('.quest-conditions')!.textContent).toContain('Defeat Small Aibatt (4/10)');
  });

  it('the detail docks at the list\'s right edge less 2 px and follows it (WndQuest.cpp:1177-1189)', async () => {
    const { window, q, general } = make(state(), { width: 1280, height: 720 });
    general();
    q('[data-quest-id="151"] .quest-title')!.click();
    const at = window.list.position;
    expect(window.detail.position).toEqual({ x: at.x + 334, y: at.y });
    window.list.open({ x: 100, y: 60 });
    await Promise.resolve();
    expect(window.detail.position).toEqual({ x: 434, y: 60 });
  });

  it('opens in the middle of the screen (MoveParentCenter, WndQuest.cpp:1157-1159)', () => {
    const { window } = make(state(), { width: 1280, height: 720 });
    expect(window.list.position).toEqual({ x: (1280 - 336) / 2, y: (720 - 416) / 2 });
  });

  it('on a phone: the frame\'s 0.7, the list centred, then the list and its detail centred together', () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    try {
      const { window: quests, q, general } = make(state(), { width: 900, height: 400 });
      expect(quests.list.element.hasAttribute('data-mobile-window')).toBe(true);
      expect(quests.list.position.x).toBe(Math.round((900 - 336 * 0.7) / 2));
      general();
      q('[data-quest-id="151"] .quest-title')!.click();
      const left = (900 - (336 + 272 - 2) * 0.7) / 2;
      expect(Math.abs(quests.list.position.x - left)).toBeLessThanOrEqual(1);
      expect(Math.abs(quests.detail.position.x - (left + 334 * 0.7))).toBeLessThanOrEqual(1);
      q('[data-quest-id="151"] .quest-title')!.click();
      expect(quests.list.position.x).toBe(Math.round((900 - 336 * 0.7) / 2));
    } finally { window.matchMedia = original; }
  });

  it('dispose removes both windows and their listeners', () => {
    const { window } = make();
    window.dispose();
    for (const element of window.elements) expect(element.isConnected).toBe(false);
  });
});

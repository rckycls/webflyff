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
afterEach(() => { for (const window of windows.splice(0)) window.dispose(); });
function make(first: QuestWindowState = state()) {
  const actions = { check: vi.fn(), abandon: vi.fn(), destination: vi.fn(), say: vi.fn() };
  const window = new QuestWindow(art, new Map(), NAMES, actions, document);
  windows.push(window);
  for (const element of window.elements) document.body.append(element);
  window.toggle(800, first);
  const q = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector);
  const qa = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)];
  return { window, actions, q, qa };
}

describe('QuestWindow (APP_QUEST_EX_LIST, APP_QUEST_EX_DETAIL; WndQuest.cpp)', () => {
  it('four tabs titled by 6000-6003, General selected, In Progress by default; the tab and filter survive reopening', () => {
    const { window, q, qa } = make();
    expect(window.list.isOpen).toBe(true);
    expect(qa('[data-quest-tab]').map((tab) => tab.textContent)).toEqual(['Scenario', 'General', 'Request Office', 'Event']);
    expect(q('[data-quest-tab="6001"]')!.getAttribute('aria-pressed')).toBe('true');
    const filter = q<HTMLSelectElement>('select.quest-filter')!;
    expect(filter.value).toBe('current');
    q('[data-quest-tab="6000"]')!.click();
    filter.value = 'all';
    filter.dispatchEvent(new Event('change'));
    window.toggle(800, state());
    expect(window.list.isOpen).toBe(false);
    window.toggle(800, state());
    expect(q('[data-quest-tab="6000"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(q<HTMLSelectElement>('select.quest-filter')!.value).toBe('all');
  });

  it('the tree shows folders with the open and close pictures and leaves; a completed leaf is grey with no box', () => {
    const { q, qa } = make();
    q<HTMLSelectElement>('select.quest-filter')!.value = 'all';
    q('select.quest-filter')!.dispatchEvent(new Event('change'));
    const folder = q('[data-quest-folder="6051"]')!;
    expect(folder.querySelector('img')!.getAttribute('src')).toContain('butttreeopen');
    folder.click();
    expect(q('[data-quest-folder="6051"] img')!.getAttribute('src')).toContain('butttreeclose');
    expect(q('[data-quest-id="151"]')).toBeNull();
    q('[data-quest-folder="6051"]')!.click();
    expect(q('[data-quest-id="151"] .quest-check')).not.toBeNull();
    const done = q('[data-quest-id="83"]')!;
    expect(done.classList.contains('completed')).toBe(true);
    expect(done.querySelector('.quest-check')).toBeNull();
    expect(qa('[data-quest-id]').map((leaf) => leaf.dataset.questId)).toEqual(['151', '84', '83']);
  });

  it('a tick sends check; the box shows what QUEST_CHECKED says, not the click', () => {
    const { window, actions, q } = make();
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
    const { actions, q } = make(state({ current: five, checked: [1, 2, 3, 4, 5] }));
    q('[data-quest-id="151"] .quest-check')!.click();
    expect(actions.check).not.toHaveBeenCalled();
    expect(actions.say).toHaveBeenCalledWith('You cannot check that anymore.');
  });

  it('a leaf toggles the detail with its state text, rows (met ones grey) and rewards', () => {
    const { window, q } = make();
    q('[data-quest-id="151"] .quest-title')!.click();
    expect(window.detail.isOpen).toBe(true);
    expect(q('.quest-contents')!.textContent).toContain('Slay 10 Small Aibatts.');
    expect(q('.quest-conditions')!.textContent).toContain('Defeat Small Aibatt (3/10)');
    expect(q('.quest-rewards')!.textContent).toContain('Penya: 1500');
    q('[data-quest-id="151"] .quest-title')!.click();
    expect(window.detail.isOpen).toBe(false);
  });

  it('abandon is offered only for a removable current quest', () => {
    const { window, actions, q } = make();
    const remove = () => q<HTMLButtonElement>('button.quest-remove')!;
    expect(remove().disabled).toBe(true); // nothing selected
    q('[data-quest-id="151"] .quest-title')!.click();
    expect(remove().disabled).toBe(false);
    window.update(state({ dialogueOpen: true }));
    expect(remove().disabled).toBe(true);
    window.update(state());
    q('[data-quest-id="84"] .quest-title')!.click(); // noRemove
    expect(remove().disabled).toBe(true);
    q('[data-quest-id="151"] .quest-title')!.click();
    remove().click();
    expect(q('.quest-confirm')!.textContent).toContain('Are you going to cancel the quest?');
    q<HTMLButtonElement>('.quest-confirm [data-button="cancel"]')!.click();
    expect(actions.abandon).not.toHaveBeenCalled();
    remove().click();
    q<HTMLButtonElement>('.quest-confirm [data-button="ok"]')!.click();
    expect(actions.abandon).toHaveBeenCalledTimes(1);
    expect(actions.abandon).toHaveBeenCalledWith(151);
  });

  it('a row with a goal calls destination; one without does nothing', () => {
    const { actions, q } = make();
    q('[data-quest-id="151"] .quest-title')!.click();
    q<HTMLButtonElement>('.quest-conditions [data-row="0"]')!.click();
    expect(actions.destination).toHaveBeenCalledWith({ x: 7128, z: 3333, text: 1 });
    q('[data-quest-id="84"] .quest-title')!.click();
    q<HTMLButtonElement>('.quest-conditions [data-row="0"]')!.click();
    expect(actions.destination).toHaveBeenCalledTimes(1);
  });

  it('catalog titles go in as text', () => {
    const { q } = make();
    const title = q('[data-quest-id="84"] .quest-title')!;
    expect(title.textContent).toBe('<b>x</b>');
    expect(title.querySelector('b')).toBeNull();
  });

  it('an update that changes nothing keeps the rows, so a press between two frames lands', () => {
    const { window, q } = make();
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

  it('dispose removes both windows and their listeners', () => {
    const { window } = make();
    window.dispose();
    for (const element of window.elements) expect(element.isConnected).toBe(false);
  });
});

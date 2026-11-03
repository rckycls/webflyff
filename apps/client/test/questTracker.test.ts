// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OwnQuest } from '@flyffweb/protocol';
import type { WebQuest } from '@flyffweb/formats';
import { QuestTracker } from '../src/world/hud/quests/questTracker';
import type { QuestWindowState } from '../src/world/hud/quests/questWindow';
import type { QuestNames, QuestOwner } from '../src/world/quests/questRules';

const MERCENARY: WebQuest = {
  id: 151, title: 'The Path of the Mercenary', head: 6051,
  kills: [{ slot: 0, mover: 20, count: 10, goal: { x: 7128, z: 3333, text: 1 } }, { slot: 1, mover: 21, count: 2 }],
  states: { 0: 'Slay 10 Small Aibatts.', 14: '' },
};
const LETTER: WebQuest = { id: 83, title: 'A Letter', head: 6004, kills: [{ slot: 0, mover: 20, count: 1 }], states: { 0: 'x' } };
const CATALOG = new Map<number, WebQuest>([[151, MERCENARY], [83, LETTER]]);
const own = (id: number, kills: [number, number] = [0, 0]): OwnQuest => ({ id, state: 0, time: 0, kills, patrol: false, dialog: false });
const OWNER: QuestOwner = {
  level: 15, job: 0, sex: 0, gold: 0, expPercent: 0, skillLevel: () => 0, itemCount: () => 0, completed: [],
};
const NAMES: QuestNames = { mover: (id) => (id === 20 ? 'Small Aibatt' : 'Aibatt'), item: () => 'item', npc: () => 'Mustang' };
const state = (extra: Partial<QuestWindowState> = {}): QuestWindowState => ({
  catalog: CATALOG, current: new Map([[151, own(151, [3, 2])], [83, own(83)]]), completed: [], checked: [83, 151],
  owner: OWNER, dialogueOpen: false, ...extra,
});

const trackers: QuestTracker[] = [];
afterEach(() => { for (const tracker of trackers.splice(0)) tracker.dispose(); });
function make() {
  const actions = { title: vi.fn(), destination: vi.fn() };
  const tracker = new QuestTracker(new Map(), NAMES, actions, document);
  trackers.push(tracker);
  document.body.append(tracker.element);
  const qa = (selector: string) => [...tracker.element.querySelectorAll<HTMLElement>(selector)];
  return { tracker, actions, qa };
}

describe('QuestTracker (APP_QUEST_QUICK_INFO; WndQuestQuickInfo.cpp)', () => {
  it('hidden with no checked quest; one title row and its condition rows per checked quest, in checked order', () => {
    const { tracker, qa } = make();
    tracker.update(state({ checked: [] }));
    expect(tracker.element.hidden).toBe(true);
    expect(tracker.element.classList.contains('hud-quest-tracker')).toBe(true);
    expect(tracker.element.querySelector('.hud-window-close')).toBeNull();
    tracker.update(state());
    expect(tracker.element.hidden).toBe(false);
    expect(qa('.tracker-title').map((title) => title.textContent)).toEqual(['A Letter', 'The Path of the Mercenary']);
    expect(qa('[data-tracker-quest="151"] .tracker-row').map((row) => row.textContent))
      .toEqual(['Defeat Small Aibatt (3/10)', 'Defeat Aibatt (2/2)']);
    tracker.update(state({ checked: [9, 151] })); // a quest the catalog or the player lacks is skipped
    expect(qa('.tracker-title').map((title) => title.textContent)).toEqual(['The Path of the Mercenary']);
  });

  it('titles yellow, rows white; met rows grey', () => {
    const { tracker, qa } = make();
    tracker.update(state({ checked: [151] }));
    const [unmet, met] = qa('.tracker-row');
    expect(unmet!.classList.contains('met')).toBe(false);
    expect(met!.classList.contains('met')).toBe(true);
    expect(qa('.tracker-title')).toHaveLength(1);
  });

  it('a title calls title(id); a row with a goal calls destination', () => {
    const { tracker, actions, qa } = make();
    tracker.update(state({ checked: [151] }));
    qa('.tracker-title')[0]!.click();
    expect(actions.title).toHaveBeenCalledWith(151);
    qa('.tracker-row')[0]!.click();
    expect(actions.destination).toHaveBeenCalledWith({ x: 7128, z: 3333, text: 1 });
    expect(qa('.tracker-row')[0]!.classList.contains('selected')).toBe(true);
    qa('.tracker-row')[1]!.click(); // no goal
    expect(actions.destination).toHaveBeenCalledTimes(1);
  });

  it('it rebuilds only when the checked list or a checked quest changes', () => {
    const { tracker, qa } = make();
    tracker.update(state());
    const before = qa('.tracker-title')[0];
    tracker.update(state());
    expect(qa('.tracker-title')[0]).toBe(before);
    tracker.update(state({ current: new Map([[151, own(151, [3, 2])], [83, own(83)], [7, own(7)]]) })); // not checked
    expect(qa('.tracker-title')[0]).toBe(before);
    tracker.update(state({ current: new Map([[151, own(151, [4, 2])], [83, own(83)]]) }));
    expect(qa('.tracker-title')[0]).not.toBe(before);
    expect(qa('[data-tracker-quest="151"] .tracker-row')[0]!.textContent).toBe('Defeat Small Aibatt (4/10)');
    const again = qa('.tracker-title')[0];
    tracker.update(state({ checked: [151, 83], current: new Map([[151, own(151, [4, 2])], [83, own(83)]]) }));
    expect(qa('.tracker-title')[0]).not.toBe(again);
    expect(qa('.tracker-title')[0]!.textContent).toBe('The Path of the Mercenary');
  });

  it('dispose removes it', () => {
    const { tracker } = make();
    tracker.update(state());
    tracker.dispose();
    expect(tracker.element.isConnected).toBe(false);
  });
});

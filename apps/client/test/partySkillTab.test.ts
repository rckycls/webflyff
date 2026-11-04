// @vitest-environment jsdom
// The party window's Skill tab (Piece 7 M4, [R §7.2]): CWndPartySkill, WndParty.cpp:834-1022.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebParty } from '@flyffweb/formats';
import type { UiArt } from '../src/world/hud/art';
import { PartySkillTab } from '../src/world/hud/party/partySkillTab';
import { PartyState } from '../src/world/party/partyState';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };
const NAMES = ['Call', 'Blitz', 'Retreat', 'Precision', 'Linked Attack', 'Lucky Drop', 'Resting', 'Gift Box'];
const LEVELS = [10, 10, 10, 17, 20, 25, 30, 40];
const CATALOG: WebParty = {
  skills: NAMES.map((name, i) => ({
    id: i + 1, name, description: `${name} does things.`, icon: `ui/skill_${i + 1}.png`, level: LEVELS[i]!, points: 0,
    skillTime: null, sfx: null, sfx2: null,
  })),
  exp: [], invalidNames: [], letters: '',
};
const OWN = 500;

function party(kind: number, level: number): PartyState {
  const state = new PartyState({ ownPlayerId: () => OWN, inView: () => true, nameInView: () => null, skillName: () => '', defaultName: () => '' });
  state.apply({
    type: 'partyMember', playerId: OWN, leaderName: '', memberName: '',
    party: {
      partyId: 1, kind, level, exp: 0, point: 0, expMode: 0, itemMode: 0, duelPartyId: 0, modeTime: [0, 0, 0, 0, 0], name: kind === 0 ? '' : 'Winners',
      members: [{ playerId: OWN, removed: false }, { playerId: 2, removed: false }],
    },
  });
  return state;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('PartySkillTab', () => {
  const cells = (tab: PartySkillTab) => [...tab.element.querySelectorAll<HTMLElement>('.hud-party-skill')];

  it('8 skills in a 3 x 3 grid, the 9th empty; red and dim below the level or in a normal party', () => {
    const tab = new PartySkillTab(art, { width: 426, height: 130 });
    document.body.append(tab.element);
    tab.update(party(1, 20), CATALOG);
    expect(cells(tab).map((cell) => cell.dataset.skill)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
    // w = 426 / 3 = 142, h = 130 / 3 = 43: the icon at (col * w + 3, row * h + 3), the name at (col * w + 35, row * h + 6)
    const icon = (i: number) => cells(tab)[i]!.querySelector<HTMLImageElement>('img')!;
    const name = (i: number) => cells(tab)[i]!.querySelector<HTMLElement>('.hud-party-skill-name')!;
    expect([icon(4).style.left, icon(4).style.top]).toEqual(['145px', '46px']);
    expect([name(7).style.left, name(7).style.top, name(7).textContent]).toEqual(['177px', '92px', 'Gift Box']);
    expect(icon(0).getAttribute('src')).toBe('/assets/ui/skill_1.png');
    // level 20: Linked Attack usable, Lucky Drop not
    expect([name(4).style.color, icon(4).style.opacity]).toEqual(['rgb(0, 0, 0)', '1']);
    expect([name(5).style.color, icon(5).style.opacity]).toEqual(['rgb(255, 0, 0)', String(54 / 255)]);
    // the tooltip: the name, then the description
    expect(cells(tab)[0]!.title).toBe('Call\nCall does things.');
    // a normal party: every skill red and dim
    tab.update(party(0, 40), CATALOG);
    expect(cells(tab).map((cell) => cell.querySelector<HTMLElement>('.hud-party-skill-name')!.style.color)).toEqual(new Array(8).fill('rgb(255, 0, 0)'));
  });

  it('a double click uses, a drag makes a type-2 shortcut', () => {
    const tab = new PartySkillTab(art, { width: 426, height: 130 });
    document.body.append(tab.element);
    const use = vi.fn();
    const drag = vi.fn();
    tab.onUse = use;
    tab.onDrag = drag;
    tab.update(party(1, 20), CATALOG);
    cells(tab)[4]!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(use.mock.calls).toEqual([[5]]);
    // a drag needs the party level only (WndParty.cpp:1003-1018): Gift Box (40) does not leave
    const down = (cell: HTMLElement) => {
      const event = new MouseEvent('pointerdown', { bubbles: true, button: 0 }) as PointerEvent;
      cell.dispatchEvent(event);
      return event;
    };
    const event = down(cells(tab)[4]!);
    down(cells(tab)[7]!);
    expect(drag.mock.calls).toEqual([[5, event]]);
    // no catalog: nothing
    tab.update(party(1, 20), null);
    expect(cells(tab)).toEqual([]);
  });
});

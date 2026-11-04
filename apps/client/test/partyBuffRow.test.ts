// @vitest-environment jsdom
// The party skills' mode icons (Piece 7 M4, [R §8.4]): CWndWorld::RenderBuff, WndWorld.cpp:10637-10745.

import { afterEach, describe, expect, it } from 'vitest';
import type { WebParty } from '@flyffweb/formats';
import { MoverBuffs } from '../src/world/buffs';
import type { UiArt } from '../src/world/hud/art';
import { PartyBuffRow } from '../src/world/hud/party/partyBuffRow';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };
const CATALOG: WebParty = {
  skills: [
    { id: 5, name: 'Linked Attack', description: 'More damage.', icon: 'ui/skill_trolinkattack.png', level: 20, points: 1, skillTime: 20000, sfx: 1505, sfx2: null },
    { id: 6, name: 'Lucky Drop', description: 'More drops.', icon: 'ui/skill_trofortunecircle.png', level: 25, points: 5, skillTime: 300000, sfx: 1506, sfx2: null },
  ],
  exp: [], invalidNames: [], letters: '',
};
/** `BUFF_SKILL`. */
const BUFF_SKILL = 1;

afterEach(() => {
  document.body.replaceChildren();
});

describe('PartyBuffRow', () => {
  const icons = (row: PartyBuffRow) => [...row.element.querySelectorAll<HTMLElement>('.hud-party-buff')];

  it('a mode on adds its icon with its time; it blinks in its last 20 s and goes at its end; hidden while the leader is out of view', () => {
    const row = new PartyBuffRow(art);
    document.body.append(row.element);
    const buffs = new MoverBuffs();
    row.update(buffs, CATALOG, true, 0);
    expect(icons(row)).toEqual([]);
    buffs.add(BUFF_SKILL, 6, 1, 300000, 0);
    buffs.add(BUFF_SKILL, 5, 1, 20000, 0);
    row.update(buffs, CATALOG, true, 1000);
    expect(row.element.hidden).toBe(false);
    // from x = width / 2 − 100, 37 px to the left each, in the buffs' order
    expect(icons(row).map((icon) => [icon.dataset.skill, icon.style.left])).toEqual([['5', '0px'], ['6', '-37px']]);
    const lucky = icons(row)[1]!;
    expect(lucky.querySelector('img')!.getAttribute('src')).toBe('/assets/ui/skill_trofortunecircle.png');
    expect(lucky.style.opacity).toBe(String(192 / 255));
    expect(lucky.querySelector('.hud-party-buff-time')!.textContent).toBe('299');
    expect(lucky.title).toBe('Lucky Drop\n04:59\nMore drops.');
    // Linked Attack has 19 s left: it blinks, 6 a frame from 192
    expect(icons(row)[0]!.style.opacity).toBe(String(186 / 255));
    row.update(buffs, CATALOG, true, 2000);
    expect(icons(row)[0]!.style.opacity).toBe(String(180 / 255));
    // its end: gone
    row.update(buffs, CATALOG, true, 20000);
    expect(icons(row).map((icon) => icon.dataset.skill)).toEqual(['6']);
    // the leader out of view and no mode 4: hidden
    row.update(buffs, CATALOG, false, 21000);
    expect(row.element.hidden).toBe(true);
  });
});

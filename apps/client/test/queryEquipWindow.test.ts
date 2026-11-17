// @vitest-environment jsdom
// 2026-11-17 (view-equip-options): the View Equipment window, CWndQueryEquip (WndField.cpp:511-969), APP_QUERYEQUIP.

import { afterEach, describe, expect, it } from 'vitest';
import type { QueryEquipPart } from '@flyffweb/protocol';
import type { ClientText } from '../src/world/gameData';
import { QueryEquipWindow, iconPlacement, queryEquipItem } from '../src/world/hud/queryEquipWindow';
import type { QueryEquipTarget } from '../src/world/hud/queryEquipWindow';
import { SUIT, WOODEN_SWORD, itemProp } from './helpers/ownState';

const ART = { url: (key: string) => key, sheets: null };
const BOW = itemProp({ id: 30, name: 'Bow', kind1: 1, kind2: 2, kind3: 7, handed: 2, part: 10, icon: 'bow.dds' });
const RING = itemProp({ id: 40, name: 'Ring', kind2: 21, part: 20, icon: 'ring.dds' });
const HAT = itemProp({ id: 50, name: 'Fashion Hat', part: 26, icon: 'hat.dds' });
const PROPS = new Map([
  [WOODEN_SWORD.id, { ...WOODEN_SWORD, icon: 'sword.dds' }], [SUIT.id, { ...SUIT, icon: 'suit.dds' }],
  [BOW.id, BOW], [RING.id, RING], [HAT.id, HAT],
]);
const texts = new Map<string, ClientText>([['TID_GAME_TOOLTIP_DEFENSE_B', { id: 'TID_GAME_TOOLTIP_DEFENSE_B', text: 'DEF', color: 0xffffffff }]]);
const DATA = { texts, itemProps: PROPS };

const target = (worn: QueryEquipTarget['worn']): QueryEquipTarget => ({
  objectId: 0x55, name: 'Lead', viewer: { sex: 1, job: 16, level: 75 }, worn,
});

let made: QueryEquipWindow[] = [];
afterEach(() => {
  for (const w of made) w.dispose();
  made = [];
  document.body.replaceChildren();
});

function make(): QueryEquipWindow {
  const w = new QueryEquipWindow(ART, DATA, document);
  made.push(w);
  document.body.append(w.frame.element);
  return w;
}

const slot = (w: QueryEquipWindow, part: number) =>
  [...w.frame.element.querySelectorAll<HTMLButtonElement>('.hud-query-equip-slot')].find((s) => s.dataset.parts?.split(' ').includes(String(part)))!;

describe('QueryEquipWindow', () => {
  it('is Neuz\'s "View" window: WndQueryEquip.tga, 236 x 284, centred, its model at WIDC_CUSTOM20', () => {
    const w = make();
    w.open(target([]), []);
    expect(w.isOpen).toBe(true);
    expect(w.objectId).toBe(0x55);
    expect(w.frame.element.querySelector('.hud-window-title')?.textContent).toBe('View');
    expect(w.frame.element.style.width).toBe('236px');
    expect(w.frame.element.style.height).toBe('284px');
    const model = w.frame.element.querySelector<HTMLElement>('.hud-query-equip-model')!;
    expect([model.style.left, model.style.top, model.style.width, model.style.height]).toEqual(['54px', '32px', '120px', '174px']);
    // 19 slots, empty ones disabled
    expect(w.frame.element.querySelectorAll('.hud-query-equip-slot')).toHaveLength(19);
    expect(slot(w, 10).disabled).toBe(true);
  });

  it('draws each worn part at its slot as OnDraw does: +6 at 1, the jewellery at 0.8, the costume at 0.9', () => {
    expect(iconPlacement(10)).toEqual({ offset: 6, scale: 1 });
    expect(iconPlacement(20)).toEqual({ offset: 0, scale: 0.8 });
    expect(iconPlacement(26)).toEqual({ offset: 0, scale: 0.9 });
    const w = make();
    w.open(target([
      { part: 10, itemId: WOODEN_SWORD.id, flag: 0, option: 7 }, { part: 2, itemId: SUIT.id, flag: 0 },
      { part: 20, itemId: RING.id, flag: 0 }, { part: 26, itemId: HAT.id, flag: 1 },
    ]), []);
    const sword = slot(w, 10);
    expect(sword.disabled).toBe(false);
    expect(sword.getAttribute('aria-label')).toBe('Wooden Sword');
    expect(sword.style.left).toBe('6px');
    const icon = (part: number) => w.frame.element.querySelector<HTMLElement>(`.hud-query-equip-icon[data-part="${part}"]`)!;
    expect([icon(10).style.left, icon(10).style.width]).toEqual(['6px', '32px']);
    expect([icon(20).style.left, icon(20).style.width]).toEqual(['0px', '25.6px']);
    expect(icon(26).style.width).toBe('28.8px');
    // the expired hat tinted
    expect(icon(26).querySelector('.hud-query-equip-expired')).not.toBeNull();
    expect(icon(10).querySelector('.hud-query-equip-expired')).toBeNull();
  });

  it('a two-handed weapon\'s copy in the left hand at alpha 100', () => {
    const w = make();
    w.open(target([{ part: 9, itemId: BOW.id, flag: 0 }, { part: 10, itemId: BOW.id, flag: 0 }]), []);
    const icon = (part: number) => w.frame.element.querySelector<HTMLElement>(`.hud-query-equip-icon[data-part="${part}"]`)!;
    expect(Number(icon(9).style.opacity)).toBeCloseTo(100 / 255);
    expect(icon(10).style.opacity).toBe('');
  });

  it('the tooltip item is m_aEquipInfo\'s (id, flag, upgrade & 0xFF) with QUERYEQUIP\'s extras', () => {
    const extra: QueryEquipPart = { part: 10, randomOption: 5n, piercing: [9001, 0], ultimate: [], resist: 1, resistOption: 4 };
    expect(queryEquipItem({ part: 10, itemId: 21, flag: 0, option: 0x0507 }, extra)).toEqual({
      objectId: 10, itemId: 21, count: 1, abilityOption: 7, resist: 1, resistOption: 4, randomOption: 5n, piercing: [9001, 0],
    });
    expect(queryEquipItem({ part: 2, itemId: 502, flag: 1 }, undefined)).toEqual({ objectId: 2, itemId: 502, count: 1, flag: 1 });
  });

  it('the mouse over a worn part shows its tooltip; the worn parts drawn again when they change; closing forgets the player', () => {
    const w = make();
    w.open(target([{ part: 2, itemId: SUIT.id, flag: 0, option: 3 }]), []);
    slot(w, 2).dispatchEvent(new MouseEvent('mouseenter'));
    const tip = w.frame.element.querySelector('.hud-query-equip-tooltip');
    expect(tip?.textContent).toContain('Cotton Suit');
    slot(w, 2).dispatchEvent(new MouseEvent('mouseleave'));
    expect(w.frame.element.querySelector('.hud-query-equip-tooltip')).toBeNull();
    w.update(target([{ part: 2, itemId: SUIT.id, flag: 0 }, { part: 10, itemId: WOODEN_SWORD.id, flag: 0 }]));
    expect(slot(w, 10).disabled).toBe(false);
    // another player's update is not this window's
    w.update({ ...target([]), objectId: 0x66 });
    expect(slot(w, 10).disabled).toBe(false);
    w.close();
    expect(w.objectId).toBeNull();
  });
});

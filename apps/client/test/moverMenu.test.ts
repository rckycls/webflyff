// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WebNpc } from '@flyffweb/formats';
import { MENU_RANGE, MMI, MoverMenu, npcMenuEntries, soleEntry } from '../src/world/hud/moverMenu';

const text = (id: string, textId: number, value: string) => [id, { id, text: value, textId, color: 0xffffffff }] as const;
const TEXTS = new Map([
  text('TID_MMI_DIALOG', 7000, 'Dialog'), text('TID_MMI_TRADE', 7002, 'Trade'), text('TID_MMI_BANKING', 7009, 'Deposit'),
  text('TID_MMI_GUILDBANKING', 7015, 'Guild Warehouse'), text('TID_MMI_ARENA_ENTER', 7080, 'Arena'),
]);
const JULIA: WebNpc = { key: 'MaFl_Juria', name: 'Julia', menus: [0, 9, 15, 16, 17, 18, 2, 137] };

describe('npcMenuEntries (CWndWorld::ShowMoverMenu, WndWorld.cpp:6649-6684)', () => {
  it("Julia's menu is in MMI order, without the guild warehouse", () => {
    expect(npcMenuEntries(JULIA, TEXTS, false).map((entry) => entry.id)).toEqual([0, 2, 9, 16, 17, 18, 137]);
  });

  it("Dialog, a shop's Trade and a teleporter's Teleport are enabled; the rest is greyed", () => {
    const enabled = (npc: WebNpc) => npcMenuEntries(npc, TEXTS, false).filter((entry) => entry.enabled).map((entry) => entry.id);
    expect(enabled(JULIA)).toEqual([MMI.DIALOG, MMI.TRADE]);
    expect(enabled({ ...JULIA, vendorType: 1 })).toEqual([MMI.DIALOG]);
    expect(enabled({ key: 't', name: 'T', menus: [0, 146] })).toEqual([MMI.DIALOG]);
    expect(enabled({ key: 't', name: 'T', menus: [0, 146], teleports: [{ x: 1, z: 2 }] })).toEqual([MMI.DIALOG, MMI.TELEPORTER]);
  });

  it("Buff Pang's Get Buffed! (MMI_NPC_BUFF 74) is enabled, with its TID_MMI_DIALOG + 74 text", () => {
    const pang: WebNpc = { key: 'MaFl_Helper', name: 'Buff Pang', menus: [0, 74] };
    const texts = new Map([...TEXTS, text('TID_MMI_NPC_BUFF', 7074, 'Get Buffed!')]);
    expect(npcMenuEntries(pang, texts, true)).toEqual([
      { id: MMI.DIALOG, label: 'Dialog', enabled: true }, { id: MMI.NPC_BUFF, label: 'Get Buffed!', enabled: true },
    ]);
    expect(MMI.NPC_BUFF).toBe(74);
    expect(soleEntry({ key: 'p', name: 'P', menus: [74] }, npcMenuEntries({ key: 'p', name: 'P', menus: [74] }, texts, false))).toBe(74);
  });

  it("the Pet Tamer's food mill and rename cancel are enabled; R4's egg exchange, resurrections and awakening cancel greyed (pets R3)", () => {
    // MaFl_PetTamer (Resource/character.inc:6164-6188): DIALOG, FOODMILL 58, EGG01 96, RES 77, RES01 78, AWAK_CANCEL 104, RENAME_CANCEL 120
    const tamer: WebNpc = { key: 'MaFl_PetTamer', name: 'Pet Tamer', menus: [0, 58, 96, 77, 78, 104, 120] };
    const entries = npcMenuEntries(tamer, TEXTS, false);
    expect(entries.map((entry) => entry.id)).toEqual([0, 58, 77, 78, 96, 104, 120]);
    expect(entries.filter((entry) => entry.enabled).map((entry) => entry.id)).toEqual([MMI.DIALOG, MMI.PET_FOODMILL, MMI.RENAME_CANCEL]);
    expect([MMI.PET_FOODMILL, MMI.RENAME_CANCEL]).toEqual([58, 120]);
  });

  it('Arena entry is left out for a base job', () => {
    const npc: WebNpc = { key: 'a', name: 'A', menus: [0, 80] };
    expect(npcMenuEntries(npc, TEXTS, true).map((entry) => entry.id)).toEqual([0]);
    expect(npcMenuEntries(npc, TEXTS, false).map((entry) => entry.id)).toEqual([0, 80]);
  });

  it('labels are TID_MMI_DIALOG + id', () => {
    expect(npcMenuEntries(JULIA, TEXTS, false).find((entry) => entry.id === 9)!.label).toBe('Deposit');
    const bare = npcMenuEntries({ key: 't', name: 'T', menus: [0, 2, 146] }, new Map(), false);
    expect(bare.map((entry) => entry.label)).toEqual(['Dialog', 'Trade', 'Teleport']);
  });

  it('one entry or none runs at once', () => {
    const sole = (npc: WebNpc | undefined) => soleEntry(npc, npcMenuEntries(npc, TEXTS, false));
    expect(sole({ key: 't', name: 'T', menus: [146], teleports: [{ x: 1, z: 2 }] })).toBe(146);
    expect(sole({ key: 't', name: 'T', menus: [] })).toBe(0);
    expect(sole(undefined)).toBe(0);
    expect(sole({ key: 't', name: 'T', menus: [0, 2] })).toBeNull();
    expect(MENU_RANGE).toBe(20);
  });

  it('a sole entry the browser cannot open shows the menu with it greyed instead', () => {
    const sole = (npc: WebNpc) => soleEntry(npc, npcMenuEntries(npc, TEXTS, false));
    expect(sole({ key: 'MaFl_InstantBank', name: 'Bank', menus: [9] })).toBeNull();
    expect(sole({ key: 't', name: 'T', menus: [146] })).toBeNull(); // a teleporter with no destinations
    expect(sole({ key: 't', name: 'T', menus: [2], vendorType: 1 })).toBeNull();
  });
});

describe('MoverMenu (CWndMenu, WndControl.cpp:3337-3630)', () => {
  const menus: MoverMenu[] = [];
  afterEach(() => { for (const menu of menus.splice(0)) menu.dispose(); });
  const make = () => { const menu = new MoverMenu(document); menus.push(menu); document.body.append(menu.element); return menu; };

  it('opens at the given point with one button per entry, in order, the greyed ones disabled', () => {
    const menu = make();
    menu.open(npcMenuEntries(JULIA, TEXTS, false), { x: 120, y: 80 }, vi.fn());
    expect(menu.isOpen).toBe(true);
    expect([menu.element.style.left, menu.element.style.top]).toEqual(['120px', '80px']);
    const buttons = [...menu.element.querySelectorAll<HTMLButtonElement>('button[data-menu-entry]')];
    expect(buttons.map((button) => button.dataset.menuEntry)).toEqual(['0', '2', '9', '16', '17', '18', '137']);
    expect(buttons.map((button) => button.disabled)).toEqual([false, false, true, true, true, true, true]);
  });

  it('choosing an enabled entry calls back once and closes; a greyed one does nothing', () => {
    const menu = make();
    const choose = vi.fn();
    menu.open(npcMenuEntries(JULIA, TEXTS, false), { x: 0, y: 0 }, choose);
    menu.element.querySelector<HTMLButtonElement>('[data-menu-entry="9"]')!.click();
    expect(choose).not.toHaveBeenCalled();
    menu.element.querySelector<HTMLButtonElement>('[data-menu-entry="2"]')!.click();
    expect(choose).toHaveBeenCalledTimes(1);
    expect(choose).toHaveBeenCalledWith(2);
    expect(menu.isOpen).toBe(false);
  });

  it('remembers the NPC it was opened for until it closes', () => {
    const menu = make();
    menu.open(npcMenuEntries(JULIA, TEXTS, false), { x: 0, y: 0 }, vi.fn(), 9002);
    expect(menu.npcId).toBe(9002);
    menu.close();
    expect(menu.npcId).toBeNull();
  });

  it('stays inside its layer: pushed back from the right and bottom edges, 4 px in', () => {
    const layer = document.createElement('div');
    Object.defineProperties(layer, { clientWidth: { value: 300 }, clientHeight: { value: 200 } });
    document.body.append(layer);
    const menu = new MoverMenu(document);
    menus.push(menu);
    layer.append(menu.element);
    Object.defineProperties(menu.element, { offsetWidth: { value: 100 }, offsetHeight: { value: 150 } });
    menu.open(npcMenuEntries(JULIA, TEXTS, false), { x: 280, y: 120 }, vi.fn());
    expect([menu.element.style.left, menu.element.style.top]).toEqual(['196px', '46px']);
    menu.open(npcMenuEntries(JULIA, TEXTS, false), { x: -20, y: -5 }, vi.fn());
    expect([menu.element.style.left, menu.element.style.top]).toEqual(['4px', '4px']);
    layer.remove();
  });

  it('a press outside or Escape closes it; no listener stays after close or dispose', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const menu = make();
    menu.open(npcMenuEntries(JULIA, TEXTS, false), { x: 0, y: 0 }, vi.fn());
    menu.element.querySelector('button')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(menu.isOpen).toBe(true); // a press inside is the menu's
    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(menu.isOpen).toBe(false);
    menu.open(npcMenuEntries(JULIA, TEXTS, false), { x: 0, y: 0 }, vi.fn());
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.body.dispatchEvent(escape);
    expect(menu.isOpen).toBe(false);
    expect(escape.defaultPrevented).toBe(true);
    menu.dispose();
    expect(remove.mock.calls.length).toBe(add.mock.calls.length);
    expect(menu.element.isConnected).toBe(false);
    add.mockRestore(); remove.mockRestore();
  });
});

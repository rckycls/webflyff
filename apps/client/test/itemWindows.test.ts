// The item windows' rules (2026-11-05, docs/superpowers/specs/2026-11-05-item-windows-research.md §3).

import { describe, expect, it } from 'vitest';
import type { WebItemProp } from '@flyffweb/formats';
import {
  attributeRefusal, createMonsterRefusal, nameRefusal, sexChangeRefusal, ticketInUse, ticketUse, transyRefusal, transyTwin, windowOf,
} from '../src/world/items/itemWindows';

const prop = (over: Partial<WebItemProp>): WebItemProp => ({
  id: 1, name: 'x', packMax: 1, kind1: 2, kind2: 0, kind3: 0, handed: -1, part: -1, abilityMin: 0, abilityMax: 0,
  weaponType: -1, attackSpeed: -1, attackRange: -1, destParams: [-1, -1, -1], adjParams: [-1, -1, -1], sfxHit: -1,
  model: null, icon: null, ...over,
} as WebItemProp);

describe('windowOf', () => {
  it('the items whose use is a window', () => {
    expect(windowOf(prop({ id: 10424 }))).toBe('rename');
    expect(windowOf(prop({ id: 26202 }))).toBe('partySummon');
    expect(windowOf(prop({ id: 26529, kind3: 122 }))).toBe('ticket');
    expect(windowOf(prop({ id: 10220 }))).toBe('sexChange');
    expect(windowOf(prop({ id: 20037 }))).toBe('attribute');
    expect(windowOf(prop({ id: 26204 }))).toBe('transy');
    expect(windowOf(prop({ id: 26218 }))).toBe('transy');
    expect(windowOf(prop({ id: 30500, kind3: 85 }))).toBe('createMonster');
    expect(windowOf(prop({ id: 26205 }))).toBeNull();
  });
});

describe('nameRefusal (CWndChangeName, WndTitle.cpp:2723-2785)', () => {
  it('trimmed; 4-16 letters and digits, no digit first', () => {
    expect(nameRefusal('  Webster ')).toEqual({ name: 'Webster', tid: null });
    expect(nameRefusal('   ').tid).toBe('TID_DIAG_0031');
    expect(nameRefusal('Web').tid).toBe('TID_DIAG_RULE_0');
    expect(nameRefusal('W'.repeat(17)).tid).toBe('TID_DIAG_RULE_0');
    expect(nameRefusal('1Webster').tid).toBe('TID_DIAG_0012');
    expect(nameRefusal('Web ster').tid).toBe('TID_DIAG_0013');
    expect(nameRefusal('Web_ster').tid).toBe('TID_DIAG_0013');
  });
});

describe('ticketUse (DPClient.cpp:10700-10750, ticket.inc, layer.inc)', () => {
  it('in its world it leaves; elsewhere its channels; expired, a plain use', () => {
    const kebaras = prop({ id: 26529, kind3: 122 });
    expect(ticketUse(kebaras, { flag: 0 }, 2)).toEqual({ kind: 'leave' });
    expect(ticketUse(kebaras, { flag: 0 }, 1)).toEqual({ kind: 'channels', count: 2 });
    expect(ticketUse(prop({ id: 26681, kind3: 122 }), {}, 3)).toEqual({ kind: 'leave' });
    expect(ticketUse(kebaras, { flag: 1 }, 1)).toEqual({ kind: 'use' });
    expect(ticketUse(prop({ id: 99999, kind3: 122 }), {}, 1)).toEqual({ kind: 'use' });
  });
});

describe('sexChangeRefusal (DPClient.cpp:10554-10571)', () => {
  it('only the head, hair, weapons, shield, ride and the jewels to the bullet may be worn', () => {
    const none = Array(31).fill(0xffffffff);
    expect(sexChangeRefusal(none)).toBeNull();
    const weapon = [...none];
    weapon[10] = 7; weapon[13] = 8; weapon[19] = 9; weapon[25] = 10;
    expect(sexChangeRefusal(weapon)).toBeNull();
    const suit = [...none];
    suit[2] = 7;
    expect(sexChangeRefusal(suit)).toBe('TID_GAME_CHECK_EQUIP');
  });
});

describe('attributeRefusal (CWndChangeAttribute, WndField.cpp:23080-23092)', () => {
  it('a suit or weapon with an element upgrade', () => {
    const sword = prop({ kind1: 1, kind2: 2, kind3: 3, part: 10 });
    expect(attributeRefusal(sword, { resistOption: 2 })).toBeNull();
    expect(attributeRefusal(sword, {})).toBe('TID_GAME_NOTELEMENT');
    expect(attributeRefusal(prop({ kind2: 13 }), { resistOption: 2 })).toBe('TID_GAME_NOTELEMENT');
  });
});

describe('the transmute (GetTransyItem, Mover.cpp:2971-3020; CWndItemTransy, WndChangeFace.cpp:495-575)', () => {
  const male = prop({ id: 600, kind2: 7, kind3: 18, part: 2, sex: 0, abilityMin: 10, abilityMax: 12, limitLevel: 30, name: 'Suit M' });
  const female = prop({ id: 601, kind2: 7, kind3: 18, part: 2, sex: 1, abilityMin: 10, abilityMax: 12, limitLevel: 30, name: 'Suit F' });
  const other = prop({ id: 602, kind2: 7, kind3: 18, part: 2, sex: 1, abilityMin: 11, abilityMax: 12 });
  const catalog = new Map([[600, male], [601, female], [602, other]]);

  it("the twin is the other sex's piece with the same kinds, job, part, level, ability and speed, both or neither in a set", () => {
    expect(transyTwin(male, catalog, new Set())?.id).toBe(601);
    expect(transyTwin(female, catalog, new Set())?.id).toBe(600);
    expect(transyTwin(male, catalog, new Set([600]))).toBeNull();
    expect(transyTwin(prop({ id: 603, kind2: 13, sex: 0 }), catalog, new Set())).toBeNull();
  });

  it('refusals: worn, no twin, and the scroll for the level (A to 60, B from 61)', () => {
    expect(transyRefusal(26204, male, true, catalog, new Set())).toEqual({ tid: 'TID_GAME_EQUIPPUT' });
    expect(transyRefusal(26204, prop({ id: 603, kind2: 13, sex: 0 }), false, catalog, new Set())).toEqual({ tid: 'TID_GAME_ITEM_TRANSY' });
    expect(transyRefusal(26218, male, false, catalog, new Set())).toEqual({ tid: 'TID_GAME_ITEM_TRANSY_NOT_LEVEL_1', scroll: true });
    const high = new Map([[700, { ...male, id: 700, limitLevel: 61 }], [701, { ...female, id: 701, limitLevel: 61 }]]);
    expect(transyRefusal(26204, high.get(700)!, false, high, new Set())).toEqual({ tid: 'TID_GAME_ITEM_TRANSY_NOT_LEVEL_0', scroll: true });
    expect(transyRefusal(26204, male, false, catalog, new Set())).toBeNull();
  });
});

describe('createMonsterRefusal (WndWorldControlPlayer.cpp:240-285)', () => {
  it('within 15 of the player, in Madrigal, on walkable land', () => {
    expect(createMonsterRefusal({ distance: 10, worldId: 1, landAttr: 0 })).toBeNull();
    expect(createMonsterRefusal({ distance: 16, worldId: 1, landAttr: 0 })).toBe('TID_GAME_CREATEMON_F_15');
    expect(createMonsterRefusal({ distance: 10, worldId: 2, landAttr: 0 })).toBe('TID_GAME_CREATEMON_F_AREA');
    expect(createMonsterRefusal({ distance: 10, worldId: 1, landAttr: 1 })).toBe('TID_GAME_CREATEMON_F_AREA');
  });
});

describe('ticketInUse (2026-11-05, CMover::GetTicket)', () => {
  const props = new Map([[26529, prop({ id: 26529, kind2: 19, kind3: 122 })], [500, prop({ id: 500 })]]);
  it('the first bag item of the ticket whose item buff is on, with a keep time, not expired', () => {
    const items = [
      { objectId: 9, itemId: 26529, keepTime: 600 }, { objectId: 4, itemId: 26529, keepTime: 600 },
      { objectId: 2, itemId: 26529 }, { objectId: 3, itemId: 26529, keepTime: 600, flag: 1 },
    ];
    expect(ticketInUse(items, props, [500, 26529])).toBe(4);
    expect(ticketInUse(items, props, [500])).toBeNull();
    expect(ticketInUse([{ objectId: 2, itemId: 26529 }], props, [26529])).toBeNull();
  });
});

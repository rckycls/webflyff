// The premium items and scrolls (2026-11-05, docs/superpowers/specs/2026-11-05-buffs-premium-research.md §4): what the
// bag and the task bar use, Neuz's refusals and boxes, the cool-down groups and the premium timers' clock.

import { describe, expect, it } from 'vitest';
import type { WebItemProp } from '@flyffweb/formats';
import {
  ItemCooldowns, SmTimers, bagConfirm, checkConfirm, confirmedTarget, cooldownGroup, isMapItem, premiumRefusal, skillPointsSpent,
  useConfirm, useOf,
} from '../src/world/items/premiumItems';
import { usableFromBag } from '../src/world/items/travelItems';

const prop = (over: Partial<WebItemProp>): WebItemProp => ({
  id: 1, name: 'x', packMax: 99, kind1: 5, kind2: 0, kind3: 0, handed: -1, part: -1, abilityMin: 0, abilityMax: 0,
  weaponType: -1, attackSpeed: -1, attackRange: -1, destParams: [-1, -1, -1], adjParams: [-1, -1, -1], sfxHit: -1,
  model: null, icon: null, ...over,
} as WebItemProp);

describe('useOf: what Neuz sends DOUSEITEM for', () => {
  it('the kinds the server acts on, and any with a buff time', () => {
    for (const kind2 of [11, 12, 14, 19, 22, 23, 27, 29, 30, 31, 33, 37]) expect(useOf(prop({ kind2 })), String(kind2)).toBe('use');
    expect(useOf(prop({ kind2: 15, skillTime: 600000 }))).toBe('use');
    // materials, gems, quest items: nothing to use
    for (const kind2 of [16, 17, 28]) expect(useOf(prop({ kind2 })), String(kind2)).toBe('none');
    // an ES scroll, a gift box (IK2_SYSTEM ids the server opens after the use) and a premium buff are used
    expect(usableFromBag(prop({ id: 26205, kind2: 19, kind3: 50 }))).toBe(true);
    expect(usableFromBag(prop({ id: 26101, kind2: 29 }))).toBe(true);
  });

  it('an item that needs another item (EXT_ITEM, the upgrade cards) or a window the browser lacks is not used', () => {
    expect(useOf(prop({ kind2: 19, exeTarget: 21 }))).toBe('needsItem');
    for (const kind3 of [37, 61, 62, 63, 101, 119]) expect(useOf(prop({ kind2: 19, kind3 })), String(kind3)).toBe('needsItem');
    // 2026-11-10: the guild name scroll 10463 has its window now (guild/guildHud.ts `openRename`)
    for (const id of [15083, 26410, 26411, 26475, 26476, 10425]) {
      expect(useOf(prop({ id, kind2: 19 })), String(id)).toBe('noWindow');
    }
    // 2026-11-09 (pets B1): the vis (IK3_VIS 138) is used, CheckConfirm's box first with a buff pet out
    expect(useOf(prop({ kind2: 19, kind3: 138 }))).toBe('use');
    // 2026-11-05: the windows the browser has (itemWindows.ts)
    for (const id of [10424, 10220, 26204, 26202, 20037]) expect(useOf(prop({ id, kind2: 19 })), String(id)).toBe('window');
    for (const kind3 of [85, 122]) expect(useOf(prop({ kind2: 19, kind3 })), String(kind3)).toBe('window');
    // 2026-11-09 (pets R3): an EXT_PET item is used (SendDoUseItem first wants a pet out, itemUse.ts)
    expect(useOf(prop({ kind2: 19, exeTarget: 19 }))).toBe('use');
    expect(useOf(prop({ kind2: 36 }))).toBe('use'); // IK2_TOCASH: the Funny Coin, after its box (2026-11-05)
  });

  it('a pick-up pet (IK3_PET 100, any kind2) is used: a plain DOUSEITEM summons or recalls it (pets P1)', () => {
    // CMover::DoUseItem: IK3_PET calls DoUseEatPet (MoverSkill.cpp:1704-1705); the bag sends DOUSEITEM (WndField.cpp:2635-2642)
    const pet = prop({ id: 30003, kind2: 1, kind3: 100 });
    expect(useOf(pet)).toBe('use');
    expect(usableFromBag(pet)).toBe(true);
  });

  it('a raised pet\'s egg or hatched pet (IK3_EGG 120, IK2_GENERAL) is used: DOUSEITEM summons or recalls it (pets R2)', () => {
    // CMover::DoUseItem: IK3_EGG calls DoUseSystemPet (MoverSkill.cpp:1701-1702, :4025-4031)
    for (const id of [21029, 21039]) {
      const egg = prop({ id, kind2: 1, kind3: 120 });
      expect(useOf(egg), String(id)).toBe('use');
      expect(usableFromBag(egg), String(id)).toBe(true);
    }
  });

  it("the raised pet's items have their windows; its food is sent at once (pets R3, DPClient.cpp:10614-10661, :10845-10857)", () => {
    // the naming scroll, the tamer's mistake and miracle, the life scroll, the hatch scroll, the feed maker
    for (const id of [20039, 21030, 21031, 21034, 21036, 21038]) {
      expect(useOf(prop({ id, kind2: 19, kind3: 50, exeTarget: id === 21038 ? undefined : 19 })), String(id)).toBe('window');
    }
    expect(useOf(prop({ id: 21037, kind2: 19, kind3: 121, exeTarget: 19 }))).toBe('use');
    // the tonics, the feed pockets, the S pet's food and the second life scroll: plain DOUSEITEMs
    for (const [id, kind2] of [[21032, 19], [21033, 19], [21035, 19], [26531, 29], [26573, 33], [26562, 19]] as const) {
      expect(useOf(prop({ id, kind2, kind3: 50 })), String(id)).toBe('use');
    }
  });

  it('worn equipment is not used (the bag equips it)', () => {
    expect(useOf(prop({ kind2: 29, part: 2 }))).toBe('none');
  });
});

describe('premiumRefusal (SendDoUseItem, DPClient.cpp:10318-10372, 10474-10478)', () => {
  const PILL = prop({ id: 700, kind2: 14, kind3: 59, cooldownMs: 5000 });
  const ANGEL = 10223, EVE = 6319;

  it('a cool-down group still running', () => {
    const cooldowns = new ItemCooldowns();
    expect(premiumRefusal({ prop: PILL, cooldowns, now: 0 })).toBeNull();
    cooldowns.start(PILL, 1000);
    expect(premiumRefusal({ prop: PILL, cooldowns, now: 5999 })).toEqual({ kind: 'say', tid: 'TID_GAME_ATTENTIONCOOLTIME' });
    expect(premiumRefusal({ prop: PILL, cooldowns, now: 6001 })).toBeNull();
  });

  it('the wings and the disguise', () => {
    const cooldowns = new ItemCooldowns();
    const wing = prop({ id: ANGEL, kind2: 29 });
    const disguise = prop({ id: 800, kind2: 27, kind3: 81 });
    const eve = prop({ id: EVE, kind2: 29 });
    expect(premiumRefusal({ prop: wing, cooldowns, now: 0, disguised: true })).toEqual({ kind: 'say', tid: 'TID_GAME_DISQUISE_DNT_WING' });
    expect(premiumRefusal({ prop: disguise, cooldowns, now: 0, wing: ANGEL })).toEqual({ kind: 'say', tid: 'TID_GAME_DISQUISE_DNT_WING' });
    expect(premiumRefusal({ prop: eve, cooldowns, now: 0, wing: ANGEL })).toEqual({ kind: 'say', tid: 'TID_GAME_NOTUSESKILL_ITEMUSE' });
    expect(premiumRefusal({ prop: wing, cooldowns, now: 0, wing: EVE })).toEqual({ kind: 'say', tid: 'TID_GAME_NOTUSESKILL_ITEMUSE' });
    expect(premiumRefusal({ prop: wing, cooldowns, now: 0, wing: ANGEL })).toBeNull(); // the server says it
  });

  it('the piercing protection is only for piercing', () => {
    expect(premiumRefusal({ prop: prop({ id: 10465, kind2: 19 }), cooldowns: new ItemCooldowns(), now: 0 }))
      .toEqual({ kind: 'say', tid: 'TID_GAME_ONLYPIER_USE' });
  });
});

describe('the boxes before a use', () => {
  it("SendDoUseItem's, from the bag and the task bar (DPClient.cpp:10433-10501)", () => {
    expect(useConfirm(prop({ id: 10464 }))).toBe('TID_GAME_REGARDLESS_USE');
    expect(useConfirm(prop({ id: 10488 }))).toBe('TID_GAME_REGARDLESS_USE');
    expect(useConfirm(prop({ id: 26473 }))).toBe('TID_GAME_REGARDLESS_USE');
    expect(useConfirm(prop({ id: 10487 }))).toBeNull(); // SMELPROT2: __SM_ITEM_2ND_EX is off
    expect(useConfirm(prop({ id: 10468 }))).toBe('TID_GAME_LV7OVER_NOTUSE');
    expect(useConfirm(prop({ id: 26203 }))).toBe('TID_GAME_LV7OVER_NOTUSE');
    expect(useConfirm(prop({ id: 10489 }))).toBe('TID_GAME_LV10OVER_NOTUSE');
    expect(useConfirm(prop({ id: 26205 }))).toBeNull();
  });

  it("the bag's own (CWndInventory, WndField.cpp:2423-2487)", () => {
    const state = { revival: false, skillPointsSpent: true, charged: false };
    expect(bagConfirm(prop({ id: 10434 }), state)).toEqual({ kind: 'box', tid: 'TID_GAME_SKILLINIT' });
    expect(bagConfirm(prop({ id: 26316 }), { ...state, skillPointsSpent: false }))
      .toEqual({ kind: 'say', tid: 'TID_GAME_ERROR_SKILLRECCURENCE' });
    expect(bagConfirm(prop({ id: 10211 }), state)).toEqual({ kind: 'box', tid: 'TID_TOOLTIP_RESTATE_ALL_CONFIRM' });
    expect(bagConfirm(prop({ id: 30152 }), state)).toEqual({ kind: 'box', tid: 'TID_TOOLTIP_RESTATE_DEX_CONFIRM' });
    expect(bagConfirm(prop({ id: 30339 }), state)).toEqual({ kind: 'box', tid: 'TID_GAME_RESTATE_STA_LOW_CONFIRM' });
    expect(bagConfirm(prop({ id: 10430 }), state)).toEqual({ kind: 'box', tid: 'TID_GAME_DEPEN_USE' });
    expect(bagConfirm(prop({ id: 10430 }), { ...state, revival: true })).toEqual({ kind: 'say', tid: 'TID_GAME_LIMITED_USE' });
    expect(bagConfirm(prop({ id: 10430 }), { ...state, charged: true })).toBeNull(); // m_bCharged == 1 skips it
    expect(bagConfirm(prop({ id: 26205 }), state)).toBeNull();
  });
});

describe('the cool-down groups (CCooltimeMgr::GetGroup, CooltimeMgr.cpp:19-41)', () => {
  it('food 1, a pill 2, a skill item 3, only with a cool-down', () => {
    expect(cooldownGroup(prop({ kind2: 14, cooldownMs: 1000 }))).toBe(1);
    expect(cooldownGroup(prop({ kind2: 14, kind3: 59, cooldownMs: 1000 }))).toBe(2);
    expect(cooldownGroup(prop({ kind2: 31, cooldownMs: 1000 }))).toBe(3);
    expect(cooldownGroup(prop({ kind2: 12, cooldownMs: 1000 }))).toBe(0);
    expect(cooldownGroup(prop({ kind2: 14 }))).toBe(0);
  });

  it('one item of a group starts the whole group', () => {
    const cooldowns = new ItemCooldowns();
    cooldowns.start(prop({ id: 1, kind2: 14, cooldownMs: 3000 }), 0);
    expect(cooldowns.ready(prop({ id: 2, kind2: 14, cooldownMs: 9000 }), 2000)).toBe(false);
    expect(cooldowns.ready(prop({ id: 3, kind2: 14, kind3: 59, cooldownMs: 9000 }), 2000)).toBe(true);
    expect(cooldowns.ready(prop({ id: 2, kind2: 14, cooldownMs: 9000 }), 3001)).toBe(true);
  });
});

describe('SmTimers (m_dwSMTime, WndWorld.cpp:8865-8876)', () => {
  it('counts down a second at a time and stops at 1; 0 ends one', () => {
    const sm = new SmTimers();
    sm.set(8, 3, 0);
    sm.set(20, 1, 0);
    sm.tick(999);
    expect(sm.list()).toEqual([{ type: 8, seconds: 3 }, { type: 20, seconds: 1 }]);
    sm.tick(2500);
    expect(sm.list()).toEqual([{ type: 8, seconds: 1 }, { type: 20, seconds: 1 }]);
    sm.tick(10_000);
    expect(sm.list()).toEqual([{ type: 8, seconds: 1 }, { type: 20, seconds: 1 }]);
    expect(sm.has(20)).toBe(true);
    sm.set(20, 0, 10_000);
    expect(sm.has(20)).toBe(false);
    expect(sm.list()).toEqual([{ type: 8, seconds: 1 }]);
  });

  it('a type outside 0..25 is ignored (OnSMMode)', () => {
    const sm = new SmTimers();
    sm.set(26, 100, 0);
    sm.set(-1, 100, 0);
    expect(sm.list()).toEqual([]);
  });
});

describe('skillPointsSpent (GetCurrentMaxSkillPoint, Mover.cpp:1905-1936)', () => {
  const SKILLS = new Map([[1, { jobType: 0 }], [20, { jobType: 1 }], [200, { jobType: 2 }], [300, { jobType: 5 }]]);
  it('a level of any skill but a master or hero one is a spent point', () => {
    expect(skillPointsSpent(10, [{ skill: 1, level: 0 }], 0, SKILLS)).toBe(false);
    expect(skillPointsSpent(10, [{ skill: 1, level: 1 }], 0, SKILLS)).toBe(true);
    expect(skillPointsSpent(10, [{ skill: 300, level: 3 }], 16, SKILLS)).toBe(false);
  });
  it("capped by the job: a Knight's 870", () => {
    expect(skillPointsSpent(870, [{ skill: 200, level: 20 }], 6, SKILLS)).toBe(false);
    expect(skillPointsSpent(869, [{ skill: 200, level: 20 }], 24, SKILLS)).toBe(true);
  });
});

describe('the cool-down sweep (RenderRadar, WndManager.cpp:143-180)', () => {
  it("a group's share done, from its start to its end; none outside it", () => {
    const cooldowns = new ItemCooldowns();
    const pill = prop({ kind2: 14, kind3: 59, cooldownMs: 4000 });
    expect(cooldowns.progress(pill, 0)).toBeNull();
    cooldowns.start(pill, 1000);
    expect(cooldowns.progress(pill, 2000)).toBe(0.25);
    expect(cooldowns.progress(prop({ kind2: 14, kind3: 59, cooldownMs: 1 }), 3000)).toBe(0.5); // the group's, not the item's
    expect(cooldowns.progress(pill, 5000)).toBeNull();
    expect(cooldowns.progress(prop({ kind2: 12 }), 2000)).toBeNull();
  });
});

describe('the quick boxes (2026-11-05: batteries, Funny Coin, Awakening Protection) and the maps', () => {
  it('are used now, each with its box and the object its OK names', () => {
    for (const id of [26453, 26454, 26455, 26560, 26961, 4801, 4802]) expect(useOf(prop({ id, kind2: 19 })), String(id)).toBe('use');
    expect(useOf(prop({ id: 30000, kind2: 36 }))).toBe('use'); // IK2_TOCASH
    expect(useConfirm(prop({ id: 26453 }))).toBe('TID_GAME_BETTERY_DESC');
    expect(useConfirm(prop({ id: 26454 }))).toBe('TID_GAME_CACHE_BETTERY_DESC');
    expect(useConfirm(prop({ id: 26560 }))).toBe('TID_GAME_CACHE_BETTERY_DESC');
    expect(useConfirm(prop({ id: 30000, kind2: 36 }))).toBe('TID_GAME_FUNNYCOIN_ASKUSE');
    expect(checkConfirm(prop({ id: 26961 }))).toBe('TID_GAME_REGARDLESS_USE01');
    expect(checkConfirm(prop({ id: 26205 }))).toBeNull();
    // CWndCommItemDlg's m_dwCtrlId: a battery's own id; the Funny Coin NULL_ID; Awakening Protection the player
    expect(confirmedTarget(prop({ id: 26453 }), 0x77, 9)).toBe(26453);
    expect(confirmedTarget(prop({ id: 30000, kind2: 36 }), 0x77, 9)).toBe(0xffffffff);
    expect(confirmedTarget(prop({ id: 26961 }), 0x77, 9)).toBe(9);
    expect(confirmedTarget(prop({ id: 10464 }), 0x77, 9)).toBe(0x77);
    expect(isMapItem(prop({ id: 4801 }))).toBe(true);
  });
});

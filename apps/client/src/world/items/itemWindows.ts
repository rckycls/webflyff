// The item windows' rules (2026-11-05, docs/superpowers/specs/2026-11-05-item-windows-research.md §3): the items whose
// use is a window, and each window's client checks.
//
//   Function                              File:lines                                    what
//   CDPClient::SendDoUseItem              Neuz/DPClient.cpp:10504-10790                 the windows of the name change, the sex
//                                                                                       change, the tickets, the monster summon,
//                                                                                       the party summon
//   CWndInventory::OnChildNotify          _Interface/WndField.cpp:2418-2426             the element change (the bag's)
//   CWndChangeName::OnChildNotify         _Interface/WndChangeName.cpp:88-110           the name's rules (WndTitle.cpp:2723-2785)
//   CTicketProperty                       _Common/ticket.cpp:37-79                      ticket.inc and layer.inc
//   CWndChangeAttribute::OnDropIcon       WndField.cpp:23080-23092                      the element change's target
//   CMover::GetTransyItem                 _Common/Mover.cpp:2971-3020                   the transmute's twin
//   CWndItemTransy::OnDropIcon            _Interface/WndChangeFace.cpp:495-575          the transmute's checks
//   CWndWorld (the monster summon)        _Interface/WndWorldControlPlayer.cpp:240-285  where a monster may be placed

import type { WebItemProp } from '@flyffweb/formats';
import type { InventoryItem } from '@flyffweb/protocol';

/** The item windows the browser has. */
export type ItemWindow = 'rename' | 'partySummon' | 'ticket' | 'sexChange' | 'attribute' | 'transy' | 'createMonster';

/** `IK3_TICKET` 122 and `IK3_CREATE_MONSTER` 85. */
const IK3_TICKET = 122;
const IK3_CREATE_MONSTER = 85;
/** `II_SYS_SYS_SCR_CHANAM`, `_PARTYSUMMON`, `II_CHR_SYS_SCR_TRANSY`, `II_SYS_SYS_SCR_SOKCHANG`, `ITEMTRANSY_A` / `_B`. */
const ITEM_WINDOWS: ReadonlyMap<number, ItemWindow> = new Map([
  [10424, 'rename'], [26202, 'partySummon'], [10220, 'sexChange'], [20037, 'attribute'], [26204, 'transy'], [26218, 'transy'],
]);

/** The window `prop`'s use opens, or null. */
export function windowOf(prop: WebItemProp): ItemWindow | null {
  if (prop.kind3 === IK3_TICKET) return 'ticket';
  if (prop.kind3 === IK3_CREATE_MONSTER) return 'createMonster';
  return ITEM_WINDOWS.get(prop.id) ?? null;
}

/**
 * The name change's checks, in Neuz's order: trimmed; empty TID_DIAG_0031; 4 to 16 bytes TID_DIAG_RULE_0; a digit first
 * TID_DIAG_0012; anything but letters and digits TID_DIAG_0013 (English: `IsDBCSLeadByte`'s other scripts are not
 * typed here). The InvalidName list (`prj.IsInvalidName`, InvalidName_ENG.inc) is not converted: the server's database
 * refuses a name in use (TID_DIAG_0034).
 */
export function nameRefusal(raw: string): { name: string; tid: string | null } {
  const name = raw.trim();
  if (name === '') return { name, tid: 'TID_DIAG_0031' };
  if (name.length < 4 || name.length > 16) return { name, tid: 'TID_DIAG_RULE_0' };
  if (/^[0-9]/.test(name)) return { name, tid: 'TID_DIAG_0012' };
  if (!/^[A-Za-z0-9]+$/.test(name)) return { name, tid: 'TID_DIAG_0013' };
  return { name, tid: null };
}

/**
 * `ticket.inc` and `layer.inc` (Resource, read by both builds): each ticket's world and its extra layers. The Kebaras
 * tickets 26529, 26530, 26558 go to WI_WORLD_KEBARAS 2, the island's 26681, 26682 to WI_WORLD_CISLAND 3; each world has
 * one extra layer.
 */
const TICKETS: ReadonlyMap<number, { world: number; expand: number }> = new Map([
  [26529, { world: 2, expand: 1 }], [26530, { world: 2, expand: 1 }], [26558, { world: 2, expand: 1 }],
  [26681, { world: 3, expand: 1 }], [26682, { world: 3, expand: 1 }],
]);
/** `CItemElem::expired` (`m_byFlag`, Item.h:119). */
const EXPIRED = 0x01;

/**
 * A ticket's use: in its world the box TID_GAME_TICKET_DESC ("leave"); elsewhere the channel window, its layers and the
 * main one (`CWndSelectCh`); an expired ticket, or one ticket.inc does not list, a plain use.
 */
export function ticketUse(
  prop: WebItemProp, item: Pick<InventoryItem, 'flag'>, worldId: number,
): { kind: 'leave' } | { kind: 'channels'; count: number } | { kind: 'use' } {
  const ticket = TICKETS.get(prop.id);
  if (ticket === undefined || ((item.flag ?? 0) & EXPIRED) !== 0) return { kind: 'use' };
  return worldId === ticket.world ? { kind: 'leave' } : { kind: 'channels', count: ticket.expand + 1 };
}

/**
 * The parts the sex change lets stay worn (DPClient.cpp:10554-10571): `PARTS_HEAD` 0, `_HAIR` 1, `_LWEAPON` 9, `_RWEAPON`
 * 10, `_SHIELD` 11, `_RIDE` 13, and `PARTS_NECKLACE1` 19 to `PARTS_BULLET` 25.
 */
const SEX_CHANGE_KEEPS: ReadonlySet<number> = new Set([0, 1, 9, 10, 11, 13, 19, 20, 21, 22, 23, 24, 25]);
const NULL_ID = 0xffffffff;

/** The sex change's refusal: anything else worn, TID_GAME_CHECK_EQUIP; null to open the window. */
export function sexChangeRefusal(equipmentObjectIds: readonly number[]): string | null {
  return equipmentObjectIds.some((id, part) => id !== NULL_ID && !SEX_CHANGE_KEEPS.has(part)) ? 'TID_GAME_CHECK_EQUIP' : null;
}

/** `IsEleRefineryAble` (`IK3_SUIT` 18, `IK2_WEAPON_DIRECT` 2, `_MAGIC` 3) with an element upgrade, or TID_GAME_NOTELEMENT. */
export function attributeRefusal(prop: WebItemProp, item: Pick<InventoryItem, 'resistOption'>): string | null {
  const able = prop.kind3 === 18 || prop.kind2 === 2 || prop.kind2 === 3;
  return able && (item.resistOption ?? 0) > 0 ? null : 'TID_GAME_NOTELEMENT';
}

/** `IK2_ARMOR` 7, `IK2_ARMORETC` 8; `SEX_MALE` 0, `SEX_FEMALE` 1. */
const isGearOfASex = (p: WebItemProp): boolean => (p.kind2 === 7 || p.kind2 === 8) && (p.sex === 0 || p.sex === 1);

/**
 * `GetTransyItem`: the other sex's armour piece with the same kinds, job, hands, part, item level, ability and attack
 * speed, both or neither in a set (`setItems`: the ids of propItemEtc.inc's sets' pieces); the first in the catalog's
 * order, or null.
 */
export function transyTwin(
  prop: WebItemProp, catalog: ReadonlyMap<number, WebItemProp>, setItems: ReadonlySet<number>,
): WebItemProp | null {
  if (!isGearOfASex(prop)) return null;
  const inSet = setItems.has(prop.id);
  for (const other of catalog.values()) {
    if (other.id === prop.id || !isGearOfASex(other) || other.sex === prop.sex) continue;
    if (other.kind1 !== prop.kind1 || other.kind2 !== prop.kind2 || other.kind3 !== prop.kind3 || other.job !== prop.job ||
      other.handed !== prop.handed || other.part !== prop.part || other.itemLevel !== prop.itemLevel ||
      other.abilityMin !== prop.abilityMin || other.abilityMax !== prop.abilityMax || other.attackSpeed !== prop.attackSpeed) continue;
    if (setItems.has(other.id) === inSet) return other;
  }
  return null;
}

/** `II_CHR_SYS_SCR_ITEMTRANSY_A`: up to `dwLimitLevel1` 60; `_B` from 61. */
const TRANSY_A = 26204;

/**
 * The transmute's refusal of `target` with the scroll `scrollItemId`: worn TID_GAME_EQUIPPUT, no twin TID_GAME_ITEM_TRANSY,
 * the scroll not for its level TID_GAME_ITEM_TRANSY_NOT_LEVEL_0 / _1 (`%s` the scroll's name: `scroll`); null to go on.
 */
export function transyRefusal(
  scrollItemId: number, target: WebItemProp, worn: boolean, catalog: ReadonlyMap<number, WebItemProp>,
  setItems: ReadonlySet<number>,
): { tid: string; scroll?: true } | null {
  if (worn) return { tid: 'TID_GAME_EQUIPPUT' };
  if (transyTwin(target, catalog, setItems) === null) return { tid: 'TID_GAME_ITEM_TRANSY' };
  const level = target.limitLevel ?? 0;
  if (scrollItemId === TRANSY_A && level >= 61) return { tid: 'TID_GAME_ITEM_TRANSY_NOT_LEVEL_0', scroll: true };
  if (scrollItemId !== TRANSY_A && level < 61) return { tid: 'TID_GAME_ITEM_TRANSY_NOT_LEVEL_1', scroll: true };
  return null;
}

/** `HATTR_NOWALK` 1, `HATTR_NOMOVE` 3; `WI_WORLD_MADRIGAL` 1. */
const NO_PLACE: ReadonlySet<number> = new Set([1, 3]);
const MADRIGAL = 1;

/**
 * Where a summoned monster may be placed: within 15 of the player (TID_GAME_CREATEMON_F_15), in Madrigal on land one may
 * walk (TID_GAME_CREATEMON_F_AREA). The safe regions and the guild war's are the server's to refuse here: the browser
 * has no region data.
 */
export function createMonsterRefusal(check: { distance: number; worldId: number; landAttr: number }): string | null {
  if (check.distance > 15) return 'TID_GAME_CREATEMON_F_15';
  if (check.worldId !== MADRIGAL || NO_PLACE.has(check.landAttr)) return 'TID_GAME_CREATEMON_F_AREA';
  return null;
}

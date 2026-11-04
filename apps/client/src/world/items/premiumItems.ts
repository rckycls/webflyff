// The premium items and scrolls (2026-11-05, [R] = docs/superpowers/specs/2026-11-05-buffs-premium-research.md §4).
// Neuz has no list of usable items: the bag's double-click and the task bar send `SendDoUseItem` for any, and it sends
// DOUSEITEM unless a branch opens a window first. Here: what is sent for (the kinds the server acts on), what the browser
// leaves out (a window or a target item it lacks), Neuz's client refusals and boxes, the cool-down groups, and the
// premium timers' clock.
//
//   Function                            File:lines                               what
//   CMover::DoUseItem                   _Common/MoverSkill.cpp:1275-1729         the kinds the server uses
//   CDPClient::SendDoUseItem            Neuz/DPClient.cpp:10254-10866            the refusals, the boxes, the windows
//   CWndInventory::OnChildNotify        _Interface/WndField.cpp:2102-2620        the bag's own boxes, the upgrade cursor
//   CCooltimeMgr                        _Common/CooltimeMgr.cpp:19-61            the cool-down groups
//   CDPClient::OnUpdateItem             Neuz/DPClient.cpp:3226-3245              UI_COOLTIME starts the group
//   CWndWorld::Process                  _Interface/WndWorld.cpp:8865-8876        the SM times, a second at a time

import type { WebItemProp } from '@flyffweb/formats';
import type { Refusal } from './travelItems';
import { windowOf } from './itemWindows';

/**
 * The `IK2_*` the server uses (`DoUseItem`): REFRESHER 11, POTION 12, FOOD 14, SYSTEM 19, BLINKWING 22, AIRFUEL 23,
 * GMTEXT 27, BUFF 29, WARP 30, SKILL 31, BUFF2 33, TOCASH 36 (the Funny Coin, after its box), BUFF_TOGIFT 37
 * (`Resource/defineItemkind.h:29-55`).
 */
const USE_KINDS: ReadonlySet<number> = new Set([11, 12, 14, 19, 22, 23, 27, 29, 30, 31, 33, 36, 37]);
/** `IK2_TOCASH`: the Funny Coin (`__FUNNY_COIN`, DPClient.cpp:10543-10552). */
const IK2_TOCASH = 36;
/** `EXT_ITEM` 21 (`IsNeedTarget`, `_Common/Item.cpp:758-765`) and `EXT_PET` 19 (`Resource/define.h:57-59`). */
const EXT_ITEM = 21;
const EXT_PET = 19;
/** The upgrade cursor's kinds (`WndField.cpp:2351-2386`): ELECARD 37, PIERDICE 61, SOCKETCARD 62 and 2 63, RANDOM_SCROLL 101, ENCHANT 119. */
const UPGRADE_IK3: ReadonlySet<number> = new Set([37, 61, 62, 63, 101, 119]);
/** Kinds whose use needs a system the browser lacks: PET 100, EGG 120, VIS 138. */
const WINDOW_IK3: ReadonlySet<number> = new Set([100, 120, 138]);
/**
 * The items whose use opens a window the browser lacks (`SendDoUseItem`, `CWndInventory`): class change 10425 (whose
 * server handler is off), guild name 10463, Custody 15083, hair 26410 and face 26411 coupons, the character seal 26475 and
 * 26476, pet naming 20039, the pet tamer's 21030 and 21031, pet hatch 21036, pet life 21034, pet food 21037 and its mill
 * 21038. (2026-11-05: the maps, the batteries and Awakening Protection are used, with their boxes; the name change, the
 * sex change, the transmute, the party summon, the element change, the tickets and the monster summon have their
 * windows, `windowOf` of itemWindows.ts.)
 */
const WINDOW_IDS: ReadonlySet<number> = new Set([
  10425, 10463, 15083, 26410, 26411, 26475, 26476, 20039, 21030, 21031, 21036, 21034, 21037, 21038,
]);
/** The collector's batteries: the normal one (`TID_GAME_BETTERY_DESC`) and the cash ones (`TID_GAME_CACHE_BETTERY_DESC`). */
const NORMAL_BATTERY = 26453;
const CASH_BATTERIES: ReadonlySet<number> = new Set([26454, 26455, 26560]);
/** `II_SYS_SYS_SCR_AWAKESAFE`: Awakening Protection, whose box `CheckConfirm` opens (WndManager.cpp:7698-7712). */
const AWAKESAFE = 26961;
/** The maps of Flaris and Saint Morning (`OpenMap`, WndField.cpp:2407-2415): the bag's double-click opens the world map. */
const MAPS: ReadonlySet<number> = new Set([4801, 4802]);

/** A map item: the bag's double-click opens the world map too (at V15 `CWndMap` toggles it, WndMap.cpp:41-53). */
export function isMapItem(prop: WebItemProp): boolean {
  return MAPS.has(prop.id);
}

/** `CheckConfirm`'s box (both the bag and the task bar, before `SendDoUseItem`): Awakening Protection's question, or null. */
export function checkConfirm(prop: WebItemProp): string | null {
  return prop.id === AWAKESAFE ? 'TID_GAME_REGARDLESS_USE01' : null;
}

/**
 * The object a box's OK names in DOUSEITEM: `CWndCommItemDlg`'s `m_dwCtrlId` is a battery's own item id
 * (DPClient.cpp:10652-10662), the Funny Coin's YES sends NULL_ID (WndField.cpp:23590-23600), Awakening Protection's the
 * player (WndPetSys.cpp:2955); the rest keep the focus of the first press.
 */
export function confirmedTarget(prop: WebItemProp, focus: number, ownId: number): number {
  if (prop.id === NORMAL_BATTERY || CASH_BATTERIES.has(prop.id)) return prop.id;
  if (prop.kind2 === IK2_TOCASH) return 0xffffffff;
  if (prop.id === AWAKESAFE) return ownId;
  return focus;
}

/** What the bag and the task bar do with an item: use it, or leave it (Neuz's upgrade cursor, or a window), or nothing. */
export type UseOf = 'use' | 'window' | 'needsItem' | 'noWindow' | 'none';

/** What a use of `prop` from the bag or the task bar is (worn equipment and rides are the bag's and M5's). */
export function useOf(prop: WebItemProp): UseOf {
  if (prop.part >= 0) return 'none';
  if (prop.exeTarget === EXT_ITEM || UPGRADE_IK3.has(prop.kind3)) return 'needsItem';
  if (WINDOW_IDS.has(prop.id) || WINDOW_IK3.has(prop.kind3) || prop.exeTarget === EXT_PET) return 'noWindow';
  if (windowOf(prop) !== null) return 'window'; // 2026-11-05: itemWindows.ts
  return USE_KINDS.has(prop.kind2) || prop.skillTime !== undefined ? 'use' : 'none';
}

/** `CCooltimeMgr::GetGroup`: with a cool-down, IK2_FOOD 1 (IK3_PILL 59: 2), IK2_SKILL 3; else 0, none. */
export function cooldownGroup(prop: WebItemProp): number {
  if ((prop.cooldownMs ?? 0) <= 0) return 0;
  if (prop.kind2 === 14) return prop.kind3 === 59 ? 2 : 1;
  return prop.kind2 === 31 ? 3 : 0;
}

/** `CCooltimeMgr`: each group's end; UPDATE_ITEM `UI_COOLTIME` starts one (`SetTime( group, GetCoolTime() )`). */
export class ItemCooldowns {
  private readonly ends = new Map<number, number>();
  /** `m_bases`: when each group's wait began (the sweep's start). */
  private readonly bases = new Map<number, number>();

  /** The item of `prop` was used at `now` (ms): its group waits its `dwSkillReady`. */
  start(prop: WebItemProp, now: number): void {
    const group = cooldownGroup(prop);
    if (group === 0) return;
    this.ends.set(group, now + prop.cooldownMs!);
    this.bases.set(group, now);
  }

  /** `CanUse`: no group, or its time is past. */
  ready(prop: WebItemProp, now: number): boolean {
    const group = cooldownGroup(prop);
    return group === 0 || now > (this.ends.get(group) ?? -Infinity);
  }

  /**
   * The share of the group's wait gone at `now` (0 to 1), for the slot's sweep (`dwCur - dwBase` of `dwEnd - dwBase`,
   * `WndTaskBar.cpp:848-857`); null when the item has no group or it does not wait.
   */
  progress(prop: WebItemProp, now: number): number | null {
    const group = cooldownGroup(prop);
    const end = this.ends.get(group), base = this.bases.get(group);
    if (group === 0 || end === undefined || base === undefined || now >= end) return null;
    return (now - base) / (end - base);
  }
}

/** `II_CHR_MAG_TRI_ANGELWING` and `II_SYS_SYS_EVE_WINGS`: one at a time, and none with a disguise. */
const ANGEL_WING = 10223;
const EVE_WINGS = 6319;
/** `IK3_TEXT_DISGUISE`. */
const IK3_TEXT_DISGUISE = 81;
/** `II_SYS_SYS_SCR_PIEPROT`: "only when piercing". */
const PIERCING_PROTECTION = 10465;

/** What the refusals of a use look at. */
export interface PremiumCheck {
  prop: WebItemProp;
  cooldowns: ItemCooldowns;
  now: number;
  /** A disguise is on (`HasBuffByIk3( IK3_TEXT_DISGUISE )`). */
  disguised?: boolean;
  /** The wings' buff that is on (`HasBuff( BUFF_ITEM, ANGELWING or EVE_WINGS )`), or none. */
  wing?: number | null;
}

/** `SendDoUseItem`'s refusals of a use that are not the travel items' (:10318-10372, :10474-10478), in its order. */
export function premiumRefusal(check: PremiumCheck): Refusal | null {
  const { prop } = check;
  if (!check.cooldowns.ready(prop, check.now)) return { kind: 'say', tid: 'TID_GAME_ATTENTIONCOOLTIME' };
  const isWing = prop.id === ANGEL_WING || prop.id === EVE_WINGS;
  if (check.disguised === true && isWing) return { kind: 'say', tid: 'TID_GAME_DISQUISE_DNT_WING' };
  const wing = check.wing ?? null;
  if (wing !== null) {
    if (prop.kind3 === IK3_TEXT_DISGUISE) return { kind: 'say', tid: 'TID_GAME_DISQUISE_DNT_WING' };
    if ((wing === ANGEL_WING && prop.id === EVE_WINGS) || (wing === EVE_WINGS && prop.id === ANGEL_WING)) {
      return { kind: 'say', tid: 'TID_GAME_NOTUSESKILL_ITEMUSE' };
    }
  }
  if (prop.id === PIERCING_PROTECTION) return { kind: 'say', tid: 'TID_GAME_ONLYPIER_USE' };
  return null;
}

/**
 * The box `SendDoUseItem` opens before a use from the bag or the task bar (`bResult`, :10433-10501), its text's TID: the
 * protection scrolls (SMELPROT, 3, 4; SMELPROT2 needs `__SM_ITEM_2ND_EX`, which is off), the smelting scrolls. Its OK
 * uses the item with no box (`CWndCommItemDlg`, `bResult` FALSE).
 */
export function useConfirm(prop: WebItemProp): string | null {
  // 2026-11-05: the batteries (CWndCommItemDlg, :10652-10662) and the Funny Coin (CWndFunnyCoinConfirm, "%s" its name)
  if (prop.id === NORMAL_BATTERY) return 'TID_GAME_BETTERY_DESC';
  if (CASH_BATTERIES.has(prop.id)) return 'TID_GAME_CACHE_BETTERY_DESC';
  if (prop.kind2 === IK2_TOCASH) return 'TID_GAME_FUNNYCOIN_ASKUSE';
  switch (prop.id) {
    case 10464: case 10488: case 26473: return 'TID_GAME_REGARDLESS_USE';
    case 10468: case 26203: return 'TID_GAME_LV7OVER_NOTUSE';
    case 10489: return 'TID_GAME_LV10OVER_NOTUSE';
    default: return null;
  }
}

/** The Re-Stat scrolls' questions (`CWndRestateConfirm::OnInitialUpdate`, `WndField.cpp:25450-25495`). */
const RESTATE: ReadonlyMap<number, string> = new Map([
  [10211, 'TID_TOOLTIP_RESTATE_ALL_CONFIRM'], [30151, 'TID_TOOLTIP_RESTATE_STR_CONFIRM'], [30152, 'TID_TOOLTIP_RESTATE_DEX_CONFIRM'],
  [30153, 'TID_TOOLTIP_RESTATE_STA_CONFIRM'], [30154, 'TID_TOOLTIP_RESTATE_INT_CONFIRM'], [30337, 'TID_GAME_RESTATE_STR_LOW_CONFIRM'],
  [30338, 'TID_GAME_RESTATE_DEX_LOW_CONFIRM'], [30339, 'TID_GAME_RESTATE_STA_LOW_CONFIRM'], [30340, 'TID_GAME_RESTATE_INT_LOW_CONFIRM'],
]);

/** What the bag's own boxes look at. */
export interface BagState {
  /** `IsSMMode( SM_REVIVAL )`: a Blessing is on. */
  revival: boolean;
  /** `m_nSkillPoint < GetCurrentMaxSkillPoint()`: some skill point is spent. */
  skillPointsSpent: boolean;
  /** The item's `m_bCharged` (a charged item skips Blessing's box). */
  charged: boolean;
}

/**
 * The bag's own box or refusal before the use (`CWndInventory::OnChildNotify`, `WndField.cpp:2423-2487`): Re-Skill,
 * the Re-Stat scrolls, and Blessing. The task bar has none of them (`ObjectExecutor`, `WndManager.cpp:2724-2778`).
 */
export function bagConfirm(prop: WebItemProp, state: BagState): Refusal | null {
  if (prop.id === 10434 || prop.id === 26316) {
    return state.skillPointsSpent ? { kind: 'box', tid: 'TID_GAME_SKILLINIT' } : { kind: 'say', tid: 'TID_GAME_ERROR_SKILLRECCURENCE' };
  }
  const restate = RESTATE.get(prop.id);
  if (restate !== undefined) return { kind: 'box', tid: restate };
  if (prop.id === 10430 && !state.charged) {
    return state.revival ? { kind: 'say', tid: 'TID_GAME_LIMITED_USE' } : { kind: 'box', tid: 'TID_GAME_DEPEN_USE' };
  }
  return null;
}

/** `SM_MAX` (`_Network/CmnHdr.h:503`). */
const SM_MAX = 26;

/**
 * `m_dwSMTime`: the premium timers' seconds. SM_MODE and SM_MODE_ALL set them; every whole second takes one off each
 * above 1, which waits there for the server's 0 (`WndWorld.cpp:8865-8876`).
 */
export class SmTimers {
  private readonly seconds = new Map<number, number>();
  private last: number | null = null;

  /** `m_dwSMTime[type] = seconds` at `now` (ms); a type outside the enum is ignored (`OnSMMode`). */
  set(type: number, seconds: number, now: number): void {
    if (!Number.isInteger(type) || type < 0 || type >= SM_MAX) return;
    this.last ??= now;
    if (seconds > 0) this.seconds.set(type, seconds);
    else this.seconds.delete(type);
  }

  /** The whole seconds since the last tick come off. */
  tick(now: number): void {
    if (this.last === null) {
      this.last = now;
      return;
    }
    const whole = Math.floor((now - this.last) / 1000);
    if (whole <= 0) return;
    this.last += whole * 1000;
    for (const [type, seconds] of this.seconds) if (seconds > 1) this.seconds.set(type, Math.max(1, seconds - whole));
  }

  /** `IsSMMode( type )`. */
  has(type: number): boolean {
    return (this.seconds.get(type) ?? 0) > 0;
  }

  /** The running timers, by type. */
  list(): Array<{ type: number; seconds: number }> {
    return [...this.seconds].sort((a, b) => a[0] - b[0]).map(([type, seconds]) => ({ type, seconds }));
  }
}

/** `GetSkillPoint`'s points a level (`CProject::m_dwVagSP`, `m_dwExpertSP`, `m_dwProSP`, `Project.cpp:128-130`), by `JTYPE_*`. */
const POINTS_A_LEVEL = (jobType: number): number => (jobType === 0 ? 1 : jobType === 1 ? 2 : 3);
/** `JTYPE_MASTER` 5 and `JTYPE_HERO` 6: their levels cost no points. */
const NO_POINTS: ReadonlySet<number> = new Set([5, 6]);
/** `GetCurrentMaxSkillPoint`'s cap by job (`Mover.cpp:1922-1933`): the jobs' and their master's and hero's. */
function pointsCap(job: number): number {
  const base = job >= 24 ? job - 18 : job >= 16 ? job - 10 : job;
  if (base === 6 || base === 7) return 870; // Knight, Blade
  if (base === 8 || base === 9) return 910; // Jester, Ranger
  if (base === 10) return 902; // Ringmaster
  if (base === 11 || base === 12) return 950; // Billposter, Psykeeper
  return 1280;
}

/**
 * `m_nSkillPoint < GetCurrentMaxSkillPoint()` (`Mover.cpp:1905-1936`): the points left, plus each skill's level times
 * its points (the master's and hero's none), capped by the job, is more than the points left: some point is spent.
 */
export function skillPointsSpent(
  skillPoint: number, slots: ReadonlyArray<{ skill: number; level: number }>, job: number,
  skills: ReadonlyMap<number, { jobType: number }>,
): boolean {
  let max = skillPoint;
  for (const { skill, level } of slots) {
    const prop = skills.get(skill);
    if (prop !== undefined && level > 0 && !NO_POINTS.has(prop.jobType)) max += level * POINTS_A_LEVEL(prop.jobType);
  }
  return skillPoint < Math.min(max, pointsCap(job));
}

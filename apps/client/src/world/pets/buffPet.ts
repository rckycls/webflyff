// The buff pet's rules (pets B1, docs/superpowers/plans/2026-11-09-pets-rest.md; [R] =
// docs/superpowers/specs/2026-11-09-pets-research.md §4, V15 `__PETVIS`). Pure rules; the window is
// hud/buffPetStatusWindow.ts, its flows buffPetWindows.ts, the aura buffPetAura.ts.
//
// A buff pet is a pick-up pet item (`IK3_PET`) whose vis stones sit in its piercing list (`CPiercing`, `piercing.cpp`): the
// vis item ids in the first list, their end times in the third (`m_vtmPetVis`, `time_t`). Here a pet is those two lists.
//
//   Function                            File:lines                               what
//   ItemProp::IsVisPet .. IsPickupToBuff _Common/ProjectCmn.h:380-384            a buff pet item, a vis, the vis key, Pet Magic
//   CItemElem::IsVisPet                 _Common/Item.h:273                       by its prop, or one Pet Magic made
//   CItemElem::GetVisPetSfxId           _Common/Item.cpp:810-828                 the aura of the best vis level
//   CMover::GetValidVisTable            _Common/MoverSkill.cpp:4188-4202         each slot's state: an empty one fails
//   CMover::SetValidNeedVis             MoverSkill.cpp:4204-4248                 a vis works when the vis it needs work
//   CMover::IsSatisfyNeedVis            MoverSkill.cpp:4250-4275                 a vis's needs, each working and in time
//   CWndMgr::PutVisPetInfo              _Interface/WndManager.cpp:7545-7608      a vis's time left in words
//   CWndMgr::CheckConfirm               WndManager.cpp:7640-7717                 the boxes before a vis, the key, Pet Magic

import type { WebItemProp } from '@flyffweb/formats';
import { MAX_VIS } from '@flyffweb/protocol';
import type { InventoryItem } from '@flyffweb/protocol';
import { formatText } from '../hud/format';
import type { Texts } from '../gameData';

export { MAX_VIS };

/** `IK3_PET` 100 and `IK3_VIS` 138 (`Resource/defineItemkind.h:169`, `:201`). */
export const IK3_PET = 100;
export const IK3_VIS = 138;
/** `PET_VIS` (`dwReferStat1` of the buff pet items, `ProjectCmn.h:380`): 1. */
const PET_VIS = 1;
/** `II_SYS_SYS_VIS_KEY01` and `II_SYS_SYS_SCR_PET_MAGIC` (`Resource/defineItem.h:5339`, `:5403`). */
export const II_SYS_SYS_VIS_KEY01 = 26855;
export const II_SYS_SYS_SCR_PET_MAGIC = 26910;
/** `XI_BUFFPET_GRADE1-3` (`Resource/defineObj.h:931-933`): `sfx_buffpet01-03`. */
export const XI_BUFFPET_GRADE = [1914, 1915, 1916] as const;
/** `NULL_ID`. */
const NULL_ID = 0xffffffff;

/** The states of a vis (`_Network/CmnHdr.h:570-574`). */
export const NeedVis = { FAILED_BOTH: 0, FAILED_1ST: 1, FAILED_2ND: 2, SUCCESS: 3, UNDEFINED: 4 } as const;
export type NeedVisState = (typeof NeedVis)[keyof typeof NeedVis];

/** The vis of a buff pet item: `GetPiercingItem( i )` and `GetVisKeepTime( i )` (end times, seconds of `time_null()`). */
export interface VisPet {
  piercing: readonly number[];
  ends: readonly number[];
}

/** The props the rules read of a vis. */
export type VisProps = ReadonlyMap<number, Pick<WebItemProp, 'referTarget1' | 'referTarget2' | 'abilityMax'>>;

/** `dwReferTarget1`, `dwReferTarget2`: absent for `=` (`NULL_ID`). */
const needsOf = (prop: Pick<WebItemProp, 'referTarget1' | 'referTarget2'>): [number, number] =>
  [prop.referTarget1 ?? NULL_ID, prop.referTarget2 ?? NULL_ID];

/** `GetPiercingItem( n )`: 0 past the list (`piercing.cpp:111-117`). */
const visAt = (pet: Pick<VisPet, 'piercing'>, n: number): number => pet.piercing[n] ?? 0;

/** `GetVisKeepTime( n )`: 0 past either list (`piercing.cpp:171-177`). */
export function visEndAt(pet: VisPet, n: number): number {
  if (n >= pet.piercing.length || n >= pet.ends.length) return 0;
  return pet.ends[n] ?? 0;
}

/** `CItemElem::IsVisPet` (`Item.h:273`): a buff pet by its prop (`IK3_PET`, `PET_VIS`), or one the Pet Magic scroll made. */
export function isVisPet(item: Pick<InventoryItem, 'transformVisPet'>, prop: Pick<WebItemProp, 'kind3' | 'referStat1'> | undefined): boolean {
  return (prop !== undefined && prop.kind3 === IK3_PET && prop.referStat1 === PET_VIS) || item.transformVisPet === true;
}

/**
 * `GetValidVisTable` (`MoverSkill.cpp:4188-4202`): a state a slot, `FAILED_BOTH` for an empty one, then each other slot by
 * `SetValidNeedVis` (:4204-4248): no need works; else each needed vis must be in a slot that works (looked at in the
 * slots' order, the first match deciding). The C++ would loop for ever on vis that need each other; here a slot met again
 * on its own way fails (the data has no such loop).
 */
export function validVisTable(pet: Pick<VisPet, 'piercing'>, props: VisProps): NeedVisState[] {
  const states: NeedVisState[] = pet.piercing.map((id) => (id === 0 ? NeedVis.FAILED_BOTH : NeedVis.UNDEFINED));
  const visiting = new Set<number>();
  const setValid = (pos: number): boolean => {
    if (states[pos] !== NeedVis.UNDEFINED) return states[pos] === NeedVis.SUCCESS;
    if (visiting.has(pos)) return false;
    const prop = props.get(visAt(pet, pos));
    if (prop === undefined) {
      states[pos] = NeedVis.FAILED_BOTH;
      return false;
    }
    const [need1, need2] = needsOf(prop);
    if (need1 === NULL_ID && need2 === NULL_ID) {
      states[pos] = NeedVis.SUCCESS;
      return true;
    }
    visiting.add(pos);
    let result1 = need1 === NULL_ID, result2 = need2 === NULL_ID;
    for (let i = 0; i < pet.piercing.length; i++) {
      if (need1 === visAt(pet, i)) result1 = setValid(i);
      if (need2 === visAt(pet, i)) result2 = setValid(i);
      if (result1 && result2) {
        visiting.delete(pos);
        states[pos] = NeedVis.SUCCESS;
        return true;
      }
    }
    visiting.delete(pos);
    states[pos] = !result1 && result2 ? NeedVis.FAILED_1ST : result1 && !result2 ? NeedVis.FAILED_2ND : NeedVis.FAILED_BOTH;
    return false;
  };
  for (let i = 0; i < states.length; i++) if (states[i] === NeedVis.UNDEFINED) setValid(i);
  return states;
}

/**
 * `IsSatisfyNeedVis` (`MoverSkill.cpp:4250-4275`): whether `vis`'s needs are in `pet`, each in a slot that works and whose
 * time is not out at `now` (`time_null()`): `SUCCESS`, `FAILED_1ST` or `FAILED_2ND` for one of the two missing, else
 * `FAILED_BOTH` (also with no prop).
 */
export function satisfyNeedVis(pet: VisPet, vis: Pick<WebItemProp, 'referTarget1' | 'referTarget2'> | undefined, props: VisProps, now: number): NeedVisState {
  if (vis === undefined) return NeedVis.FAILED_BOTH;
  let [need1, need2] = needsOf(vis);
  if (need1 === NULL_ID && need2 === NULL_ID) return NeedVis.SUCCESS;
  const table = validVisTable(pet, props);
  for (let i = 0; i < pet.piercing.length; i++) {
    const id = visAt(pet, i);
    const works = table[i] === NeedVis.SUCCESS && now < visEndAt(pet, i);
    if (need1 === id && works) need1 = NULL_ID;
    if (need2 === id && works) need2 = NULL_ID;
    if (need1 === NULL_ID && need2 === NULL_ID) return NeedVis.SUCCESS;
  }
  if (need1 !== NULL_ID && need2 === NULL_ID) return NeedVis.FAILED_1ST;
  if (need1 === NULL_ID && need2 !== NULL_ID) return NeedVis.FAILED_2ND;
  return NeedVis.FAILED_BOTH;
}

/** `GetVisPetSfxId` (`Item.cpp:810-828`): the aura of the highest `dwAbilityMax` (the vis level) in the slots, or `NULL_ID`. */
export function visPetSfxId(pet: Pick<VisPet, 'piercing'>, props: VisProps): number {
  let level = 0;
  for (const id of pet.piercing) {
    const max = props.get(id)?.abilityMax;
    if (max !== undefined && max > level) level = max;
  }
  return level >= 1 && level <= 3 ? XI_BUFFPET_GRADE[level - 1]! : NULL_ID;
}

/** `CTimeSpan`'s parts of `t` seconds, each C's truncation (a negative span has negative parts). */
export function timeSpan(t: number): { days: number; hours: number; minutes: number; seconds: number } {
  const whole = (n: number): number => Math.trunc(n) || 0; // no -0
  const days = whole(t / 86400), totalHours = whole(t / 3600), totalMinutes = whole(t / 60);
  return {
    days, hours: whole(totalHours - days * 24), minutes: whole(totalMinutes - totalHours * 60),
    seconds: whole(t - totalMinutes * 60),
  };
}

/**
 * `PutVisPetInfo`'s time of a vis (`WndManager.cpp:7562-7596`): days, hours and minutes from a day; hours and minutes
 * from an hour; minutes and seconds from a minute; the seconds from 0; `TID_GAME_TOOLTIP_TIMEOUT` past its end (unless a
 * whole minute past: then the seconds' 0, as the C++ tests `nSec >= 0`).
 */
export function visTimeLeft(t: number, texts: Texts): string {
  const text = (tid: string, value: number): string => formatText(texts.get(tid)?.text ?? '', [value]);
  const { days, hours, minutes, seconds } = timeSpan(t);
  if (days > 0) return text('TID_PK_LIMIT_DAY', days) + text('TID_PK_LIMIT_HOUR', hours) + text('TID_PK_LIMIT_MINUTE', minutes);
  if (hours > 0) return text('TID_PK_LIMIT_HOUR', hours) + text('TID_PK_LIMIT_MINUTE', minutes);
  if (minutes > 0) return text('TID_PK_LIMIT_MINUTE', minutes) + text('TID_PK_LIMIT_SECOND', seconds);
  if (seconds >= 0) return text('TID_PK_LIMIT_SECOND', seconds);
  return texts.get('TID_GAME_TOOLTIP_TIMEOUT')?.text ?? '';
}

/**
 * `PutKeepTime`'s vis words (`WndManager.cpp:5896-5923`), for `t` > 0 seconds: as `visTimeLeft` but by the parts being
 * non-zero (`if( time.GetDays() )`), and the seconds at the end with no test.
 */
export function visKeepTimeText(t: number, texts: Texts): string {
  const text = (tid: string, value: number): string => formatText(texts.get(tid)?.text ?? '', [value]);
  const { days, hours, minutes, seconds } = timeSpan(t);
  if (days !== 0) return text('TID_PK_LIMIT_DAY', days) + text('TID_PK_LIMIT_HOUR', hours) + text('TID_PK_LIMIT_MINUTE', minutes);
  if (hours !== 0) return text('TID_PK_LIMIT_HOUR', hours) + text('TID_PK_LIMIT_MINUTE', minutes);
  if (minutes !== 0) return text('TID_PK_LIMIT_MINUTE', minutes) + text('TID_PK_LIMIT_SECOND', seconds);
  return text('TID_PK_LIMIT_SECOND', seconds);
}

/**
 * `CWndConfirmVis::ConfirmVisSection` (`_Interface/WndPetSys.h:118-128`): put a vis in, take one out, the vis key, Pet
 * Magic. (`ETC_PROTECT_AWAKE` is Awakening Protection's, premiumItems.ts.)
 */
export type ConfirmVisSection = 'equipVis' | 'unequipVis' | 'equipVisKey' | 'pickupToBuff';

/**
 * `CheckConfirm`'s pet branches (`WndManager.cpp:7646-7692`), from the bag and the task bar before `SendDoUseItem`: with
 * a buff pet out (`HasActivatedVisPet`) a vis (`IsVis`) or the vis key (`IsVisKey`) asks first; Pet Magic
 * (`IsPickupToBuff`) always asks. Null: no box, DOUSEITEM goes at once.
 */
export function checkConfirmVis(prop: Pick<WebItemProp, 'id' | 'kind3'>, visPetOut: boolean): ConfirmVisSection | null {
  if (visPetOut) {
    if (prop.kind3 === IK3_VIS) return 'equipVis';
    if (prop.id === II_SYS_SYS_VIS_KEY01) return 'equipVisKey';
  }
  return prop.id === II_SYS_SYS_SCR_PET_MAGIC ? 'pickupToBuff' : null;
}

/**
 * The box's words (`CWndConfirmVis::OnInitialUpdate`, `WndPetSys.cpp:2891-2918`): `TID_GAME_BUFFPET_EQUIP` and
 * `TID_GAME_BUFFPET_CANCEL` with the vis's name, `TID_GAME_BUFFPET_KET01` with the buff pet mover's prop name (empty when
 * there is no such mover: `strTitle` stays empty), `TID_GAME_PET_TRAN` as it is.
 */
export function confirmVisText(section: ConfirmVisSection, texts: Texts, visName: string, petMoverName: string | null): string {
  const text = (tid: string): string => texts.get(tid)?.text ?? '';
  switch (section) {
    case 'equipVis': return formatText(text('TID_GAME_BUFFPET_EQUIP'), [visName]);
    case 'unequipVis': return formatText(text('TID_GAME_BUFFPET_CANCEL'), [visName]);
    case 'equipVisKey': return petMoverName === null ? '' : formatText(text('TID_GAME_BUFFPET_KET01'), [petMoverName]);
    case 'pickupToBuff': return text('TID_GAME_PET_TRAN');
  }
}

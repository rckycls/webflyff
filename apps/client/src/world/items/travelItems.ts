// The travel items' client refusals and their gauge (Piece 7 M3, [R §2, §3]): what Neuz checks before it sends
// DOUSEITEM for a Blinkwing or the Scroll of Return, in its order, and the width of the cast's gauge.
//
//   Function                          File:lines                         what
//   CDPClient::SendDoUseItem          Neuz/DPClient.cpp:10254-10431      dead, the ready time, the Blinkwing's worlds, the Scroll
//   CMover::IsUseItemReadyTime        _Common/Mover.cpp:2768-2828        an item with dwSkillReadyType: casting, standing, flying
//   CMover::RenderCasting             _Common/MoverRender.cpp:1982-2043  the fill: GauPartyHp's 112 px times the time gone
//   the worlds' titles                Resource/World.inc:105-108,301-304 Kebaras "Azria", the miniroom "House"

import type { WebItemProp } from '@flyffweb/formats';
import { useOf } from './premiumItems';

/** `IK2_BLINKWING` (`Resource/defineItemkind.h:40`): the Town and place Blinkwings, and the Escape Blinkwing. */
export const IK2_BLINKWING = 22;
/** `II_SYS_SYS_SCR_RETURN` (`Resource/defineItem.h:2527`): the Scroll of Return. */
export const RETURN_SCROLL = 10469;
/** `WI_WORLD_KEBARAS`, `WI_WORLD_GUILDWAR` and `WI_WORLD_MINIROOM` (`Resource/defineWorld.h`). */
export const KEBARAS = 2;
export const GUILDWAR = 202;
export const MINIROOM = 209;

/** The kinds `ItemUse` sent before M3: IK2_REFRESHER 11, IK2_POTION 12, IK2_FOOD 14. */
const CONSUMABLES: readonly number[] = [11, 12, 14];

/** The worlds TID_PK_BLINK_NO names: `SetTitle` of World.inc, through world.txt.txt (not TIDs). */
const WORLD_TITLES: ReadonlyMap<number, string> = new Map([[KEBARAS, 'Azria'], [MINIROOM, 'House']]);

/** The gauge's full width: `m_TextureHPGauge[1]` (GauPartyHp.TGA) is 112 px wide, and the fill is clamped to 112. */
const GAUGE_FULL = 112;

/** A Blinkwing of any kind, or the Scroll of Return. */
export function isTravelItem(prop: WebItemProp): boolean {
  return prop.kind2 === IK2_BLINKWING || prop.id === RETURN_SCROLL;
}

/**
 * What the bag (the PC's double-click, the phone's Use) and the task bar send: the consumables of before, the travel
 * items, (Piece 7 M5) the rides and the Accelor Fuel (`IK2_AIRFUEL` 23), and (2026-11-05) every item Neuz sends DOUSEITEM
 * for that the browser can follow: the premium items and scrolls, buffs and boxes (`useOf`, premiumItems.ts).
 */
export function usableFromBag(prop: WebItemProp): boolean {
  return CONSUMABLES.includes(prop.kind2) || isTravelItem(prop) || (prop.part === 13 && prop.flight !== undefined) ||
    prop.kind2 === 23 || useOf(prop) === 'use';
}

/** What `SendDoUseItem` looks at besides the item. */
export interface UseCheck {
  prop: WebItemProp;
  worldId: number;
  /** The own mover is in `STATE_BASEMOTION_MODE`. */
  casting: boolean;
  /** `GetMoveState() == OBJSTA_STAND`. */
  standing: boolean;
  flying: boolean;
  /** The own mover has the Scroll of Return's buff (`HasBuff( BUFF_ITEM, II_SYS_SYS_SCR_RETURN )`). */
  returnBuff: boolean;
  /** Piece 7 M5, for a ride: the level, the world's `fly`, the land under the mover, a disguise, and sitting. */
  level?: number;
  worldFly?: boolean;
  landAttr?: number;
  disguised?: boolean;
  sitting?: boolean;
  /**
   * 2026-11-05, the premium items: the focused mover DOUSEITEM names (`GetObjFocus`, NULL_ID with none:
   * `WndField.cpp:2131-2134`), the wings' buff that is on, a Blessing on (`IsSMMode( SM_REVIVAL )`), and whether a skill
   * point is spent (`m_nSkillPoint < GetCurrentMaxSkillPoint()`).
   */
  focusId?: number;
  wing?: number | null;
  revival?: boolean;
  skillPointsSpent?: boolean;
}

/** A refusal: a line said in its TID's colour (with `args` for its `%s`), or a box with an OK button. */
export type Refusal = { kind: 'say'; tid: string; args?: string } | { kind: 'box'; tid: string };

/** The first refusal of `SendDoUseItem` for this use, or null to go on (the Scroll's box, or the send). */
export function useRefusal(check: UseCheck): Refusal | null {
  const { prop } = check;
  // IsUseItemReadyTime, for an item with a cast (DPClient.cpp:10326; Mover.cpp:2809-2824); one's own shop is not in
  // the browser
  if (prop.castMs !== undefined) {
    if (check.casting) return { kind: 'say', tid: 'TID_PK_BLINK_LIMIT' };
    if (!check.standing) return { kind: 'say', tid: 'TID_PK_STAND_LIMIT' };
    if (check.flying) return { kind: 'say', tid: 'TID_PK_FLIGHT_NOUSE' };
  }
  if (prop.kind2 === IK2_BLINKWING) {
    if (check.worldId === KEBARAS || check.worldId === MINIROOM) {
      return { kind: 'say', tid: 'TID_PK_BLINK_NO', args: WORLD_TITLES.get(check.worldId)! }; // :10392-10398, :10406-10414
    }
    if (check.worldId === GUILDWAR) return { kind: 'box', tid: 'TID_GAME_GUILDCOMBAT_NO_OUTWAR' }; // :10400-10404
  }
  if (prop.id === RETURN_SCROLL && check.returnBuff) return { kind: 'say', tid: 'TID_GAME_LIMITED_USE' }; // :10416-10420
  return null;
}

/** The fill of the cast's gauge in the texture's pixels: `112 * elapsed / dwSkillReadyType`, from 0 to 112. */
export function castFill(elapsedMs: number, castMs: number): number {
  const width = Math.trunc(GAUGE_FULL * (elapsedMs / castMs));
  return Math.min(GAUGE_FULL, Math.max(0, width));
}

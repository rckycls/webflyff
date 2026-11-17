// The menu a player's mover opens (Piece 7 M4, [R §5.1]): `CWndWorld::ShowMoverMenu` for a player
// (`_Interface/WndWorld.cpp:6517-6624`), within 20 m (`fDistSq < 20 * 20`, :6520-6527; farther, the walk to it, :6705-6709):
//
//   MMI_TRADE 2               Trade                       always (:6552); 2026-11-10: the trade (trade/tradeHud.ts)
//   MMI_ADD_MESSENGER 5       Add to my list              always (:6553)
//   MMI_INVITE_PARTY 6        Invite to join party        always, never greyed (:6554); the click: InviteParty
//   MMI_INVITE_COMPANY 7      Invite to join guild        in a guild whose rank may invite (:6556-6565); 2026-11-10: the guild
//                                                         (guild/guildHud.ts `inviteMover`)
//   MMI_DUEL 10, _PARTY 11    "Duel - 1 vs 1", "Duel -   EVE_18, the target alive, both in an RA_FIGHT region, the party
//                             Party vs Party"            duel for a leader (:6589-6608); 2026-11-15 (social): the duels
//                                                         (duel/duelBook.ts `inFightRegion`, social/socialHud.ts)
//   MMI_TRACE 12              Follow                      always (:6611); 2026-11-15 (social): the follow (social/follow.ts)
//   MMI_QUERYEQUIP 24         View equipment              always (:6612); 2026-11-17: the View window (queryEquipWindow.ts)
//   MMI_CHEER 31              Cheer                       always (:6613); 2026-11-15 (social): SendCheering when not flying
//                                                         (`OnCommand` MMI_CHEER, WndWorld.cpp:5680-5686)
//   MMI_INVITE_CAMPUS 151     Request Mentor-Pupil Bond   always, or Cancel for a pupil (:6614-6624)
//
// Only the invite, (2026-11-10, friends-say) "Add to my list", (2026-11-10, trade) Trade, (2026-11-15, social) the duels,
// Cheer and Follow, and (2026-11-17) View equipment are the browser's; the rest are shown greyed, as the NPC menu's (plan
// Decisions 4).

import type { Vec3 } from '@flyffweb/protocol';
import type { Texts } from '../gameData';
import { MENU_RANGE, menuLabel } from '../hud/moverMenu';
import type { MenuEntry } from '../hud/moverMenu';

export const MMI_INVITE_PARTY = 6;
/** 2026-11-10: MMI_TRADE (`Resource/defineNeuz.h:94`), "Trade" (`WndWorld.cpp:5251-5358`, trade/tradeHud.ts `requestTrade`). */
export const MMI_TRADE = 2;
/** 2026-11-10: MMI_ADD_MESSENGER, "Add to my list" (`WndWorld.cpp:5141-5159`, friends/friendHud.ts `addFromMenu`). */
export const MMI_ADD_MESSENGER = 5;
/** TID_GAME_MENU_CAMPUS_INVITATION, not TID_MMI_DIALOG + 151 (:6610). */
const MMI_INVITE_CAMPUS = 151;
/** 2026-11-10: MMI_INVITE_COMPANY (`Resource/defineNeuz.h:99`), "Invite to join guild" (`WndWorld.cpp:5645-5650`). */
export const MMI_INVITE_COMPANY = 7;
/** 2026-11-15 (social): MMI_TRACE, "Follow" (`Resource/defineNeuz.h`, `OnCommand`, WndWorld.cpp:5673-5679). */
export const MMI_TRACE = 12;
/** 2026-11-15 (social): MMI_CHEER, "Cheer" (`Resource/defineNeuz.h:123`, `OnCommand`, WndWorld.cpp:5680-5686). */
export const MMI_CHEER = 31;
/** 2026-11-15 (social): MMI_DUEL and MMI_DUEL_PARTY (`Resource/defineNeuz.h:102-103`), their texts written in the code. */
export const MMI_DUEL = 10;
export const MMI_DUEL_PARTY = 11;

const ENTRIES: ReadonlyArray<[number, string]> = [
  [MMI_TRADE, 'Trade'], [5, 'Add to my list'], [MMI_INVITE_PARTY, 'Invite to join party'],
  [MMI_INVITE_COMPANY, 'Invite to join guild'], [MMI_TRACE, 'Follow'], [24, 'View equipment'],
  [MMI_CHEER, 'Cheer'], [MMI_INVITE_CAMPUS, 'Request Mentor-Pupil Bond'],
];
/**
 * 2026-11-10: MMI_QUERYEQUIP, the one line of a seller's menu (`__CSC_VER12_1`, WndWorld.cpp:6544-6547). 2026-11-17
 * (view-equip-options): `SendQueryEquip` to the player (`OnCommand`, WndWorld.cpp:5248-5255), hud/queryEquipWindow.ts.
 */
export const MMI_QUERYEQUIP = 24;

/** The entries the browser acts on. */
const ACTIVE: ReadonlySet<number> = new Set([
  MMI_INVITE_PARTY, MMI_ADD_MESSENGER, MMI_TRADE, MMI_INVITE_COMPANY, MMI_DUEL, MMI_DUEL_PARTY, MMI_TRACE, MMI_CHEER, MMI_QUERYEQUIP,
]);

/**
 * `vendor`: the player has an open personal shop, and its menu is "View equipment" alone (greyed here, as before).
 * `guildInvite` (2026-11-10): the viewer is in a guild whose rank may invite (`PF_INVITATION`, :6556-6565): the invite line
 * is there, enabled; otherwise it is not in the menu at all.
 */
export function playerMenuEntries(texts: Texts, vendor = false, guildInvite = false, duels: { solo: boolean; party: boolean } = { solo: false, party: false }): MenuEntry[] {
  // 2026-11-15 (social): the duels after the guild's invite, with the texts `AppendMenu` writes (:6603-6605)
  const list = duels.solo ? [...ENTRIES.slice(0, 4), [MMI_DUEL, 'Duel - 1 vs 1'] as const,
    ...(duels.party ? [[MMI_DUEL_PARTY, 'Duel - Party vs Party'] as const] : []), ...ENTRIES.slice(4)] : ENTRIES;
  return list.filter(([id]) => (!vendor || id === MMI_QUERYEQUIP) && (id !== MMI_INVITE_COMPANY || guildInvite)).map(([id, english]) => ({
    id,
    label: id === MMI_INVITE_CAMPUS ? (texts.get('TID_GAME_MENU_CAMPUS_INVITATION')?.text ?? english)
      : id === MMI_DUEL || id === MMI_DUEL_PARTY ? english : menuLabel(id, texts, english),
    enabled: ACTIVE.has(id),
  }));
}

/** The menu opens within 20 m (`D3DXVec3LengthSq( pTarget->GetPos() - g_pPlayer->GetPos() ) < 20 * 20`). */
export function menuInReach(own: Vec3, target: Vec3): boolean {
  const dx = target[0] - own[0], dy = target[1] - own[1], dz = target[2] - own[2];
  return dx * dx + dy * dy + dz * dz < MENU_RANGE * MENU_RANGE;
}

// The menu a player's mover opens (Piece 7 M4, [R §5.1]): `CWndWorld::ShowMoverMenu` for a player
// (`_Interface/WndWorld.cpp:6517-6624`), within 20 m (`fDistSq < 20 * 20`, :6520-6527; farther, the walk to it, :6705-6709):
//
//   MMI_TRADE 2               Trade                       always (:6552); 2026-11-10: the trade (trade/tradeHud.ts)
//   MMI_ADD_MESSENGER 5       Add to my list              always (:6553)
//   MMI_INVITE_PARTY 6        Invite to join party        always, never greyed (:6554); the click: InviteParty
//   MMI_INVITE_COMPANY 7      Invite to join guild        in a guild that may invite (:6556-6565): no guild here
//   MMI_DUEL 10, _PARTY 11    the duels                   event EVE_18 and a fight area (:6583-6599): out of scope
//   MMI_TRACE 12              Follow                      always (:6605)
//   MMI_QUERYEQUIP 24         View equipment              always (:6606)
//   MMI_CHEER 31              Cheer                       always (:6607)
//   MMI_INVITE_CAMPUS 151     Request Mentor-Pupil Bond   always, or Cancel for a pupil (:6608-6618)
//
// Only the invite, (2026-11-10, friends-say) "Add to my list" and (2026-11-10, trade) Trade are the browser's; the rest are
// shown greyed, as the NPC menu's (plan Decisions 4).

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

const ENTRIES: ReadonlyArray<[number, string]> = [
  [MMI_TRADE, 'Trade'], [5, 'Add to my list'], [MMI_INVITE_PARTY, 'Invite to join party'], [12, 'Follow'], [24, 'View equipment'],
  [31, 'Cheer'], [MMI_INVITE_CAMPUS, 'Request Mentor-Pupil Bond'],
];

export function playerMenuEntries(texts: Texts): MenuEntry[] {
  return ENTRIES.map(([id, english]) => ({
    id,
    label: id === MMI_INVITE_CAMPUS ? (texts.get('TID_GAME_MENU_CAMPUS_INVITATION')?.text ?? english) : menuLabel(id, texts, english),
    enabled: id === MMI_INVITE_PARTY || id === MMI_ADD_MESSENGER || id === MMI_TRADE,
  }));
}

/** The menu opens within 20 m (`D3DXVec3LengthSq( pTarget->GetPos() - g_pPlayer->GetPos() ) < 20 * 20`). */
export function menuInReach(own: Vec3, target: Vec3): boolean {
  const dx = target[0] - own[0], dy = target[1] - own[1], dz = target[2] - own[2];
  return dx * dx + dy * dy + dz * dz < MENU_RANGE * MENU_RANGE;
}

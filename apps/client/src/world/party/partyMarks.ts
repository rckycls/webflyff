// The party on the Navigator and the world map (Piece 7 M4, [R §9.4], [R §9.5]).
//
//   CWndNavigator::OnEraseBkgnd  _Interface/WndField.cpp:9222-9600  a mover in view: a party member (`g_Party.IsMember(
//                                                                   m_idPlayer )`) is sprite 4 of ImgNavObj.bmp; each
//                                                                   paint writes a member's position into its slot
//                                                                   (:9396-9402); the far members' arrows are commented out
//   CWorldMap::RenderWorldMap    Neuz/WorldMap.cpp:786-823          after the own arrow, each member not oneself and not
//                                                                   removed (`m_bRemove`, offline), at `g_Party.GetPos( i )`,
//                                                                   named by `GetPlayerString( id )`
//
// The guild member's dot (sprite 3, before the party's) needs guild data the browser does not keep (plan Decisions 12).
// Neuz's slot position for a member in view is the Navigator's last paint; here it is the mover's position when the map
// is drawn, the same point.

import type { Vec3 } from '@flyffweb/protocol';
import type { NavigatorKind } from '../hud/minimap';
import type { Mover } from '../WorldState';
import type { PartyState } from './partyState';
import type { PlayerDataCenter } from './playerData';

/** The Navigator's dot for a mover in view: a player of the own party is `'party'`, every other its own kind. */
export function navigatorKind(mover: Mover, party: PartyState): NavigatorKind {
  const player = mover.added.player;
  if (mover.kind === 'player' && player !== undefined && party.isMember(player.playerId)) return 'party';
  return mover.kind;
}

/** A member's mark on the world map. */
export interface PartyMapMark {
  pos: Vec3;
  name: string;
}

/**
 * The world map's party marks: each member but `ownPlayerId` and the removed ones, at its mover's position while in view
 * (`inViewPos`), else at the one PARTYMAPINFO gave, named from the player data.
 */
export function partyMapMarks(
  party: PartyState,
  ownPlayerId: number,
  inViewPos: (playerId: number) => Vec3 | null,
  names: PlayerDataCenter,
): PartyMapMark[] {
  const marks: PartyMapMark[] = [];
  for (const member of party.members) {
    if (member.playerId === ownPlayerId || member.removed) continue;
    marks.push({ pos: inViewPos(member.playerId) ?? member.pos, name: names.get(member.playerId).name });
  }
  return marks;
}

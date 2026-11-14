// 2026-11-15 (housing): personal housing's snapshots as the world server writes them (`CUser::AddHousing*`,
// `WORLDSERVER/User.cpp:8449-8519`), and the ADD_OBJ of a control (`CUser::AddAddObj` with `CCtrl::Serialize`), in the
// order of the readers (`@flyffweb/protocol` world/housing.ts, world/addObj.ts).

import { ArWriter, HousingMessageType, MessageType, ObjectType } from '@flyffweb/protocol';
import type { AddedCtrl, HousingInfo } from '@flyffweb/protocol';
import type { ScriptMessage } from './world';

const scripted = (objectId: number, type: number, w: ArWriter = new ArWriter()): ScriptMessage =>
  ({ objectId, type, fields: w.toBytes() });

/** HOUSINGINFO's storing side: the seconds left as `tKeepTime - time_null()`. */
function info(w: ArWriter, i: HousingInfo): ArWriter {
  return w.u32(i.itemId).i32(i.secondsLeft).i32(i.placed ? 1 : 0).vec3(i.pos).f32(i.angle);
}

/** HOUSING_ALLINFO (`CHousing::Serialize`): the list, then the friends allowed in. */
export function writeHousingAllInfo(selfId: number, furniture: readonly HousingInfo[], allowed: readonly number[]): ScriptMessage {
  const w = new ArWriter().u32(furniture.length);
  for (const piece of furniture) info(w, piece);
  w.u32(allowed.length);
  for (const id of allowed) w.u32(id);
  return scripted(selfId, HousingMessageType.ALLINFO, w);
}

/** HOUSING_FURNITURELIST: a piece listed (`add`) or expired. */
export function writeHousingFurnitureList(selfId: number, piece: HousingInfo, add: boolean): ScriptMessage {
  return scripted(selfId, HousingMessageType.FURNITURELIST, info(new ArWriter(), piece).i32(add ? 1 : 0));
}

/** HOUSING_SETUPFURNITURE: a piece placed or taken down. */
export function writeHousingSetupFurniture(selfId: number, piece: HousingInfo): ScriptMessage {
  return scripted(selfId, HousingMessageType.SETUPFURNITURE, info(new ArWriter(), piece));
}

/** HOUSING_PAPERINGINFO: a wallpaper or floor on or off; NULL_ID and FALSE for the room as it was. */
export function writeHousingPapering(selfId: number, itemId: number, on: boolean): ScriptMessage {
  return scripted(selfId, HousingMessageType.PAPERINGINFO, new ArWriter().u32(itemId).i32(on ? 1 : 0));
}

/** HOUSING_SETVISITALLOW: to the owner, a friend allowed in or taken off the list. */
export function writeHousingSetVisitAllow(selfId: number, playerId: number, allow: boolean): ScriptMessage {
  return scripted(selfId, HousingMessageType.SETVISITALLOW, new ArWriter().u32(playerId).i32(allow ? 1 : 0));
}

/** HOUSING_VISITABLELIST: the online owners who allowed the player in. */
export function writeHousingVisitableList(selfId: number, owners: readonly number[]): ScriptMessage {
  const w = new ArWriter().u32(owners.length);
  for (const id of owners) w.u32(id);
  return scripted(selfId, HousingMessageType.VISITABLELIST, w);
}

/**
 * ADD_OBJ of a control (`CreateObj( OT_CTRL, dwLinkKind )` of a placed piece, `Housing.cpp:334`): the type and index,
 * then `CObj::Serialize` (the type, index, scale x 100 as a u_short, the point, the angle x 10 as a short) and `m_objid`.
 */
export function writeAddCtrl(ctrl: AddedCtrl): ScriptMessage {
  const w = new ArWriter().u8(ObjectType.CTRL).u32(ctrl.index)
    .u8(ObjectType.CTRL).u32(ctrl.index).u16(Math.round(ctrl.scale * 100)).vec3(ctrl.pos).i16(Math.round(ctrl.angle * 10))
    .u32(ctrl.objectId);
  return scripted(ctrl.objectId, MessageType.ADD_OBJ, w);
}

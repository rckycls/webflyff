// 2026-11-15 (guild house): the guild house's snapshots as the world server writes them (`CUser::AddGuildHouse*`,
// `WORLDSERVER/User.cpp:8716-8792`), in the order of the readers (`@flyffweb/protocol` world/guildHouse.ts).

import { ArWriter, GuildHouseMessageType } from '@flyffweb/protocol';
import type { GuildFurniture, GuildHouseInfo } from '@flyffweb/protocol';
import type { ScriptMessage } from './world';

const scripted = (objectId: number, type: number, w: ArWriter = new ArWriter()): ScriptMessage =>
  ({ objectId, type, fields: w.toBytes() });

/** `GH_Fntr_Info::Serialize`'s storing side. */
function furniture(w: ArWriter, f: GuildFurniture): ArWriter {
  return w.u32(f.itemId >>> 0).i32(f.placed ? 1 : 0).vec3(f.pos).f32(f.angle).u32(f.objectId >>> 0).i32(f.secondsLeft);
}

/** GUILDHOUSE_ALLINFO: the furniture channel, and the house (`SerializeAllInfo`) or none. */
export function writeGuildHouseAllInfo(selfId: number, channel: boolean, house: GuildHouseInfo | null): ScriptMessage {
  const w = new ArWriter().i32(channel ? 1 : 0).i32(house === null ? 0 : 1);
  if (house !== null) {
    w.u32(house.guildId).u32(house.worldId).i32(house.upkeepSecondsLeft).u32(house.furniture.length);
    for (const f of house.furniture) furniture(w, f);
  }
  return scripted(selfId, GuildHouseMessageType.ALLINFO, w);
}

/** GUILDHOUSE_PACKET: a kind, the list index and the record, to every member online. */
export function writeGuildHousePacket(selfId: number, packetType: number, index: number, f: GuildFurniture): ScriptMessage {
  return scripted(selfId, GuildHouseMessageType.PACKET, furniture(new ArWriter().i32(packetType).i32(index), f));
}

/** GUILDHOUSE_RESTPOINT: the rest gauge's points. */
export function writeGuildHouseRestPoint(selfId: number, restPoint: number): ScriptMessage {
  return scripted(selfId, GuildHouseMessageType.RESTPOINT, new ArWriter().i32(restPoint));
}

/** GUILDHOUSE_REMOVE: the type alone. */
export function writeGuildHouseRemove(selfId: number): ScriptMessage {
  return scripted(selfId, GuildHouseMessageType.REMOVE);
}

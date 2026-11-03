// The own quests (Piece 7 M1), as Neuz reads and sends them:
//
//   QUEST                    _Common/Mover.h:261-279              12 bytes raw: m_nState, a pad byte, m_wTime, m_wId,
//                                                                 m_nKillNPCNum[2], the flag bits (m_bPatrol bit 0,
//                                                                 m_bDialog bit 1), a pad byte
//   OnSetQuest               Neuz/DPClient.cpp:8444-8573          SETQUEST 0x00b0: one QUEST, for the player
//   OnRemoveQuest            DPClient.cpp:14633-14684             REMOVEQUEST 0x003a: i32 type (-1, 0, 1, 2), u32 id
//   OnQuestTextTime          DPClient.cpp:6750-6767               QUEST_TEXT_TIME 0x00ba: BOOL, i32 state, u32 ms
//                                                                 (party quests; drawn on internal servers only)
//   OnNPCPos                 DPClient.cpp:18650-18661             QUESTHELPER_NPCPOS 0x9400: D3DXVECTOR3
//   OnCheckedQuest           DPClient.cpp:19245-19250             QUEST_CHECKED 0x8820: BYTE n, WORD[n]
//   SendRemoveQuest          DPClient.cpp:11247                   PACKETTYPE_REMOVEQUEST 0x00ff0026: u32 id
//   SendCheckedQuestId       DPClient.cpp:19252                   PACKETTYPE_QUEST_CHECK 0x88100110: i32 id, i32 check

import type { ArReader } from '../ar/ArReader';
import type { ArWriter } from '../ar/ArWriter';
import { PacketType } from '../constants';
import { clientPacket } from './packet';

/** One own quest. `time` is `m_wTime` as sent: minutes left, with bit 15 set once every condition is met. */
export interface OwnQuest {
  id: number;
  state: number;
  time: number;
  kills: [number, number];
  patrol: boolean;
  dialog: boolean;
}

/** `QS_END` (Resource/definequest.h:520): the quest has ended. */
export const QS_END = 14;

export type QuestMessage =
  | { type: 'setQuest'; quest: OwnQuest }
  | { type: 'removeQuest'; kind: number; questId: number }
  | { type: 'questTextTime'; flag: boolean; state: number; ms: number }
  | { type: 'questHelperNpcPos'; pos: [number, number, number] }
  | { type: 'questChecked'; quests: number[] };

export function readQuest(r: ArReader): OwnQuest {
  const state = r.u8();
  r.u8();
  const time = r.u16();
  const id = r.u16();
  const kills: [number, number] = [r.u16(), r.u16()];
  const flags = r.u8();
  r.u8();
  return { id, state, time, kills, patrol: (flags & 1) !== 0, dialog: (flags & 2) !== 0 };
}

export function writeQuest(w: ArWriter, quest: OwnQuest): ArWriter {
  return w.u8(quest.state).u8(0).u16(quest.time).u16(quest.id).u16(quest.kills[0]).u16(quest.kills[1])
    .u8((quest.patrol ? 1 : 0) | (quest.dialog ? 2 : 0)).u8(0);
}

/** A BYTE count, then that many WORD quest ids (`m_aCompleteQuest`, `m_aCheckedQuest`, QUEST_CHECKED). */
export function readQuestIds(r: ArReader): number[] {
  const ids: number[] = [];
  for (let n = r.u8(); n > 0; n--) ids.push(r.u16());
  return ids;
}

export function readSetQuest(r: ArReader): QuestMessage {
  return { type: 'setQuest', quest: readQuest(r) };
}

export function readRemoveQuest(r: ArReader): QuestMessage {
  return { type: 'removeQuest', kind: r.i32(), questId: r.u32() };
}

export function readQuestTextTime(r: ArReader): QuestMessage {
  return { type: 'questTextTime', flag: r.i32() !== 0, state: r.i32(), ms: r.u32() };
}

export function readQuestHelperNpcPos(r: ArReader): QuestMessage {
  return { type: 'questHelperNpcPos', pos: [r.f32(), r.f32(), r.f32()] };
}

export function readQuestChecked(r: ArReader): QuestMessage {
  return { type: 'questChecked', quests: readQuestIds(r) };
}

/** `CDPClient::SendRemoveQuest`: abandon a quest. */
export function encodeRemoveQuest(questId: number): Uint8Array {
  return clientPacket(PacketType.REMOVEQUEST).u32(questId).toBytes();
}

/** `CDPClient::SendCheckedQuestId`: tick or untick a quest for the tracker. */
export function encodeQuestCheck(questId: number, check: boolean): Uint8Array {
  return clientPacket(PacketType.QUEST_CHECK).i32(questId).i32(check ? 1 : 0).toBytes();
}

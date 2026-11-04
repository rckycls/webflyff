import type { ArReader } from '../ar/ArReader';
import { ProtocolError } from '../errors';
import { chatBytes } from './chat';
import { clientPacket } from './packet';
import { PacketType } from '../constants';

/** CDPClient::SendTeleporterReq (DPClient.cpp:19097); the server resolves AddTeleport[index]. */
export function encodeTeleporter(key: string, index: number): Uint8Array {
  const bytes = chatBytes(key, 63);
  if (bytes.length === 0 || !Number.isInteger(index) || index < 0 || index > 0x7fffffff) throw new ProtocolError('Invalid teleporter destination');
  return clientPacket(PacketType.TELEPORTER).i32(bytes.length).bytes(bytes).i32(index).toBytes();
}

/**
 * Buff Pang's menu entry (2026-11-05): `CDPClient::SendNPCBuff( m_szCharacterKey )` (`Neuz/DPClient.cpp:17387-17394`,
 * `CWndWorld::OnCommand` MMI_NPC_BUFF, `_Interface/WndWorld.cpp:5131-5136`): the key alone, which the server reads with
 * `ReadString( m_szKey, 64 )` (`CDPSrvr::OnNPCBuff`, `WORLDSERVER/DPSrvr.cpp:9076-9140`).
 */
export function encodeNpcBuff(key: string): Uint8Array {
  const bytes = chatBytes(key, 63);
  if (bytes.length === 0) throw new ProtocolError('Invalid NPC key');
  return clientPacket(PacketType.NPC_BUFF).i32(bytes.length).bytes(bytes).toBytes();
}

/** The stat a FUNCTYPE_INITSTAT .. INITINT puts back to 15 (`OnRunScriptFunc`, DPClient.cpp:14374-14431). */
export type InitStat = 'all' | 'str' | 'sta' | 'dex' | 'int';
/** A RUNSCRIPTFUNC, by its `FUNCTYPE_*` (`_Network/MsgHdr.h:1416-1438`). */
export type NpcAction =
  | { kind: 'say'; text: string; quest: number }
  | { kind: 'key' | 'answer' | 'newQuest' | 'currentQuest'; label: string; key: string; param: number; quest: number }
  | { kind: 'removeKey'; key: string }
  | { kind: 'clear' | 'exit' | 'none' | 'removeNavigator' }
  | { kind: 'initStat'; stat: InitStat; remainGP: number }
  | { kind: 'navigator'; worldId: number; pos: [number, number, number] }
  | { kind: 'queryName'; of: 'player' | 'guild' };
export interface NpcMessage { type: 'npcScript'; action: NpcAction }

const SCRIPTDLG = 0xff00b0; // PACKETTYPE_SCRIPTDLG, _Network/MsgHdr.h:174

/**
 * The dialogue's opening, `SendScriptDialogReq( id, NULL, 0, 0, 0, 0 )` (WndWorld.cpp:5174, DPClient.cpp:9647-9654): the
 * NULL key goes as an empty string, which the server reads as `#init`.
 */
export function encodeNpcDialogOpen(npcId: number): Uint8Array {
  return clientPacket(SCRIPTDLG).u32(npcId).i32(0).i32(0).i32(0).i32(0).i32(0).toBytes();
}
/**
 * `CWndDialog::RunScript` (WndDialog.cpp:234-240): `SendScriptDialogReq( npcId, key, param, quest, npcId, playerId )`, the
 * NPC and the player as nGlobal3 and nGlobal4.
 */
export function encodeNpcDialog(npcId: number, key: string, param: number, quest: number, playerId: number): Uint8Array {
  const bytes = chatBytes(key, 255);
  return clientPacket(SCRIPTDLG).u32(npcId).i32(bytes.length).bytes(bytes).i32(param).i32(quest).i32(npcId).i32(playerId).toBytes();
}

const INIT_STATS: Record<number, InitStat> = { 0x1a: 'all', 0x20: 'str', 0x21: 'sta', 0x22: 'dex', 0x23: 'int' };

/**
 * `CDPClient::OnRunScriptFunc` (DPClient.cpp:14265-14476): every function's fields, read as Neuz reads them. The ones V15
 * never sends (SETMARK, GOMARK, ENDSAY, CREATEGUILD, SETNAVIGATOR, REMOVENAVIGATOR, SAYQUEST, QUERYSETGUILDNAME) are read
 * too, so a bundle keeps its place.
 */
export function readNpcScript(r: ArReader): NpcMessage {
  const func = r.u16();
  const button = (kind: 'key' | 'answer' | 'newQuest' | 'currentQuest'): NpcAction =>
    ({ kind, label: r.string(1024), key: r.string(1024), param: r.u32(), quest: r.u32() });
  let action: NpcAction;
  switch (func) {
    case 0x10: action = button('key'); break;
    case 0x11: action = { kind: 'removeKey', key: r.string(1024) }; break;
    case 0x12: action = { kind: 'say', text: r.string(1024), quest: r.u32() }; break;
    case 0x13: action = button('answer'); break;
    case 0x14: case 0x15: case 0x17: case 0x18: case 0x19: action = { kind: 'none' }; break;
    case 0x16: action = { kind: 'exit' }; break;
    case 0x1a: case 0x20: case 0x21: case 0x22: case 0x23:
      action = { kind: 'initStat', stat: INIT_STATS[func]!, remainGP: r.u32() }; break;
    case 0x1b: action = { kind: 'navigator', worldId: r.u32(), pos: [r.f32(), r.f32(), r.f32()] }; break;
    case 0x1c: action = { kind: 'removeNavigator' }; break;
    case 0x1d: action = { kind: 'clear' }; break;
    case 0x1e: r.string(1024); r.u32(); action = { kind: 'none' }; break; // SAYQUEST: the server's text + quest
    case 0x24: action = { kind: 'queryName', of: 'player' }; break;
    case 0x25: action = { kind: 'queryName', of: 'guild' }; break;
    case 0x26: action = button('newQuest'); break;
    case 0x27: action = button('currentQuest'); break;
    default: throw new ProtocolError(`Unsupported NPC script function ${func}`, r.position());
  }
  return { type: 'npcScript', action };
}

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

export type NpcAction =
  | { kind: 'say'; text: string; quest: number }
  | { kind: 'key' | 'answer'; label: string; key: string; param: number; quest: number }
  | { kind: 'removeKey'; key: string }
  | { kind: 'clear' | 'exit' | 'end' | 'unsupported' };
export interface NpcMessage { type: 'npcScript'; action: NpcAction }
/** SendScriptDialogReq: object, key and four script globals (last two are NPC/player IDs). */
export function encodeNpcDialog(npcId: number, key: string, param = 0, quest = 0, playerId = 0): Uint8Array {
  const bytes = chatBytes(key || '#init', 255);
  return clientPacket(0xff00b0).u32(npcId).i32(bytes.length).bytes(bytes).i32(param).i32(quest).i32(npcId).i32(playerId).toBytes();
}
/** OnRunScriptFunc: only dialogue/menu presentation; unsupported quest actions never execute client commands. */
export function readNpcScript(r: ArReader): NpcMessage {
  const func = r.u16();
  let action: NpcAction;
  switch (func) {
    case 0x10: case 0x13:
      action = { kind: func === 0x10 ? 'key' : 'answer', label: r.string(1024), key: r.string(1024), param: r.u32(), quest: r.u32() }; break;
    case 0x11: action = { kind: 'removeKey', key: r.string(1024) }; break;
    case 0x12: action = { kind: 'say', text: r.string(1024), quest: r.u32() }; break;
    case 0x1d: action = { kind: 'clear' }; break;
    case 0x16: action = { kind: 'exit' }; break;
    case 0x14: case 0x15: case 0x17: action = { kind: 'end' }; break;
    case 0x26: case 0x27:
      r.string(1024); r.string(1024); r.u32(); r.u32(); action = { kind: 'unsupported' }; break;
    case 0x18: case 0x19: action = { kind: 'unsupported' }; break;
    default: throw new ProtocolError(`Unsupported NPC script function ${func}`, r.position());
  }
  return { type: 'npcScript', action };
}

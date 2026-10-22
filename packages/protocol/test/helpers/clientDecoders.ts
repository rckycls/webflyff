import { ArReader, DPID_UNKNOWN, PacketType, ProtocolError } from '../../src';
import type { NewCharacter } from '../../src';

// Test-only: reads the client packets a recording holds, so a test can re-encode them and compare. The sizes are
// generous upper bounds for the C++ buffers, not limits under test.
const ACCOUNT_BUFFER = 42;
const HASH_BUFFER = 33;
const NAME_BUFFER = 64;

function startClientPacket(body: Uint8Array, type: number): ArReader {
  const r = new ArReader(body);
  if (r.u32() !== DPID_UNKNOWN) throw new ProtocolError('client packet does not start with DPID_UNKNOWN', 0);
  if (r.u32() !== type) throw new ProtocolError(`client packet is not type 0x${type.toString(16)}`, 4);
  return r;
}

/** Reads a CREATE_PLAYER body in the order `encodeCreatePlayer` writes it. */
export function decodeCreatePlayer(body: Uint8Array): { account: string; hash: string; character: NewCharacter; authKey: number } {
  const r = startClientPacket(body, PacketType.CREATE_PLAYER);
  const account = r.string(ACCOUNT_BUFFER);
  const hash = r.string(HASH_BUFFER);
  const slot = r.u8();
  const name = r.string(NAME_BUFFER);
  const face = r.u8();
  const costume = r.u8();
  const skinSet = r.u8();
  const hairMesh = r.u8();
  const hairColor = r.u32();
  const sex = r.u8();
  const job = r.u8();
  const headMesh = r.u8();
  const bankPin = r.i32();
  const authKey = r.u32();
  r.expectEnd();
  return { account, hash, character: { slot, name, face, costume, skinSet, hairMesh, hairColor, sex, job, headMesh, bankPin }, authKey };
}

/** Reads a DEL_PLAYER body in the order `encodeDeletePlayer` writes it. */
export function decodeDeletePlayer(body: Uint8Array): {
  account: string; hash: string; key: string; playerId: number; authKey: number; friendIds: number[];
} {
  const r = startClientPacket(body, PacketType.DEL_PLAYER);
  const account = r.string(ACCOUNT_BUFFER);
  const hash = r.string(HASH_BUFFER);
  const key = r.string(HASH_BUFFER);
  const playerId = r.u32();
  const authKey = r.u32();
  const count = r.u32();
  const friendIds: number[] = [];
  for (let i = 0; i < count; i++) friendIds.push(r.u32());
  r.expectEnd();
  return { account, hash, key, playerId, authKey, friendIds };
}

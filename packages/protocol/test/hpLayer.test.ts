// 2026-11-11: layered boss HP, a server addition: SNAPSHOTTYPE_HP_LAYER (0x9A00) read as the rebuilt Neuz reads it
// (CDPClient::OnHpLayer) and written as the world server writes it (CUser::AddHpLayer / CUserMng::AddHpLayer).
import { describe, expect, it } from 'vitest';
import { encodeBundle, writeDamage, writeHpLayer } from '@flyffweb/testkit';
import type { ScriptMessage } from '@flyffweb/testkit';
import { AttackFlag, HpLayerMessageType, PacketType, WORLD_READERS, readBundle } from '../src';

const PLAYER = 9;
const BOSS = 0x2001;

function read(messages: ScriptMessage[]) {
  const result = readBundle(encodeBundle(PacketType.SNAPSHOT, PLAYER, messages), WORLD_READERS);
  expect(result.skipped).toEqual([]);
  expect(result.mismatched).toEqual([]);
  return result.messages;
}

describe('HP_LAYER (layered boss HP, MsgHdr.h SNAPSHOTTYPE_HP_LAYER)', () => {
  it('is 0x9A00: four ints, bars left, bars at spawn, one bar\'s max HP and the current HP, under the boss\'s object', () => {
    expect(HpLayerMessageType).toEqual({ HP_LAYER: 0x9a00 });
    const [message] = read([writeHpLayer(BOSS, 4, 5, 2_000_000_000, 1_999_999_999)]);
    expect(message?.objectId).toBe(BOSS);
    expect(message?.value).toEqual({ type: 'hpLayer', bars: 4, barsMax: 5, barMaxHp: 2_000_000_000, hp: 1_999_999_999 });
  });

  it('follows the hit\'s DAMAGE in one snapshot, and the messages after it are still read', () => {
    const messages = read([
      writeDamage(BOSS, PLAYER, 150, AttackFlag.GENERIC),
      writeHpLayer(BOSS, 2, 3, 120, 90),
      writeDamage(BOSS, PLAYER, 10, AttackFlag.GENERIC),
    ]);
    expect(messages.map((m) => m.value.type)).toEqual(['damage', 'hpLayer', 'damage']);
    expect(messages[1]?.value).toMatchObject({ bars: 2, barsMax: 3, barMaxHp: 120, hp: 90 });
  });
});

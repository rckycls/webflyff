// 2026-11-15 (item tooltip gaps): SNAPSHOTTYPE_TAX_ALLINFO (0x0400), read as Neuz reads it (CDPClient::OnTaxInfo,
// CTax::Serialize's loading side, Source/_Common/Tax.cpp:416-440) and written as the world server writes it
// (CUser::AddTaxInfo, WORLDSERVER/User.cpp:8366-8373; the storing side, Tax.cpp:393-415, without the DB server's fields).
import { describe, expect, it } from 'vitest';
import { encodeBundle, writeDamage, writeTaxInfo } from '@flyffweb/testkit';
import type { ScriptMessage } from '@flyffweb/testkit';
import { ArWriter, AttackFlag, PacketType, TaxMessageType, WORLD_READERS, readBundle } from '../src';

const PLAYER = 9;

function read(messages: ScriptMessage[]) {
  const result = readBundle(encodeBundle(PacketType.SNAPSHOT, PLAYER, messages), WORLD_READERS);
  expect(result.skipped).toEqual([]);
  expect(result.mismatched).toEqual([]);
  return result.messages;
}

describe('TAX_ALLINFO (MsgHdr.h SNAPSHOTTYPE_TAX_ALLINFO)', () => {
  it('is 0x0400: a count, then each continent, its guild, and its rates by kind', () => {
    expect(TaxMessageType).toEqual({ TAX_ALLINFO: 0x0400 });
    // CTax's map as the constructor makes it (Tax.cpp:23-31): east with admission, west, all with admission
    const fields = new ArWriter().i32(3)
      .u8(15).u32(0x1234).i32(3).u8(0).i32(5).u8(1).i32(7).u8(2).i32(1000)
      .u8(240).u32(0xffffffff).i32(2).u8(0).i32(0).u8(1).i32(0)
      .u8(255).u32(77).i32(3).u8(0).i32(1).u8(1).i32(2).u8(2).i32(3)
      .toBytes();
    const [message] = read([{ objectId: PLAYER, type: 0x0400, fields }]);
    expect(message?.value).toEqual({
      type: 'taxInfo',
      continents: [
        { continent: 15, guildId: 0x1234, rates: [{ kind: 0, rate: 5 }, { kind: 1, rate: 7 }, { kind: 2, rate: 1000 }] },
        { continent: 240, guildId: 0xffffffff, rates: [{ kind: 0, rate: 0 }, { kind: 1, rate: 0 }] },
        { continent: 255, guildId: 77, rates: [{ kind: 0, rate: 1 }, { kind: 1, rate: 2 }, { kind: 2, rate: 3 }] },
      ],
    });
  });

  it('comes in a snapshot among others, and the messages after it are still read (the testkit writer)', () => {
    const messages = read([
      writeTaxInfo(PLAYER, [{ continent: 15, guildId: 1, rates: [{ kind: 0, rate: 10 }, { kind: 1, rate: 20 }] }]),
      writeDamage(PLAYER, PLAYER, 10, AttackFlag.GENERIC),
    ]);
    expect(messages.map((m) => m.value.type)).toEqual(['taxInfo', 'damage']);
    expect(messages[0]?.value).toEqual({
      type: 'taxInfo', continents: [{ continent: 15, guildId: 1, rates: [{ kind: 0, rate: 10 }, { kind: 1, rate: 20 }] }],
    });
  });
});

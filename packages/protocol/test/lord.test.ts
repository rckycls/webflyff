// 2026-11-11: the Lord system's packets (docs/superpowers/specs/2026-11-11-lord-research.md §3), read as Neuz's handlers read
// them (Neuz/DPClient.cpp:17782-17901) and written as its senders write them (:17903-17936).
import { describe, expect, it } from 'vitest';
import {
  STOCK_ELECTION_PROPERTY, encodeBundle, lordElection, writeElectionAddDeposit, writeElectionBeginCandidacy,
  writeElectionBeginVote, writeElectionEndVote, writeElectionIncVote, writeElectionSetPledge, writeLord, writeLordEventCreate,
  writeLordEventInitialize, writeLordEventTick, writeLordSkillTick, writeLordSkillUse,
} from '@flyffweb/testkit';
import {
  ArReader, LordMessageType, LordPacket, NULL_ID, PacketType, WORLD_READERS, decodeWorldPacket, encodeElectionAddDeposit,
  encodeElectionIncVote, encodeElectionSetPledge, encodeLordEventCreate, encodeLordSkillUse, isLordMessage, readBundle,
} from '../src';

const SELF = 9;

function read(messages: Parameters<typeof encodeBundle>[2]) {
  const result = readBundle(encodeBundle(PacketType.SNAPSHOT, SELF, messages), WORLD_READERS);
  expect(result.mismatched).toEqual([]);
  expect(result.skipped).toEqual([]);
  return result.messages;
}

describe('the LORD snapshot (CLord::Serialize, lord.cpp:361-371)', () => {
  it('reads the Lord, the election with its property and candidates, the events and the skill ticks', () => {
    const election = lordElection({
      id: 4, state: 2, begin: 1_794_000_000, requirement: 3,
      property: { ...STOCK_ELECTION_PROPERTY, items: [[101, 102], [201]] },
      candidates: [
        { playerId: 500, deposit: 3_000_000_000, votes: 7, created: 1_794_000_100, pledge: 'For Madrigal!\nVote me.' },
        { playerId: 501, deposit: 100_000_000, votes: 0, created: 1_794_000_200, pledge: '' },
      ],
    });
    const [message] = read([writeLord({
      lordId: 500, election, events: [{ tick: 42, playerId: 500, expFactor: 0.25, dropFactor: 0.5 }],
      skillTicks: [{ id: 0, tick: 0 }, { id: 4, tick: 119 }],
    })]);
    expect(message?.objectId).toBe(NULL_ID);
    if (message?.value.type !== 'lord') throw new Error('no lord');
    const lord = message.value.lord;
    expect(lord.lordId).toBe(500);
    expect(lord.election.id).toBe(4);
    expect(lord.election.state).toBe(2);
    expect(lord.election.begin).toBe(1_794_000_000);
    expect(lord.election.requirement).toBe(3);
    expect(lord.election.property.dayOfWeek).toBe(6);
    expect(lord.election.property.returnRates.map((r) => Math.round(r * 100))).toEqual([100, 100, 80, 60, 40, 20, 0, 0, 0, 0, 98]);
    expect(lord.election.property.items).toEqual([[101, 102], [201]]);
    expect(lord.election.candidates).toEqual(election.candidates);
    expect(lord.events).toEqual([{ tick: 42, playerId: 500, expFactor: 0.25, dropFactor: 0.5 }]);
    expect(lord.skillTicks).toEqual([{ id: 0, tick: 0 }, { id: 4, tick: 119 }]);
  });

  it('reads no Lord and an empty election (the first start)', () => {
    const [message] = read([writeLord()]);
    if (message?.value.type !== 'lord') throw new Error('no lord');
    expect(message.value.lord.lordId).toBe(NULL_ID);
    expect(message.value.lord.election.candidates).toEqual([]);
  });
});

describe('the election and event snapshots', () => {
  it('reads each one, in a bundle with the others', () => {
    const values = read([
      writeElectionBeginCandidacy(),
      writeElectionAddDeposit(500, 150_000_000, 1_794_000_100),
      writeElectionSetPledge(500, 'Free buffs'),
      writeElectionBeginVote(12),
      writeElectionIncVote(500, 777),
      writeElectionEndVote(500),
      writeLordEventCreate({ tick: 60, playerId: 500, expFactor: 0.05, dropFactor: 0 }),
      writeLordEventTick([{ id: 500, tick: 59 }]),
      writeLordEventInitialize(),
      writeLordSkillTick([{ id: 5, tick: 59 }]),
      writeLordSkillUse(31, 777, 0),
    ]).map((m) => [m.objectId, m.value]);
    expect(values).toEqual([
      [NULL_ID, { type: 'electionBeginCandidacy' }],
      [NULL_ID, { type: 'electionAddDeposit', playerId: 500, deposit: 150_000_000, created: 1_794_000_100 }],
      [NULL_ID, { type: 'electionSetPledge', playerId: 500, pledge: 'Free buffs' }],
      [NULL_ID, { type: 'electionBeginVote', requirement: 12 }],
      [NULL_ID, { type: 'electionIncVote', playerId: 500, voterId: 777 }],
      [NULL_ID, { type: 'electionEndVote', lordId: 500 }],
      [NULL_ID, { type: 'lordEventCreate', event: { tick: 60, playerId: 500, expFactor: expect.closeTo(0.05, 6), dropFactor: 0 } }],
      [NULL_ID, { type: 'lordEventTick', ticks: [{ id: 500, tick: 59 }] }],
      [NULL_ID, { type: 'lordEventInitialize' }],
      [NULL_ID, { type: 'lordSkillTick', ticks: [{ id: 5, tick: 59 }] }],
      [31, { type: 'lordSkillUse', targetId: 777, skill: 0 }],
    ]);
    expect(values.every(([, value]) => isLordMessage(value as { type: string }))).toBe(true);
  });

  it('uses the MsgHdr.h numbers', () => {
    expect(LordMessageType.LORD).toBe(0x8f06);
    expect(LordMessageType.LORD_SKILL_USE).toBe(0x8f0d);
    expect(LordPacket.ELECTION_ADD_DEPOSIT).toBe(0x8fff0000);
    expect(LordPacket.LORD_SKILL_USE).toBe(0x8fff0009);
  });
});

describe('the client packets', () => {
  const fields = (bytes: Uint8Array) => {
    const r = new ArReader(bytes);
    r.u32(); // DPID_UNKNOWN
    return { type: r.u32(), r };
  };

  it('writes the total of a bid as an __int64', () => {
    const { type, r } = fields(encodeElectionAddDeposit(2_500_000_000));
    expect(type).toBe(LordPacket.ELECTION_ADD_DEPOSIT);
    expect(r.i64()).toBe(2_500_000_000n);
    r.expectEnd();
  });

  it('writes a pledge with its line breaks, and refuses one too long', () => {
    const { r } = fields(encodeElectionSetPledge('One\nTwo'));
    expect(r.string(255)).toBe('One\nTwo');
    expect(() => encodeElectionSetPledge('x'.repeat(255))).toThrow(RangeError);
    expect(encodeElectionSetPledge('x'.repeat(254)).byteLength).toBe(8 + 4 + 254);
  });

  it('writes the vote, the event and the skill as the server reads them', () => {
    expect(decodeWorldPacket(encodeElectionIncVote(500))).toEqual({ type: 'electionIncVoteRequest', playerId: 500 });
    expect(decodeWorldPacket(encodeLordEventCreate(2, 10))).toEqual({ type: 'lordEventCreateRequest', expRow: 2, dropRow: 10 });
    expect(decodeWorldPacket(encodeLordSkillUse(5, 'Webby'))).toEqual({ type: 'lordSkillUseRequest', skill: 5, target: 'Webby' });
    expect(decodeWorldPacket(encodeElectionAddDeposit(100_000_000)))
      .toEqual({ type: 'electionAddDepositRequest', total: 100_000_000 });
    expect(decodeWorldPacket(encodeElectionSetPledge('Hi'))).toEqual({ type: 'electionSetPledgeRequest', pledge: 'Hi' });
  });
});

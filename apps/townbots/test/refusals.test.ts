import { describe, expect, it } from 'vitest';
import type { WorldMessage } from '@flyffweb/protocol';
import { Refusals } from '../src/refusals';
import type { RefusalSends } from '../src/refusals';

const SIDE = { level: 10, job: 0, sex: 0 };

function setup() {
  const calls: string[] = [];
  const sends: RefusalSends = {
    partyNo: (leaderId, memberId) => calls.push(`partyNo ${leaderId} ${memberId}`),
    tradeNo: (askerId) => calls.push(`tradeNo ${askerId}`),
    duelNo: (askerPlayerId, party) => calls.push(`duelNo ${askerPlayerId} ${party}`),
    friendNo: (askerId) => calls.push(`friendNo ${askerId}`),
    coupleNo: () => calls.push('coupleNo'),
    whisper: (name, text) => calls.push(`whisper ${name} ${text}`),
  };
  let now = 0;
  const refusals = new Refusals(sends, ['hello po!'], () => 0, () => now, {
    ownName: () => 'abCd',
    isBot: (name) => name.toLowerCase() === 'efgh',
    ofObject: (id) => ({ 7: 'Player7', 8: 'efGh' } as Record<number, string>)[id],
    ofPlayer: (id) => ({ 70: 'Player7' } as Record<number, string>)[id],
  });
  return { calls, refusals, setNow: (ms: number) => { now = ms; } };
}

const party = (leaderId: number): WorldMessage => ({ type: 'partyRequest', leader: { id: leaderId, ...SIDE }, member: { id: 1, ...SIDE }, leaderName: 'Player7', troup: 0 }) as WorldMessage;
const whisper = (sender: string): WorldMessage => ({ type: 'whisper', sender, recipient: 'abCd', text: 'hi', fromId: 0, toId: 0, search: 0 }) as WorldMessage;

describe('Refusals', () => {
  it('says no to each request with the game\'s own answer, then a line', () => {
    const { calls, refusals, setNow } = setup();
    refusals.onMessage(7, party(70));
    expect(calls).toEqual(['partyNo 70 1', 'whisper Player7 hello po!']);
    calls.length = 0;
    setNow(61_000);
    refusals.onMessage(7, { type: 'confirmTrade' } as WorldMessage);
    refusals.onMessage(0, { type: 'duelRequest', party: false, asker: 70, asked: 1 } as WorldMessage);
    refusals.onMessage(0, { type: 'friendRequest', askerId: 7, sex: 0, job: 0, name: 'Player7' } as WorldMessage);
    refusals.onMessage(0, { type: 'proposeResult', proposerId: 70, name: 'Player7' } as WorldMessage);
    expect(calls.filter((c) => !c.startsWith('whisper'))).toEqual(['tradeNo 7', 'duelNo 70 false', 'friendNo 7', 'coupleNo']);
  });

  it('answers a guild invite with a line only (the game\'s No sends nothing)', () => {
    const { calls, refusals } = setup();
    refusals.onMessage(0, { type: 'guildInvite', guildId: 3, inviterId: 7 } as WorldMessage);
    expect(calls).toEqual(['whisper Player7 hello po!']);
  });

  it('answers a whisper to it, not its own echo nor a whisper to someone else', () => {
    const { calls, refusals } = setup();
    refusals.onMessage(0, whisper('Player7'));
    refusals.onMessage(0, { ...whisper('abCd'), recipient: 'Player7' } as WorldMessage);
    refusals.onMessage(0, { ...whisper('Player9'), recipient: 'someone' } as WorldMessage);
    expect(calls).toEqual(['whisper Player7 hello po!']);
  });

  it('spam gets refusals but one line a minute', () => {
    const { calls, refusals, setNow } = setup();
    for (let i = 0; i < 5; i++) {
      setNow(i * 1000);
      refusals.onMessage(7, party(70));
      refusals.onMessage(0, whisper('Player7'));
    }
    expect(calls.filter((c) => c.startsWith('partyNo'))).toHaveLength(5);
    expect(calls.filter((c) => c.startsWith('whisper'))).toHaveLength(1);
    setNow(61_000);
    refusals.onMessage(0, whisper('player7'));
    expect(calls.filter((c) => c.startsWith('whisper'))).toHaveLength(2);
  });

  it('never talks to another bot', () => {
    const { calls, refusals } = setup();
    refusals.onMessage(0, whisper('efGh'));
    refusals.onMessage(8, { type: 'confirmTrade' } as WorldMessage);
    expect(calls).toEqual(['tradeNo 8']);
  });
});

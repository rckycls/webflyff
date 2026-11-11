// 2026-11-11: the Lord system's client state (lord/lordBook.ts), run on the server's messages as CCLord runs them.
import { describe, expect, it } from 'vitest';
import { ElectionState, NULL_ID } from '@flyffweb/protocol';
import type { LordMessage } from '@flyffweb/protocol';
import { STOCK_ELECTION_PROPERTY } from '@flyffweb/testkit';
import { LordBook, firstBegin } from '../src/world/lord/lordBook';
import { LORD_EVENT_DROP, LORD_EVENT_EXP, LORD_SKILLS, lordEventCost } from '../src/world/lord/lordData';

const OWN = 500;
const NAMES: Record<number, string> = { 500: 'Webby', 501: 'Aibatt', 502: 'Julia' };
const NOW = 1_794_100_000;

function book(): LordBook {
  const b = new LordBook(() => OWN, (id) => NAMES[id] ?? '', () => NOW);
  b.apply({
    type: 'lord', lord: {
      lordId: NULL_ID, events: [], skillTicks: [],
      election: { id: 3, state: ElectionState.CANDIDACY, begin: NOW - 3600, requirement: 0, property: STOCK_ELECTION_PROPERTY, candidates: [] },
    },
  });
  return b;
}
const kinds = (notices: ReturnType<LordBook['apply']>) => notices.map((n) => (n.kind === 'changed' ? 'changed' : `${n.kind}${'tid' in n ? ':' + n.tid : ''}`));

describe('the election (IElection, lord.cpp:221-342; CCElection, clord.cpp:75-206)', () => {
  it('adds bids, sorted by deposit then by the first bid, and tells the own bidder', () => {
    const b = book();
    expect(kinds(b.apply({ type: 'electionAddDeposit', playerId: 501, deposit: 200_000_000, created: 10 }))).toEqual(['deposit', 'changed']);
    const own = b.apply({ type: 'electionAddDeposit', playerId: OWN, deposit: 100_000_000, created: 11 });
    expect(own[0]).toEqual({ kind: 'box', tid: 'TID_GAME_ELECTION_ADD_DEPOSIT_S002', args: [100_000_000] });
    expect(own[1]).toEqual({ kind: 'say', tid: 'TID_GAME_ELECTION_ADD_DEPOSIT_S003' });
    const more = b.apply({ type: 'electionAddDeposit', playerId: OWN, deposit: 100_000_000, created: 99 });
    expect(more[0]).toEqual({ kind: 'box', tid: 'TID_GAME_ELECTION_ADD_DEPOSIT_S001', args: [100_000_000, 100_000_000, 200_000_000] });
    // both at 200 M: the earlier first bid (501, created 10) stays first
    expect(b.candidates.map((c) => [c.playerId, c.deposit, c.created])).toEqual([[501, 200_000_000, 10], [OWN, 200_000_000, 11]]);
  });

  it('begins the vote with the top 10 and tells a candidate', () => {
    const b = book();
    for (let i = 0; i < 12; i++) b.apply({ type: 'electionAddDeposit', playerId: 600 + i, deposit: (i + 1) * 100_000_000, created: i });
    b.apply({ type: 'electionAddDeposit', playerId: OWN, deposit: 5_000_000_000, created: 50 });
    const notices = b.apply({ type: 'electionBeginVote', requirement: 4 });
    expect(kinds(notices)).toEqual(['caption:TID_GAME_ELECTION_CAPTION_BEGIN_VOTE_01', 'caption:TID_GAME_ELECTION_CAPTION_BEGIN_VOTE_02',
      'box:TID_GAME_ELECTION_BEGIN_VOTE_S001', 'changed']);
    expect(b.state).toBe(ElectionState.VOTE);
    expect(b.candidates).toHaveLength(10);
    expect(b.candidates[0]?.playerId).toBe(OWN);
    expect(b.election?.requirement).toBe(4);
    expect(b.isValid()).toBe(false);
  });

  it('counts votes, tells the own voter, sets pledges', () => {
    const b = book();
    b.apply({ type: 'electionAddDeposit', playerId: 501, deposit: 100_000_000, created: 1 });
    b.apply({ type: 'electionBeginVote', requirement: 0 });
    b.apply({ type: 'electionSetPledge', playerId: 501, pledge: 'Buffs for all' });
    expect(b.candidate(501)?.pledge).toBe('Buffs for all');
    expect(kinds(b.apply({ type: 'electionIncVote', playerId: 501, voterId: 777 }))).toEqual(['changed']);
    const own = b.apply({ type: 'electionIncVote', playerId: 501, voterId: OWN });
    expect(own.slice(0, 2)).toEqual([{ kind: 'voted' }, { kind: 'box', tid: 'TID_GAME_VOTE_COMPLETE', args: ['Aibatt'] }]);
    expect(b.candidate(501)?.votes).toBe(2);
    expect(b.totalVotes()).toBe(2);
  });

  it('ends the vote: the Lord set, the skills reset, the next election prepared 14 days on', () => {
    const b = book();
    b.apply({ type: 'lordSkillUse', targetId: OWN, skill: 4 });
    expect(b.skillTick(4)).toBe(120);
    const begin = b.election!.begin;
    const notices = b.apply({ type: 'electionEndVote', lordId: 502 });
    expect(notices).toContainEqual({ kind: 'caption', tid: 'TID_GAME_ELECTION_CAPTION_END_VOTE_02', args: ['Julia'] });
    expect(notices).toContainEqual({ kind: 'say', tid: 'TID_GAME_ELECTION_END_VOTE_S000', args: ['Julia'] });
    expect(notices).toContainEqual({ kind: 'notLord' });
    expect(b.lordId).toBe(502);
    expect(b.skillTick(4)).toBe(0);
    expect(b.state).toBe(ElectionState.READY);
    expect(b.election?.id).toBe(4);
    expect(b.election?.begin).toBe(begin + 14 * 86400);
    expect(b.candidates).toEqual([]);
  });

  it('ends with no Lord, and an own Lord keeps the windows', () => {
    const b = book();
    expect(kinds(b.apply({ type: 'electionEndVote', lordId: NULL_ID }))).toEqual(['caption:TID_GAME_ELECTION_CAPTION_END_VOTE_01',
      'say:TID_GAME_ELECTION_END_VOTE_S001', 'notLord', 'changed']);
    const own = b.apply({ type: 'electionEndVote', lordId: OWN });
    expect(own.some((n) => n.kind === 'notLord')).toBe(false);
    expect(b.isLord()).toBe(true);
  });

  it('works out the first begin as the next Friday 00:00 local time', () => {
    const wed = new Date(2026, 10, 11, 9, 30).getTime() / 1000; // a Wednesday
    const begin = new Date(firstBegin(6, 0, wed) * 1000);
    expect([begin.getDay(), begin.getHours(), begin.getDate()]).toEqual([5, 0, 13]);
    const fridayNoon = new Date(2026, 10, 13, 12, 0).getTime() / 1000;
    expect(new Date(firstBegin(6, 0, fridayNoon) * 1000).getDate()).toBe(20);
  });
});

describe('the events and the skill ticks', () => {
  it('adds an event with its caption and chat line, ticks it and drops it at 0', () => {
    const b = book();
    b.apply({ type: 'electionEndVote', lordId: OWN });
    const notices = b.apply({ type: 'lordEventCreate', event: { tick: 60, playerId: OWN, expFactor: 0.1, dropFactor: 0.05 } });
    expect(notices[0]).toEqual({ kind: 'caption', tid: 'TID_GAME_L_EVENT_CREATE_S001' });
    expect(notices[1]).toMatchObject({ kind: 'say', tid: 'TID_GAME_L_EVENT_CREATE_S004', colorTid: 'TID_ADMIN_ANNOUNCE' });
    expect((notices[1] as { args: unknown[] }).args[0]).toBe('Webby');
    b.apply({ type: 'lordEventTick', ticks: [{ id: OWN, tick: 1 }] });
    expect(b.eventOf(OWN)?.tick).toBe(1);
    b.apply({ type: 'lordEventTick', ticks: [{ id: OWN, tick: 0 }] });
    expect(b.events).toEqual([]);
  });

  it('takes the skill ticks from LORD_SKILL_TICK and the snapshot', () => {
    const b = book();
    b.apply({ type: 'lordSkillTick', ticks: [{ id: 5, tick: 42 }, { id: 99, tick: 3 }] });
    expect(b.skillTick(5)).toBe(42);
    expect(b.skillTicks.has(99)).toBe(false);
  });

  it('has the tables of lordskill.txt and lordevent.inc', () => {
    expect(LORD_SKILLS.map((s) => s.cooltime)).toEqual([60, 60, 60, 60, 120, 60, 10, 0]);
    expect(LORD_SKILLS[7]?.passive).toBe(true);
    expect(LORD_EVENT_EXP[10]).toEqual([0.5, 1_000_000_000]);
    expect(LORD_EVENT_DROP[1]).toEqual([0.05, 300_000_000]);
    expect(lordEventCost(0, 0)).toBe(0);
    expect(lordEventCost(2, 1)).toBe(500_000_000);
    expect(lordEventCost(10, 10)).toBe(4_000_000_000);
  });
});

// A message type the book does not know changes nothing.
it('ignores nothing it should not', () => {
  const b = book();
  expect(b.apply({ type: 'lordEventInitialize' } as LordMessage)).toEqual([{ kind: 'changed' }]);
});

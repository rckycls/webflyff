// The party state (Piece 7 M4, [R §1.1], [R §3]): `g_Party` and what its handlers print, play and open.

import { describe, expect, it } from 'vitest';
import type { MessageOf, PartyBlock } from '@flyffweb/protocol';
import { PartyState } from '../src/world/party/partyState';
import type { PartyEvent } from '../src/world/party/partyState';

const WEBBY = 70001;
const LEAD = 70002;
const THIRD = 70003;
/** The colour Neuz forces on the join, leave and refusal lines (`DPClient.cpp:4329`, :4515, :4676). */
const OLIVE = 0xff99cc00;

function party(inView: number[] = [], names: Record<number, string> = {}) {
  return new PartyState({
    ownPlayerId: () => WEBBY,
    inView: (id) => inView.includes(id),
    nameInView: (id) => names[id] ?? null,
    skillName: (skill) => ({ 5: 'Linked Attack', 8: 'Gift Box' }[skill] ?? ''),
    defaultName: () => 'Advance Party',
  });
}

const block = (members: number[], over: Partial<PartyBlock> = {}): PartyBlock => ({
  partyId: 77, kind: 0, level: 1, exp: 0, point: 0, expMode: 0, itemMode: 0, duelPartyId: 0, modeTime: [0, 0, 0, 0, 0],
  name: '', members: members.map((playerId) => ({ playerId, removed: false })), ...over,
});
const member = (members: number[] | null, leaderName = 'Lead', memberName = 'Webby', playerId = WEBBY, over: Partial<PartyBlock> = {}):
  MessageOf<'partyMember'> => ({ type: 'partyMember', playerId, leaderName, memberName, party: members === null ? null : block(members, over) });
const lines = (events: PartyEvent[]) => events.filter((e) => e.kind === 'line').map((e) => e.kind === 'line' && [e.tid, e.args, e.color]);
const kinds = (events: PartyEvent[]) => events.map((e) => e.kind);

describe('PartyState: forming and leaving ([R §3.3])', () => {
  it('a new party of two: the leader gets "Party has been created." and the member\'s join; the member gets the leader\'s join; music 25', () => {
    const leader = party();
    const asLeader = leader.apply(member([WEBBY, LEAD], 'Webby', 'Lead', LEAD));
    expect(lines(asLeader)).toEqual([['TID_GAME_PARTYCREATE', [], null], ['TID_GAME_PARTYJOIN1', ['Lead'], OLIVE]]);
    expect(asLeader).toContainEqual({ kind: 'music', id: 25 });
    expect([leader.size(), leader.isLeader(WEBBY), leader.isMember(LEAD)]).toEqual([2, true, true]);

    const asMember = party().apply(member([LEAD, WEBBY], 'Lead', 'Webby', WEBBY));
    expect(lines(asMember)).toEqual([['TID_GAME_PARTYJOIN2', ['Lead'], OLIVE]]);
    expect(asMember).toContainEqual({ kind: 'music', id: 25 });
    expect(kinds(asMember)).toContain('changed');
  });

  it('a third member joins; one leaves; the own player is kicked: "You have left the party." and the state is empty', () => {
    const p = party();
    p.apply(member([WEBBY, LEAD], 'Webby', 'Lead', LEAD));
    expect(lines(p.apply(member([WEBBY, LEAD, THIRD], 'Webby', 'Third', THIRD)))).toEqual([['TID_GAME_PARTYJOIN1', ['Third'], OLIVE]]);
    expect(lines(p.apply(member([WEBBY, LEAD], 'Webby', 'Third', THIRD)))).toEqual([['TID_GAME_PARTYREMOVE', ['Third'], OLIVE]]);
    // the same size again: Neuz's line is empty, and the browser prints none (ledger ruling)
    expect(lines(p.apply(member([WEBBY, LEAD], 'Webby', 'Lead', LEAD)))).toEqual([]);
    const kicked = p.apply(member(null, 'Lead', 'Webby', WEBBY));
    expect(lines(kicked)).toEqual([['TID_GAME_PARTYEXIT', [], null]]);
    expect(kinds(kicked)).toEqual(expect.arrayContaining(['iconsCleared', 'changed']));
    expect([p.size(), p.partyId, p.level, p.isMember(LEAD)]).toEqual([0, 0, 1, false]);
    // the party ended under another member: "Party has been disbanded."
    const other = party();
    other.apply(member([LEAD, WEBBY]));
    expect(lines(other.apply(member(null, 'Lead', 'Lead', LEAD)))).toEqual([['TID_GAME_PARTYDESTROY', [], null]]);
  });

  it('the log-in PARTYMEMBER prints its lines with an empty name', () => {
    // CDPDatabaseClient::OnJoin's AddPartyMember( pParty, 0, leaderName, "" ) into an empty g_Party (plan Decisions 6)
    expect(lines(party().apply(member([WEBBY, LEAD], 'Webby', '', 0)))).toEqual([
      ['TID_GAME_PARTYCREATE', [], null], ['TID_GAME_PARTYJOIN1', [''], OLIVE],
    ]);
    expect(lines(party().apply(member([LEAD, WEBBY, THIRD], 'Lead', '', 0)))).toEqual([['TID_GAME_PARTYJOIN1', [''], OLIVE]]);
  });

  it('the party block sets the level, the points, the modes, the kind and the name', () => {
    const p = party();
    p.apply(member([LEAD, WEBBY], 'Lead', 'Webby', WEBBY, { kind: 1, level: 12, exp: 40, point: 30, expMode: 1, itemMode: 2, name: 'Webbies', modeTime: [1, 0, 0, 0, 1] }));
    expect([p.kind, p.level, p.exp, p.point, p.expMode, p.itemMode, p.name, p.modeOn(0), p.modeOn(4), p.modeOn(1)])
      .toEqual([1, 12, 40, 30, 1, 2, 'Webbies', true, true, false]);
    expect(p.members.map((m) => [m.playerId, m.removed])).toEqual([[LEAD, false], [WEBBY, false]]);
  });
});

describe('PartyState: the members\' states ([R §1.1])', () => {
  it('SET_PARTY_MEMBER_PARAM marks a member offline; the leader offline swaps slot 0 with the first online member and clears the icons', () => {
    const p = party();
    p.apply(member([LEAD, WEBBY, THIRD]));
    p.apply({ type: 'setPartyMemberParam', playerId: THIRD, param: 0, value: 1 });
    expect(p.members.map((m) => m.removed)).toEqual([false, false, true]);
    const swapped = p.apply({ type: 'setPartyMemberParam', playerId: LEAD, param: 0, value: 1 });
    expect(p.members.map((m) => [m.playerId, m.removed])).toEqual([[WEBBY, false], [LEAD, true], [THIRD, true]]);
    expect(kinds(swapped)).toEqual(expect.arrayContaining(['iconsCleared', 'changed']));
    expect(lines(swapped)).toEqual([]);
    // back online
    p.apply({ type: 'setPartyMemberParam', playerId: LEAD, param: 0, value: 0 });
    expect(p.members[1]!.removed).toBe(false);
  });

  it('the leader offline with nobody else online ends the party (InitParty)', () => {
    const p = party();
    p.apply(member([LEAD, WEBBY]));
    p.apply({ type: 'setPartyMemberParam', playerId: WEBBY, param: 0, value: 1 });
    p.apply({ type: 'setPartyMemberParam', playerId: LEAD, param: 0, value: 1 });
    expect(p.size()).toBe(0);
  });

  it('ADDPARTYCHANGELEADER swaps slot 0 with the new leader', () => {
    const p = party();
    p.apply(member([LEAD, WEBBY, THIRD]));
    const events = p.apply({ type: 'partyChangeLeader', leaderId: THIRD });
    expect(p.members.map((m) => m.playerId)).toEqual([THIRD, WEBBY, LEAD]);
    expect(kinds(events)).toEqual(expect.arrayContaining(['iconsCleared', 'changed']));
  });

  it('PARTYMAPINFO stores the position of a member out of view only', () => {
    const p = party([THIRD]);
    p.apply(member([LEAD, WEBBY, THIRD]));
    p.apply({ type: 'partyMapInfo', index: 0, pos: [6000, 100, 4000] });
    p.apply({ type: 'partyMapInfo', index: 2, pos: [1, 2, 3] });
    expect(p.members.map((m) => m.pos)).toEqual([[6000, 100, 4000], [0, 0, 0], [0, 0, 0]]);
  });

  it('out-of-range and unknown members change nothing', () => {
    const p = party();
    const sixteen = Array.from({ length: 16 }, (_, i) => 71000 + i);
    p.apply(member(sixteen));
    expect(p.size()).toBe(15);
    p.apply(member([LEAD, WEBBY]));
    p.apply({ type: 'partyMapInfo', index: 20, pos: [1, 1, 1] });
    p.apply({ type: 'partyMapInfo', index: -1, pos: [1, 1, 1] });
    expect(p.apply({ type: 'partyChangeLeader', leaderId: 99999 })).toEqual([]);
    expect(p.apply({ type: 'setPartyMemberParam', playerId: 99999, param: 0, value: 1 })).toEqual([]);
    expect(p.members.map((m) => [m.playerId, m.removed, m.pos])).toEqual([[LEAD, false, [0, 0, 0]], [WEBBY, false, [0, 0, 0]]]);
  });
});

describe('PartyState: the party\'s level, kind, name and modes ([R §1.1], [R §8.4])', () => {
  it('PARTYEXP stores exp and points; a higher level prints "Party level increased." or, at 10, "...to 10."', () => {
    const p = party();
    p.apply(member([LEAD, WEBBY], 'Lead', 'Webby', WEBBY, { level: 3 }));
    expect(lines(p.apply({ type: 'partyExp', exp: 120, level: 3, point: 15 }))).toEqual([]);
    expect([p.exp, p.point]).toEqual([120, 15]);
    expect(lines(p.apply({ type: 'partyExp', exp: 0, level: 4, point: 30 }))).toEqual([['TID_GAME_PARTYLUP', [], null]]);
    expect(lines(p.apply({ type: 'partyExp', exp: 0, level: 10, point: 120 }))).toEqual([['TID_GAME_TROUPEUP', [], null]]);
    expect(p.level).toBe(10);
  });

  it('PARTYCHANGETROUP makes it advanced with music 25; PARTYCHANGENAME stores a name, and an empty one gives the leader the name box', () => {
    const p = party();
    p.apply(member([WEBBY, LEAD], 'Webby', 'Lead', LEAD, { level: 10 }));
    const troup = p.apply({ type: 'partyChangeTroup', name: '' });
    expect([p.kind, lines(troup)]).toEqual([1, [['TID_GAME_PARTYCHANGE', [], null]]]);
    expect(troup).toContainEqual({ kind: 'music', id: 25 });
    expect(p.apply({ type: 'partyChangeName', name: '' })).toEqual([{ kind: 'nameBox' }]);
    expect(p.apply({ type: 'partyChangeName', name: 'Advance Party' })).toEqual([{ kind: 'nameBox' }]);
    expect(lines(p.apply({ type: 'partyChangeName', name: 'Webbies' }))).toEqual([['TID_GAME_PARTY', ['Webbies'], null]]);
    expect([p.name, p.savedName]).toEqual(['Webbies', 'Webbies']);
    // a member is given no box
    const m = party();
    m.apply(member([LEAD, WEBBY]));
    expect(m.apply({ type: 'partyChangeName', name: '' })).toEqual([]);
    m.apply({ type: 'myPartyName', name: 'Saved' });
    expect(m.savedName).toBe('Saved');
  });

  it('SETPARTYMODE on gives modeOn with its skill and the "has been used" line; off the "about to end" line', () => {
    const p = party();
    p.apply(member([LEAD, WEBBY]));
    const on = p.apply({ type: 'setPartyMode', mode: 0, skillTime: 20000, on: true, point: 14 });
    expect(on).toEqual([
      { kind: 'modeOn', mode: 0, skill: 5, skillTime: 20000 },
      { kind: 'line', tid: 'TID_GAME_TROUPESKILLUSE', args: ['Linked Attack'], color: null },
    ]);
    expect([p.modeOn(0), p.point]).toEqual([true, 14]);
    expect(p.apply({ type: 'setPartyMode', mode: 3, skillTime: 0, on: false, point: null })).toEqual([
      { kind: 'modeOff', mode: 3, skill: 8 },
      { kind: 'line', tid: 'TID_GAME_TROUPESKILLSTOP', args: ['Gift Box'], color: null },
    ]);
    // mode 4, the cash state: no skill, no line
    expect(p.apply({ type: 'setPartyMode', mode: 4, skillTime: 0, on: true, point: 14 })).toEqual([]);
    expect(p.modeOn(4)).toBe(true);
    expect(p.apply({ type: 'setPartyMode', mode: 9, skillTime: 0, on: true, point: 1 })).toEqual([]);
  });

  it('the item and EXP modes are stored', () => {
    const p = party();
    p.apply({ type: 'partyItemMode', mode: 3 });
    p.apply({ type: 'partyExpMode', mode: 1 });
    expect([p.itemMode, p.expMode]).toEqual([3, 1]);
  });
});

describe('PartyState: errors, invites and refusals ([R §1.3], [R §5])', () => {
  it('ERRORPARTY gives each code\'s line or box; FULLPARTY by the party level', () => {
    const p = party();
    const err = (code: number, skill: number | null = null) => p.apply({ type: 'errorParty', code, skill });
    expect(err(200)).toEqual([{ kind: 'line', tid: 'TID_GAME_PARTYNOINVATE', args: [], color: null }]);
    expect(err(201)).toEqual([{ kind: 'line', tid: 'TID_GAME_FULLPARTY1', args: [], color: OLIVE }]);
    p.apply(member([WEBBY, LEAD], 'Webby', 'Lead', LEAD, { level: 7 }));
    expect(err(201)).toEqual([{ kind: 'line', tid: 'TID_GAME_FULLPARTY2', args: [], color: OLIVE }]);
    p.apply({ type: 'partyExp', exp: 0, level: 10, point: 0 });
    expect(err(201)).toEqual([{ kind: 'line', tid: 'TID_GAME_FULLPARTY3', args: [], color: OLIVE }]);
    expect(err(202)).toEqual([{ kind: 'line', tid: 'TID_GAME_NOPARTY', args: [], color: null }]);
    expect(err(203)).toEqual([{ kind: 'line', tid: 'TID_GAME_DIFFRENTPARTY', args: [], color: null }]);
    expect(err(204)).toEqual([{ kind: 'nameBox' }, { kind: 'box', tid: 'TID_DIAG_0033' }]);
    expect(err(205)).toEqual([{ kind: 'box', tid: 'TID_DIAG_0046' }]);
    expect(err(206)).toEqual([{ kind: 'box', tid: 'TID_DIAG_0019' }]);
    expect(err(207, 2)).toEqual([{ kind: 'line', tid: 'TID_GAME_NOTTARGET', args: [], color: null }]);
    expect(err(208)).toEqual([{ kind: 'line', tid: 'TID_GAME_PARTYNOTEXMEMBER', args: [], color: null }]);
    expect(err(209)).toEqual([{ kind: 'line', tid: 'TID_GAME_PARTY_ALREADYMASTER', args: [], color: null }]);
    expect(err(999)).toEqual([]);
  });

  it('PARTYREQEST is handed on as invited', () => {
    const request: MessageOf<'partyRequest'> = {
      type: 'partyRequest', leader: { id: LEAD, level: 20, job: 1, sex: 0 }, member: { id: WEBBY, level: 15, job: 4, sex: 1 },
      leaderName: 'Lead', troup: 0,
    };
    expect(party().apply(request)).toEqual([{ kind: 'invited', request }]);
  });

  it('PARTYREQESTCANCEL\'s five modes, the name from the invitee in view, or no line out of view', () => {
    const p = party([LEAD], { [LEAD]: 'Lead' });
    const cancel = (mode: number, memberId = LEAD) => lines(p.apply({ type: 'partyRequestCancel', leaderId: WEBBY, memberId, mode }));
    expect(cancel(0)).toEqual([['TID_GAME_PARTYFAILINVATE', ['Lead'], OLIVE]]);
    expect(cancel(1)).toEqual([['TID_GAME_PARTYOTHER', ['Lead'], OLIVE]]);
    p.apply(member([WEBBY, LEAD], 'Webby', 'Lead', LEAD));
    expect(cancel(1)).toEqual([['TID_GAME_PARTYEXISTCHR', ['Lead'], OLIVE]]);
    expect(cancel(2)).toEqual([['TID_GAME_PARTYFAILENTER', [], OLIVE]]);
    expect(cancel(3)).toEqual([['TID_GAME_PARTYDENY', ['Lead'], OLIVE]]);
    expect(cancel(4)).toEqual([['TID_GAME_PARTYINVATEOTHERSVR', [], OLIVE]]);
    // Neuz formats nothing for an invitee out of view (prj.GetUserByID fails): an empty line, which the browser leaves out
    expect(cancel(0, THIRD)).toEqual([]);
  });

  it('the core\'s BLOCK 7 says the invitee already has an invite', () => {
    expect(party().apply({ type: 'block', gu: 7, name: 'Lead' })).toEqual([{ kind: 'line', tid: 'TID_GAME_YETPARTY', args: [], color: null }]);
    expect(party().apply({ type: 'block', gu: 1, name: 'Lead' })).toEqual([]);
  });

  it('reset empties everything, the modes and the saved name too', () => {
    const p = party();
    p.apply(member([LEAD, WEBBY], 'Lead', 'Webby', WEBBY, { modeTime: [1, 0, 0, 0, 0] }));
    p.apply({ type: 'myPartyName', name: 'Saved' });
    p.reset();
    expect([p.size(), p.modeOn(0), p.savedName]).toEqual([0, false, '']);
  });
});

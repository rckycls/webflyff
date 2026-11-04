// The party's rules (Piece 7 M4): the EXP the party needs and its text, the member rows' colours, the cut names, the
// job marks and the FULLPARTY text by party level ([R §7.2], [R §8.3], [R §1.3]).

import { describe, expect, it } from 'vitest';
import {
  PARTY_MODE_SKILL, cutName, fullPartyTid, levelMark, memberBoxColor, memberTextColor, partyExpNeed, partyExpText,
} from '../src/world/party/partyRules';
import type { WebPartySkill } from '@flyffweb/formats';
import { handOverCheck, leaveTarget, modeChoice, partySkillCheck, partyToggle, troupNameCheck } from '../src/world/party/partyRules';
import { PartyState } from '../src/world/party/partyState';

/** `expParty` as shipped (Resource/expTable.inc:438-454). */
const TABLE = [0, 200, 200, 250, 300, 350, 400, 450, 500, 500].map((exp) => ({ exp, point: exp === 0 ? 0 : 15 }));

describe('the party rules', () => {
  it('the EXP needed: the table below 10, ((50 + L) * L / 13) * 10 from 10', () => {
    expect([1, 3, 9, 10, 11, 20, 40].map((level) => partyExpNeed(level, TABLE))).toEqual([200, 250, 500, 460, 510, 1070, 2760]);
  });

  it('the EXP text: "%.2f %%" of the EXP over the need', () => {
    expect(partyExpText(120, 3, TABLE)).toBe('48.00 %');
    expect(partyExpText(46, 10, TABLE)).toBe('10.00 %');
    expect(partyExpText(1, 3, TABLE)).toBe('0.40 %');
  });

  it('the box colours: blue, red at 0 HP, yellow below 10 %, grey out of view, black offline', () => {
    const box = (inView: boolean, removed: boolean, hp: number, maxHp: number) => memberBoxColor({ inView, removed, hp, maxHp });
    expect([
      box(true, false, 100, 100), box(true, false, 0, 100), box(true, false, 9, 100), box(true, false, 10, 100),
      box(true, false, 5, 0), box(false, false, 100, 100), box(false, true, 100, 100),
    ]).toEqual([0xff0000ff, 0xffff0000, 0xffffff00, 0xff0000ff, 0xff0000ff, 0xff878787, 0xff000000]);
    expect([memberTextColor(true), memberTextColor(false)]).toEqual([0xff1fb72d, 0xff000000]);
  });

  it('names are cut to 8 bytes plus "..."', () => {
    expect([cutName('Webbyabcdef', 8), cutName('Webbyabc', 8), cutName('Webby', 8)]).toEqual(['Webbyabc...', 'Webbyabc', 'Webby']);
  });

  it('a master job is marked -M, a hero -H', () => {
    expect([0, 15, 16, 23, 24, 31].map(levelMark)).toEqual(['', '', '-M', '-M', '-H', '-H']);
  });

  it('FULLPARTY by the party level: 1 to 5, 6 to 9, else the third', () => {
    expect([0, 1, 5, 6, 9, 10].map(fullPartyTid)).toEqual([
      'TID_GAME_FULLPARTY3', 'TID_GAME_FULLPARTY1', 'TID_GAME_FULLPARTY1', 'TID_GAME_FULLPARTY2', 'TID_GAME_FULLPARTY2',
      'TID_GAME_FULLPARTY3',
    ]);
    expect(PARTY_MODE_SKILL).toEqual([5, 6, 7, 8]);
  });
});

describe('the party window\'s rules (Piece 7 M4, [R §6])', () => {
  const OWN = 70001;
  function party(members: Array<[number, boolean]>, kind = 0, modes = { expMode: 0, itemMode: 0 }): PartyState {
    const state = new PartyState({ ownPlayerId: () => OWN, inView: () => true, nameInView: () => null, skillName: () => '', defaultName: () => 'Advance Party' });
    state.apply({
      type: 'partyMember', playerId: OWN, leaderName: '', memberName: '',
      party: {
        partyId: 1, kind, level: 10, exp: 0, point: 0, ...modes, duelPartyId: 0, modeTime: [0, 0, 0, 0, 0], name: '',
        members: members.map(([playerId, removed]) => ({ playerId, removed })),
      },
    });
    return state;
  }
  const CATALOG = { invalidNames: ['shade', 'gm'], letters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789' };

  it('leave: the leader kicks the selected, a member always leaves', () => {
    const lead = party([[OWN, false], [2, false]]);
    expect([leaveTarget(lead, OWN, 2), leaveTarget(lead, OWN, OWN), leaveTarget(lead, OWN, null)]).toEqual([2, OWN, OWN]);
    const member = party([[2, false], [OWN, false], [3, false]]);
    expect([leaveTarget(member, OWN, 3), leaveTarget(member, OWN, null)]).toEqual([OWN, OWN]);
  });

  it('hand over: not the leader, offline and the own row each give their line', () => {
    const lead = party([[OWN, false], [2, false], [3, true]]);
    expect(handOverCheck(lead, OWN, 2)).toEqual({ send: 2 });
    expect(handOverCheck(lead, OWN, null)).toEqual({ line: 'TID_GAME_PARTY_ISNOTMASTER' });
    expect(handOverCheck(lead, OWN, 3)).toEqual({ line: 'TID_GAME_MASTER_AWAY' });
    expect(handOverCheck(lead, OWN, OWN)).toEqual({ line: 'TID_GAME_PARTY_ALREADYMASTER' });
    expect(handOverCheck(party([[2, false], [OWN, false]]), OWN, 2)).toEqual({ line: 'TID_GAME_PARTY_ISNOTMASTER' });
    expect(handOverCheck(party([]), OWN, null)).toBeNull();
  });

  it('the name rules in order', () => {
    expect([
      troupNameCheck('  Ab1 ', CATALOG), troupNameCheck('', CATALOG), troupNameCheck('Seventeenletters1', CATALOG),
      troupNameCheck('1abc', CATALOG), troupNameCheck('ab cd', CATALOG), troupNameCheck('ab_cd', CATALOG),
      troupNameCheck('Shadehunter', CATALOG), troupNameCheck('Advance Party', CATALOG),
    ]).toEqual([
      { box: 'TID_DIAG_RULE_0' }, { box: 'TID_DIAG_RULE_0' }, { box: 'TID_DIAG_RULE_0' },
      { box: 'TID_DIAG_0012' }, { box: 'TID_DIAG_0013' }, { box: 'TID_DIAG_0013' },
      // a banned word inside the name (IsInvalidName: a lower-case substring), then the default (its space comes first)
      { box: 'TID_DIAG_0020' }, { box: 'TID_DIAG_0013' },
    ]);
    expect(troupNameCheck('  Webbies ', CATALOG)).toEqual({ send: 'Webbies' });
    // a letter Letter_ENG.inc leaves out
    expect(troupNameCheck('Webbies', { ...CATALOG, letters: 'Webi' })).toEqual({ box: 'TID_DIAG_0020' });
  });

  it('a radio sends once, only when it differs; EXP only in an advanced party; a member gets TID_DIAG_0008', () => {
    const normal = party([[OWN, false], [2, false]], 0, { expMode: 0, itemMode: 1 });
    expect([modeChoice(normal, OWN, 'item', 1), modeChoice(normal, OWN, 'item', 3), modeChoice(normal, OWN, 'exp', 1)])
      .toEqual([null, { send: true }, null]);
    const advanced = party([[OWN, false], [2, false]], 1, { expMode: 0, itemMode: 0 });
    expect([modeChoice(advanced, OWN, 'exp', 1), modeChoice(advanced, OWN, 'exp', 0)]).toEqual([{ send: true }, null]);
    const member = party([[2, false], [OWN, false]], 1);
    expect([modeChoice(member, OWN, 'item', 2), modeChoice(member, OWN, 'exp', 0)])
      .toEqual([{ box: 'TID_DIAG_0008' }, { box: 'TID_DIAG_0008' }]);
  });
});

describe('the P key (Piece 7 M4, [R §7.1])', () => {
  it('P opens the window (and the quick view with 2 members), closes both, or the one open', () => {
    expect(partyToggle(false, false, 2)).toEqual({ window: true, quick: true });
    expect(partyToggle(false, false, 1)).toEqual({ window: true, quick: false });
    expect(partyToggle(true, true, 3)).toEqual({ window: false, quick: false });
    expect(partyToggle(true, false, 3)).toEqual({ window: false, quick: false });
    // with only the quick view open, P closes it and opens nothing
    expect(partyToggle(false, true, 3)).toEqual({ window: false, quick: false });
  });
});

describe('the party skills (Piece 7 M4, [R §8.2])', () => {
  const OWN = 70001;
  function party(members: number[], kind: number, level: number): PartyState {
    const state = new PartyState({ ownPlayerId: () => OWN, inView: () => true, nameInView: () => null, skillName: () => '', defaultName: () => 'Advance Party' });
    state.apply({
      type: 'partyMember', playerId: OWN, leaderName: '', memberName: '',
      party: {
        partyId: 1, kind, level, exp: 0, point: 0, expMode: 0, itemMode: 0, duelPartyId: 0, modeTime: [0, 0, 0, 0, 0], name: kind === 0 ? '' : 'Winners',
        members: members.map((playerId) => ({ playerId, removed: false })),
      },
    });
    return state;
  }
  const skill = (id: number, name: string, level: number): WebPartySkill => ({
    id, name, description: '', icon: null, level, points: 0, skillTime: null, sfx: null, sfx2: null,
  });
  const LINKED = skill(5, 'Linked Attack', 20);
  const CALL = skill(1, 'Call', 10);

  it('party skill use: not advanced or under 2 nothing; not the leader TID_DIAG_0047; the level TID_DIAG_0019; a mode still on TID_GAME_NOT_TIME (none for Call, Blitz, Retreat); else send', () => {
    expect(partySkillCheck(party([OWN, 2], 0, 30), OWN, LINKED, false)).toBeNull();
    expect(partySkillCheck(party([OWN], 1, 30), OWN, LINKED, false)).toBeNull();
    expect(partySkillCheck(party([2, OWN], 1, 30), OWN, LINKED, false)).toEqual({ box: 'TID_DIAG_0047' });
    expect(partySkillCheck(party([OWN, 2], 1, 19), OWN, LINKED, false)).toEqual({ box: 'TID_DIAG_0019' });
    expect(partySkillCheck(party([OWN, 2], 1, 20), OWN, LINKED, true)).toEqual({ line: 'TID_GAME_NOT_TIME', args: ['Linked Attack'] });
    expect(partySkillCheck(party([OWN, 2], 1, 20), OWN, LINKED, false)).toEqual({ send: true });
    expect(partySkillCheck(party([OWN, 2], 1, 10), OWN, CALL, true)).toEqual({ send: true });
  });
});

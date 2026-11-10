// The player's menu and the invite's checks (Piece 7 M4, [R §5.1], [R §5.2]).

import { describe, expect, it } from 'vitest';
import type { MessageOf } from '@flyffweb/protocol';
import type { Texts } from '../src/world/gameData';
import { menuInReach, playerMenuEntries } from '../src/world/party/playerMenu';
import { inviteCheck } from '../src/world/party/partyRules';
import { PartyState } from '../src/world/party/partyState';

const WEBBY = 70001;
const TEXTS: Texts = new Map([
  ['TID_MMI_TRADE', { id: 'TID_MMI_TRADE', text: 'Trade', color: 0, textId: 7002 }],
  ['TID_MMI_INVITE_PARTY', { id: 'TID_MMI_INVITE_PARTY', text: 'Invite to join party', color: 0, textId: 7006 }],
]);

function partyOf(members: number[]): PartyState {
  const party = new PartyState({
    ownPlayerId: () => WEBBY, inView: () => true, nameInView: () => null, skillName: () => '', defaultName: () => 'Advance Party',
  });
  if (members.length > 0) {
    const message: MessageOf<'partyMember'> = {
      type: 'partyMember', playerId: members.at(-1)!, leaderName: '', memberName: '',
      party: {
        partyId: 1, kind: 0, level: 1, exp: 0, point: 0, expMode: 0, itemMode: 0, duelPartyId: 0, modeTime: [0, 0, 0, 0, 0],
        name: '', members: members.map((playerId) => ({ playerId, removed: false })),
      },
    };
    party.apply(message);
  }
  return party;
}

describe('the player\'s menu ([R §5.1])', () => {
  it('the entries in Neuz\'s order, Invite and (2026-11-10) Add to my list and Trade enabled', () => {
    expect(playerMenuEntries(TEXTS)).toEqual([
      { id: 2, label: 'Trade', enabled: true },
      { id: 5, label: 'Add to my list', enabled: true },
      { id: 6, label: 'Invite to join party', enabled: true },
      { id: 12, label: 'Follow', enabled: false },
      { id: 24, label: 'View equipment', enabled: false },
      { id: 31, label: 'Cheer', enabled: false },
      { id: 151, label: 'Request Mentor-Pupil Bond', enabled: false },
    ]);
  });

  it('2026-11-10: "Invite to join guild" after the party\'s invite, only for a viewer whose rank may invite (WndWorld.cpp:6556-6565)', () => {
    const entries = playerMenuEntries(TEXTS, false, true);
    expect(entries.map((entry) => entry.id)).toEqual([2, 5, 6, 7, 12, 24, 31, 151]);
    expect(entries[3]).toEqual({ id: 7, label: 'Invite to join guild', enabled: true });
    expect(playerMenuEntries(TEXTS, true, true).map((entry) => entry.id)).toEqual([24]);
  });

  it('the menu is in reach under 20 m', () => {
    expect(menuInReach([100, 0, 100], [119, 0, 100])).toBe(true);
    expect(menuInReach([100, 0, 100], [120, 0, 100])).toBe(false);
    expect(menuInReach([100, 0, 100], [112, 0, 116])).toBe(false); // 20 m on the diagonal
  });

  it('the invite checks: not the leader gives the box, 8 members the line, else send', () => {
    expect(inviteCheck(partyOf([]), WEBBY)).toEqual({ send: true });
    expect(inviteCheck(partyOf([WEBBY, 2, 3, 4, 5, 6, 7]), WEBBY)).toEqual({ send: true });
    expect(inviteCheck(partyOf([WEBBY, 2, 3, 4, 5, 6, 7, 8]), WEBBY)).toEqual({ line: 'TID_GAME_FULLPARTY3' });
    expect(inviteCheck(partyOf([2, WEBBY]), WEBBY)).toEqual({ box: 'TID_DIAG_0007' });
  });
});

// The party on the Navigator and the world map (Piece 7 M4, [R §9.4], [R §9.5]).

import { describe, expect, it, vi } from 'vitest';
import type { MessageOf } from '@flyffweb/protocol';
import { navigatorKind, partyMapMarks } from '../src/world/party/partyMarks';
import { PartyState } from '../src/world/party/partyState';
import { PlayerDataCenter } from '../src/world/party/playerData';
import { addedNpc, addedPlayer, gameDataOf, moverFrom, webMoverOf } from './helpers/movers';

const WEBBY = 70001;
const LEAD = 70002;
const FAR = 70003;
const GONE = 70004;

function party(members: Array<[number, boolean]>, inView: (id: number) => boolean = () => false): PartyState {
  const state = new PartyState({ ownPlayerId: () => WEBBY, inView, nameInView: () => null, skillName: () => '', defaultName: () => '' });
  const message: MessageOf<'partyMember'> = {
    type: 'partyMember', playerId: WEBBY, leaderName: '', memberName: '',
    party: {
      partyId: 1, kind: 0, level: 1, exp: 0, point: 0, expMode: 0, itemMode: 0, duelPartyId: 0, modeTime: [0, 0, 0, 0, 0], name: '',
      members: members.map(([playerId, removed]) => ({ playerId, removed })),
    },
  };
  state.apply(message);
  return state;
}

describe('navigatorKind (CWndNavigator::OnEraseBkgnd, WndField.cpp:9222-9600)', () => {
  it('a member in view is a party dot, another player a player dot', () => {
    const data = gameDataOf({ movers: new Map([[40, webMoverOf({ index: 40, name: 'Clerk' })]]) });
    const state = party([[LEAD, false], [WEBBY, false]]);
    expect(navigatorKind(moverFrom(addedPlayer(1, { playerId: LEAD }), data), state)).toBe('party');
    expect(navigatorKind(moverFrom(addedPlayer(2, { playerId: 999 }), data), state)).toBe('player');
    expect(navigatorKind(moverFrom(addedNpc(3, 40, { characterKey: 'MaFl_Clerk' }), data), state)).toBe('npc');
    expect(navigatorKind(moverFrom(addedNpc(4, 40, {}), data), state)).toBe('monster');
    // out of a party, as before
    expect(navigatorKind(moverFrom(addedPlayer(1, { playerId: LEAD }), data), party([]))).toBe('player');
  });
});

describe('partyMapMarks (CWorldMap::RenderWorldMap, WorldMap.cpp:786-823)', () => {
  it('the map marks: in view from the mover, far from PARTYMAPINFO, none offline, none for oneself', () => {
    const state = party([[LEAD, false], [WEBBY, false], [FAR, false], [GONE, true]], (id) => id === LEAD);
    state.apply({ type: 'partyMapInfo', index: 2, pos: [500, 0, 600] });
    // a PARTYMAPINFO for a member in view does not move its mark
    state.apply({ type: 'partyMapInfo', index: 0, pos: [1, 1, 1] });
    const query = vi.fn();
    const names = new PlayerDataCenter(query);
    const record = { job: 1, level: 20, sex: 0, version: 1, login: 1 };
    names.apply({ type: 'playerData', playerId: LEAD, name: 'Lead', data: record });
    names.apply({ type: 'playerData', playerId: FAR, name: 'Faraway', data: record });
    const inViewPos = (id: number) => (id === LEAD ? [10, 0, 20] as [number, number, number] : null);
    expect(partyMapMarks(state, WEBBY, inViewPos, names)).toEqual([
      { pos: [10, 0, 20], name: 'Lead' },
      { pos: [500, 0, 600], name: 'Faraway' },
    ]);
    expect(query).not.toHaveBeenCalled();
    expect(partyMapMarks(party([]), WEBBY, inViewPos, names)).toEqual([]);
  });
});

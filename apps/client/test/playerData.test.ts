// The player data (Piece 7 M4, [R §4]): `CPlayerDataCenter`'s client part, which names and levels a member out of view.

import { describe, expect, it } from 'vitest';
import { PlayerDataCenter } from '../src/world/party/playerData';

const LEAD = 70002;
const record = (level: number, version: number, login = 1) => ({ job: 1, level, sex: 1, version, login });

describe('PlayerDataCenter', () => {
  it('a player is queried once however often it is read; an empty entry reads level 1 and no name', () => {
    const queries: number[] = [];
    const center = new PlayerDataCenter((id) => queries.push(id));
    for (let i = 0; i < 100; i++) center.get(LEAD);
    expect(queries).toEqual([LEAD]);
    expect(center.get(LEAD)).toEqual({ name: '', job: 0, level: 1, sex: 0, version: 0, login: 0 });
    center.get(70003);
    expect(queries).toEqual([LEAD, 70003]);
  });

  it('an answer or an update replaces the entry only when its version is newer; LOGOUT sets login 0', () => {
    const queries: number[] = [];
    const center = new PlayerDataCenter((id) => queries.push(id));
    center.get(LEAD);
    center.apply({ type: 'playerData', playerId: LEAD, name: 'Lead', data: record(23, 5) });
    expect(center.get(LEAD)).toEqual({ name: 'Lead', job: 1, level: 23, sex: 1, version: 5, login: 1 });
    // not newer: kept
    center.apply({ type: 'playerData', playerId: LEAD, name: 'Other', data: record(30, 5) });
    center.apply({ type: 'updatePlayerData', playerId: LEAD, data: record(30, 4) });
    expect(center.get(LEAD)).toMatchObject({ name: 'Lead', level: 23 });
    // the core's update copies the record, not the name
    center.apply({ type: 'updatePlayerData', playerId: LEAD, data: record(30, 6) });
    expect(center.get(LEAD)).toMatchObject({ name: 'Lead', level: 30, version: 6 });
    center.apply({ type: 'playerLogout', playerId: LEAD });
    expect(center.get(LEAD).login).toBe(0);
    // an answer for a player never asked about is kept without a query (GetPlayerData( id, FALSE ))
    center.apply({ type: 'playerData', playerId: 70009, name: 'Far', data: record(5, 1) });
    expect([center.get(70009).name, queries]).toEqual(['Far', [LEAD]]);
  });

  it('an entry whose level is 0 is queried again once', () => {
    const queries: number[] = [];
    const center = new PlayerDataCenter((id) => queries.push(id));
    center.apply({ type: 'playerData', playerId: LEAD, name: 'Lead', data: record(0, 1) });
    center.get(LEAD);
    center.get(LEAD);
    expect([queries, center.get(LEAD).level]).toEqual([[LEAD], 1]);
  });

  it('reset forgets every entry', () => {
    const queries: number[] = [];
    const center = new PlayerDataCenter((id) => queries.push(id));
    center.get(LEAD);
    center.reset();
    center.get(LEAD);
    expect(queries).toEqual([LEAD, LEAD]);
  });
});

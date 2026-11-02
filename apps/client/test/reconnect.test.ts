import { describe, expect, it } from 'vitest';
import type { CharacterSummary, ServerEntry } from '@flyffweb/protocol';
import { errorText } from '../src/lobby/errorText';
import {
  EXPIRED_TEXT, KEPT_LOGIN_MS, NO_CHANNEL_TEXT, NO_CHARACTER_TEXT, RECONNECTING_TEXT, Reconnect, STILL_IN_GAME_TEXT,
} from '../src/lobby/reconnect';
import type { BoxState, KeptLogin } from '../src/lobby/reconnect';
import { fakeClock } from './helpers/fakeChannel';

const KEPT: KeptLogin = { account: 'webtester', passwordHash: '0123456789abcdef0123456789abcdef', serverId: 1, channelId: 2, playerId: 500 };
const server = (over: Partial<ServerEntry>): ServerEntry => ({
  parent: -1, id: 1, name: 'FlyFF', address: '10.0.0.1', adult: 0, playerCount: 0, enabled: 1, maxPlayers: 100, ...over,
});
const SERVERS = [server({}), server({ parent: 1, id: 1, name: 'Channel 1' }), server({ parent: 1, id: 2, name: 'Channel 2' }),
  server({ parent: 9, id: 2, name: 'Another server\'s Channel 2' })];
const character = (playerId: number, slot: number): CharacterSummary => ({ playerId, slot, name: `c${playerId}` }) as CharacterSummary;

function setup() {
  const clock = fakeClock(0);
  const calls: string[] = [];
  const boxes: BoxState[] = [];
  const flow = {
    relogin: async (account: string, hash: string) => { calls.push(`relogin ${account} ${hash === KEPT.passwordHash}`); },
    selectChannel: async (channel: ServerEntry) => { calls.push(`select ${channel.parent}/${channel.id}`); },
    dispose: () => { calls.push('dispose'); },
  };
  const out = {
    box: (state: BoxState) => { boxes.push(state); },
    enter: (c: CharacterSummary) => { calls.push(`enter ${c.playerId}`); },
    toLogin: (message?: string) => { calls.push(`login ${message ?? ''}`); },
    toServers: (message: string, servers: ServerEntry[]) => { calls.push(`servers ${message} ${servers.length}`); },
    toCharacters: (message: string, characters: CharacterSummary[]) => { calls.push(`characters ${message} ${characters.length}`); },
  };
  const r = new Reconnect(flow, KEPT, clock, out, 'The connection to the game was lost.');
  return { r, calls, boxes, clock };
}

describe('Reconnect (Piece 6 M3, a browser adaptation: Neuz has none)', () => {
  it('opens on the drop\'s reason, with Reconnect', () => {
    const { boxes } = setup();
    expect(boxes).toEqual([{ text: 'The connection to the game was lost.', canReconnect: true, busy: false }]);
  });

  it('logs in again, picks the same channel of the same server and enters the same character, and nothing else', () => {
    const { r, calls, boxes } = setup();
    r.tap();
    expect(boxes.at(-1)).toEqual({ text: RECONNECTING_TEXT, canReconnect: true, busy: true });
    expect(r.handle({ type: 'serverList', servers: SERVERS })).toBe(true);
    expect(r.handle({ type: 'characters', characters: [character(400, 0), character(500, 2)] })).toBe(true);
    expect(calls).toEqual(['relogin webtester true', 'select 1/2', 'enter 500']);
    expect(r.handle({ type: 'closed', message: 'late' })).toBe(false); // it is over: the lobby has the rest
  });

  it('runs one attempt at a time', () => {
    const { r, calls } = setup();
    r.tap();
    r.tap();
    expect(calls).toEqual(['relogin webtester true']);
  });

  it('takes no event before a tap', () => {
    const { r } = setup();
    expect(r.handle({ type: 'serverList', servers: SERVERS })).toBe(false);
  });

  it('goes to the login form with the server\'s message for a wrong password or a blocked account', () => {
    for (const code of [119, 120, 121, 134, 135]) {
      const { r, calls } = setup();
      r.tap();
      r.handle({ type: 'error', message: errorText(code) });
      expect(calls.at(-1)).toBe(`login ${errorText(code)}`);
    }
  });

  it('goes to the server list when the channel is missing, offline or full, and to the characters when the character is', () => {
    for (const servers of [SERVERS.slice(0, 2), [server({}), server({ parent: 1, id: 2, enabled: 0 })],
      [server({}), server({ parent: 1, id: 2, playerCount: 100 })]]) {
      const { r, calls } = setup();
      r.tap();
      r.handle({ type: 'serverList', servers });
      expect(calls.at(-1)).toBe(`servers ${NO_CHANNEL_TEXT} ${servers.length}`);
    }
    const { r, calls } = setup();
    r.tap();
    r.handle({ type: 'serverList', servers: SERVERS });
    r.handle({ type: 'characters', characters: [character(400, 0)] });
    expect(calls.at(-1)).toBe(`characters ${NO_CHARACTER_TEXT} 1`);
  });

  it('keeps the box for 103, closing the flow and kicking nothing, and a later tap tries again', () => {
    const { r, calls, boxes } = setup();
    r.tap();
    r.handle({ type: 'alreadyConnected' });
    expect(calls).toEqual(['relogin webtester true', 'dispose']);
    expect(boxes.at(-1)).toEqual({ text: STILL_IN_GAME_TEXT, canReconnect: true, busy: false });
    r.tap();
    expect(calls.at(-1)).toBe('relogin webtester true');
  });

  it('keeps the box with the reason for a closed connection or another error, ready for another tap', () => {
    const { r, calls, boxes } = setup();
    r.tap();
    r.handle({ type: 'closed', message: 'Cannot reach the game gateway.' });
    expect(boxes.at(-1)).toEqual({ text: 'Cannot reach the game gateway.', canReconnect: true, busy: false });
    expect(calls.at(-1)).toBe('dispose');
    r.tap();
    r.handle({ type: 'error', message: 'The server did not answer in time.' });
    expect(boxes.at(-1)!.text).toBe('The server did not answer in time.');
  });

  it('Back to login closes the attempt, forgets the login, and takes no later event', () => {
    const { r, calls, clock } = setup();
    r.tap();
    r.back();
    expect(calls).toEqual(['relogin webtester true', 'dispose', 'login ']);
    expect(r.handle({ type: 'serverList', servers: SERVERS })).toBe(false);
    expect(clock.pending()).toBe(0);
    r.tap();
    expect(calls).toHaveLength(3);
  });

  it('forgets the login after 5 minutes: the box then offers only Back to login', () => {
    const { r, calls, boxes, clock } = setup();
    clock.advance(KEPT_LOGIN_MS - 1);
    expect(boxes.at(-1)!.canReconnect).toBe(true);
    clock.advance(1);
    expect(boxes.at(-1)).toEqual({ text: EXPIRED_TEXT, canReconnect: false, busy: false });
    r.tap();
    expect(calls).toEqual([]);
  });

  it('lets an attempt running at 5:00 finish, and one that fails then cannot be tried again', () => {
    const { r, calls, boxes, clock } = setup();
    clock.advance(KEPT_LOGIN_MS - 10);
    r.tap();
    clock.advance(10);
    expect(boxes.at(-1)!.busy).toBe(true); // still running
    r.handle({ type: 'serverList', servers: SERVERS });
    expect(calls.at(-1)).toBe('select 1/2');
    r.handle({ type: 'closed', message: 'Disconnected from the server.' });
    expect(boxes.at(-1)).toEqual({ text: EXPIRED_TEXT, canReconnect: false, busy: false });
  });
});

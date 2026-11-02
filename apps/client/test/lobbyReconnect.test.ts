// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { CharacterSummary, ServerEntry } from '@flyffweb/protocol';
import { LobbyApp } from '../src/lobby/LobbyApp';
import type { LobbyEvent, LoginFlow, WorldEntry } from '../src/lobby/LoginFlow';
import { errorText } from '../src/lobby/errorText';
import { NO_CHANNEL_TEXT, RECONNECTING_TEXT } from '../src/lobby/reconnect';
import type { BoxState } from '../src/lobby/reconnect';
import type { DroppedWorld } from '../src/world/WorldScreen';
import { fakeClock } from './helpers/fakeChannel';

const server = (over: Partial<ServerEntry>): ServerEntry => ({
  parent: -1, id: 1, name: 'FlyFF', address: '10.0.0.1', adult: 0, playerCount: 0, enabled: 1, maxPlayers: 100, ...over,
});
const SERVERS = [server({}), server({ parent: 1, id: 2, name: 'Channel 2' })];
const WEBBY = { slot: 0, playerId: 500, name: 'Webby' } as CharacterSummary;

afterEach(() => document.body.replaceChildren());
// jsdom lays nothing out: the lobby's alert scrolls itself into view
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

function setup() {
  const root = document.createElement('div');
  document.body.append(root);
  const calls: string[] = [];
  const flow = {
    login: async () => { calls.push('login'); },
    relogin: async (account: string) => { calls.push(`relogin ${account}`); },
    selectChannel: async (c: ServerEntry) => { calls.push(`select ${c.parent}/${c.id}`); },
    dispose: () => { calls.push('dispose'); },
    handOver: (slot: number) => ({ character: { ...WEBBY, slot } }) as unknown as WorldEntry,
  } as unknown as LoginFlow;
  const entered: Array<(drop: DroppedWorld) => void> = [];
  const reconnected: boolean[] = [];
  const app = new LobbyApp(root, flow, (_entry, _done, onDrop, again) => {
    entered.push(onDrop);
    reconnected.push(again);
  }, () => {}, null, fakeClock(0));
  const event = (e: LobbyEvent) => app.handle(e);
  // in the world with Webby, as the lobby puts the player there
  event({ type: 'serverList', servers: SERVERS });
  event({ type: 'characters', characters: [WEBBY] });
  root.querySelector<HTMLButtonElement>('[aria-label="Enter Webby"]')!.click();
  const boxes: BoxState[] = [];
  let closed = 0;
  const drop: DroppedWorld = {
    message: 'The connection to the game was lost.',
    kept: { account: 'webtester', passwordHash: '0123456789abcdef0123456789abcdef', serverId: 1, channelId: 2, playerId: 500 },
    box: (state) => { boxes.push(state); },
    onReconnect: () => {},
    onBack: () => {},
    close: () => { closed++; },
  };
  return { root, calls, entered, reconnected, event, boxes, drop, closedCount: () => closed };
}

describe('LobbyApp: the one-tap reconnect (Piece 6 M3)', () => {
  it('reconnects to the same character: the frozen world closes and a new one is entered', () => {
    const s = setup();
    s.entered[0]!(s.drop);
    expect(s.boxes.at(-1)!.text).toBe('The connection to the game was lost.');
    s.drop.onReconnect();
    expect(s.boxes.at(-1)!.text).toBe(RECONNECTING_TEXT);
    s.event({ type: 'serverList', servers: SERVERS });
    expect(s.root.querySelector('[data-screen="servers"]')).toBeNull(); // no lobby screen behind the world
    s.event({ type: 'characters', characters: [WEBBY] });
    expect(s.closedCount()).toBe(1);
    expect(s.entered).toHaveLength(2);
    expect(s.calls.slice(-2)).toEqual(['relogin webtester', 'select 1/2']);
  });

  it('Back to login closes the frozen world and shows the login form, the account kept', () => {
    const s = setup();
    s.entered[0]!(s.drop);
    s.drop.onBack();
    expect(s.closedCount()).toBe(1);
    expect(s.calls.at(-1)).toBe('dispose');
    expect(s.root.querySelector('input[name="account"], #account, input[autocomplete="username"]')).not.toBeNull();
  });

  it('a wrong password goes to the login form with the server\'s message', () => {
    const s = setup();
    s.entered[0]!(s.drop);
    s.drop.onReconnect();
    s.event({ type: 'error', message: errorText(120) });
    expect(s.closedCount()).toBe(1);
    expect(s.root.textContent).toContain(errorText(120));
  });

  it('a channel gone from the fresh list goes to the server list with why', () => {
    const s = setup();
    s.entered[0]!(s.drop);
    s.drop.onReconnect();
    s.event({ type: 'serverList', servers: [server({})] });
    expect(s.closedCount()).toBe(1);
    expect(s.root.querySelector('[data-screen="servers"]')).not.toBeNull();
    expect(s.root.textContent).toContain(NO_CHANNEL_TEXT);
  });

  it('after the reconnect is over, the flow\'s events are the lobby\'s again', () => {
    const s = setup();
    s.entered[0]!(s.drop);
    s.drop.onBack();
    s.event({ type: 'serverList', servers: SERVERS });
    expect(s.root.querySelector('[data-screen="servers"]')).not.toBeNull();
  });
});

describe('LobbyApp: the kept login, after the final review', () => {
  it('takes the kept login from the dropped world, so only the reconnect holds it, for its 5 minutes', () => {
    const s = setup();
    s.entered[0]!(s.drop);
    expect(s.drop.kept).toBeUndefined();
    s.drop.onReconnect();
    expect(s.calls.at(-1)).toBe('relogin webtester'); // the reconnect has it
  });

  it('tells the world it opens for a reconnect so, as its endings are drops from the start: the box stays, the login kept', () => {
    const s = setup();
    s.entered[0]!(s.drop);
    s.drop.onReconnect();
    s.event({ type: 'serverList', servers: SERVERS });
    s.event({ type: 'characters', characters: [WEBBY] });
    expect(s.reconnected).toEqual([false, true]);
  });
});

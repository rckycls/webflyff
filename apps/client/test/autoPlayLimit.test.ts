// @vitest-environment jsdom
// custom (owner 2026-11-17): Auto Play's weekly hours in the game: the site session opened at the game's login, the
// server's count (world/autoplay/usageLimit.ts), and the lobby handing the login over once the game accepted it.
import { afterEach, describe, expect, it } from 'vitest';
import type { CharacterSummary, ServerEntry } from '@flyffweb/protocol';
import { AutoPlayLimit } from '../src/world/autoplay/usageLimit';
import type { UsageApi, UsageState } from '../src/world/autoplay/usageLimit';
import { LobbyApp } from '../src/lobby/LobbyApp';
import type { LobbyEvent, LoginFlow, WorldEntry } from '../src/lobby/LoginFlow';
import { fakeClock } from './helpers/fakeChannel';

afterEach(() => document.body.replaceChildren());
Element.prototype.scrollIntoView ??= function scrollIntoView() {};

function api(state: UsageState | null, loginOk = true) {
  const calls: string[] = [];
  const fake: UsageApi = {
    login: async (account, password) => { calls.push(`login ${account} ${password}`); return loginOk; },
    status: async () => { calls.push('status'); return state; },
    tick: async () => { calls.push('tick'); if (state !== null) state = { ...state, usedMin: state.usedMin + 1 }; return state; },
  };
  return { fake, calls };
}

describe('AutoPlayLimit (owner 2026-11-17)', () => {
  it('unknown before the sign-in (no limit applied); known after it', async () => {
    const { fake, calls } = api({ usedMin: 600, limitMin: 840, resetsAt: '2026-11-23T00:00:00.000Z' });
    const limit = new AutoPlayLimit(fake);
    expect(limit.leftMin()).toBeNull();
    await limit.signIn('webby', 'pw');
    expect(calls).toEqual(['login webby pw', 'status']);
    expect(limit.leftMin()).toBe(240);
    expect(limit.state).toEqual({ usedMin: 600, limitMin: 840, resetsAt: '2026-11-23T00:00:00.000Z' });
  });

  it('a tick takes the server\'s new count', async () => {
    const { fake } = api({ usedMin: 839, limitMin: 840, resetsAt: '2026-11-23T00:00:00.000Z' });
    const limit = new AutoPlayLimit(fake);
    await limit.signIn('webby', 'pw');
    await limit.tick(60_000);
    expect(limit.leftMin()).toBe(0);
  });

  it('no limit (VIP4), a failed sign-in, or the service off: leftMin null (Auto Play is not held back)', async () => {
    const vip4 = new AutoPlayLimit(api({ usedMin: 9000, limitMin: null, resetsAt: '2026-11-23T00:00:00.000Z' }).fake);
    await vip4.signIn('webby', 'pw');
    expect(vip4.leftMin()).toBeNull();
    expect(vip4.state?.limitMin).toBeNull();
    const failed = new AutoPlayLimit(api({ usedMin: 0, limitMin: 840, resetsAt: '' }, false).fake);
    await failed.signIn('webby', 'pw');
    expect(failed.leftMin()).toBeNull();
    const off = new AutoPlayLimit(api(null).fake);
    await off.signIn('webby', 'pw');
    expect(off.leftMin()).toBeNull();
  });

  it('never below 0', async () => {
    const limit = new AutoPlayLimit(api({ usedMin: 900, limitMin: 840, resetsAt: '' }).fake);
    await limit.signIn('webby', 'pw');
    expect(limit.leftMin()).toBe(0);
  });
});

describe('LobbyApp: the login handed over once the game accepted it', () => {
  const SERVERS: ServerEntry[] = [{ parent: -1, id: 1, name: 'FlyFF', address: '10.0.0.1', adult: 0, playerCount: 0, enabled: 1, maxPlayers: 100 }];

  it('after the server list (CERTIFY accepted), once, with the typed account and password; not before', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const flow = {
      login: async () => {}, relogin: async () => {}, selectChannel: async () => {}, dispose: () => {},
      handOver: () => ({ character: { slot: 0, playerId: 500, name: 'Webby' } as CharacterSummary }) as unknown as WorldEntry,
    } as unknown as LoginFlow;
    const handed: string[] = [];
    const app = new LobbyApp(root, flow, () => {}, () => {}, null, fakeClock(0), '', (account, password) => handed.push(`${account} ${password}`));
    const form = root.querySelector('form')!;
    form.querySelector<HTMLInputElement>('input[name="account"]')!.value = ' Webby ';
    form.querySelector<HTMLInputElement>('input[name="password"]')!.value = 'secret-1';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(handed).toEqual([]);
    const event = (e: LobbyEvent) => app.handle(e);
    event({ type: 'serverList', servers: SERVERS });
    event({ type: 'serverList', servers: SERVERS });
    expect(handed).toEqual(['Webby secret-1']);
  });
});

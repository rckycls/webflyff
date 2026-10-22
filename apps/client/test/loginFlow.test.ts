import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ArReader, ArWriter, NULL_ID, PacketType, bytesToHex, deleteKey, encodeCertify, encodeCloseExistingConnection, encodeCreatePlayer,
  encodeDeletePlayer, encodeErrorReply, encodeGetPlayerList, encodeKeepAlive, encodePing, encodeQueryTickCount, hashPassword,
} from '@flyffweb/protocol';
import type { NewCharacter, ServerEntry } from '@flyffweb/protocol';
import { LoginFlow } from '../src/lobby/LoginFlow';
import type { LobbyEvent } from '../src/lobby/LoginFlow';
import { fakeChannels, fakeClock, playerListFor, serverListFor, typeOfClientBody } from './helpers/fakeChannel';

const CERTIFIER = '172.31.238.55:23000';
const LOGIN_SERVER = '172.31.238.55:28000';
const HASH = hashPassword('password1');
const hex = bytesToHex;
type EventOf<T extends LobbyEvent['type']> = Extract<LobbyEvent, { type: T }>;

const NEW_CHARACTER: NewCharacter = {
  slot: 1, name: 'WebTest1', face: 0, costume: 0, skinSet: 0, hairMesh: 3, hairColor: 0xff966455, sex: 1, job: 0, headMesh: 4, bankPin: 1234,
};

function start() {
  const net = fakeChannels();
  const clock = fakeClock(1000);
  const events: LobbyEvent[] = [];
  const flow = new LoginFlow(net.open, CERTIFIER, (e) => events.push(e), clock);
  return { net, clock, events, flow };
}

/** Logged in as `  WebTester ` and holding the server list (auth key 7). */
async function atServerList() {
  const s = start();
  await s.flow.login('  WebTester ', 'password1');
  const cert = s.net.channel(CERTIFIER);
  cert.push(serverListFor('webtester', 7));
  const list = s.events.find((e): e is EventOf<'serverList'> => e.type === 'serverList');
  if (list === undefined) throw new Error('no serverList event');
  return { ...s, cert, channel: list.servers[1]! };
}

/** The same, with a channel picked and the character list shown. */
async function atCharacterList() {
  const s = await atServerList();
  await s.flow.selectChannel(s.channel);
  const login = s.net.channel(LOGIN_SERVER);
  login.push(playerListFor(7));
  return { ...s, login };
}

const flushMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('LoginFlow, the happy path', () => {
  it('trims and lower-cases the account, answers keep-alive, then lists characters on the parent server address', async () => {
    const { net, events, flow } = start();
    await flow.login('  WebTester ', 'password1');
    const cert = net.channel(CERTIFIER);
    expect(new ArReader(cert.sent[0]!).u32()).toBe(PacketType.CERTIFY);
    expect(hex(cert.sent[0]!)).toBe(hex(encodeCertify('webtester', hashPassword('password1'))));
    cert.push(encodeKeepAlive());
    expect(hex(cert.sent[1]!)).toBe(hex(encodeKeepAlive()));
    cert.push(serverListFor('webtester', 7));
    const list = events.find((e): e is EventOf<'serverList'> => e.type === 'serverList')!;
    expect(list.servers.map((s) => s.name)).toEqual(['FlyFF', 'Channel 1']);
    await flow.selectChannel(list.servers[1]!);
    const login = net.channel(LOGIN_SERVER);
    expect(login.sent.map(typeOfClientBody)).toEqual([PacketType.QUERYTICKCOUNT, PacketType.GETPLAYERLIST]);
    expect(hex(login.sent[0]!)).toBe(hex(encodeQueryTickCount(1000)));
    expect(hex(login.sent[1]!)).toBe(hex(encodeGetPlayerList(7, 'webtester', hashPassword('password1'), 1)));
    login.push(playerListFor(7));
    expect(events.at(-1)).toMatchObject({ type: 'characters' });
    expect((events.at(-1) as EventOf<'characters'>).characters.map((c) => c.name)).toEqual(['Webby']);
    expect(cert.closed).toBe(true);
    expect(login.closed).toBe(false);
  });

  it('does not report the close it asked for itself', async () => {
    const { events, cert } = await atCharacterList();
    expect(cert.closed).toBe(true);
    await flushMicrotasks(); // the fake reports the close afterwards, like a WebSocket does
    expect(events.map((e) => e.type)).toEqual(['serverList', 'characters']);
  });

  it('does nothing for a channel whose parent server is not in the list', async () => {
    const { events, flow, net } = await atServerList();
    await flow.selectChannel({ parent: 99, id: 5, name: 'Channel 5', address: '', adult: 0, playerCount: 0, enabled: 1, maxPlayers: 500 });
    expect(events.map((e) => e.type)).toEqual(['serverList']);
    expect(() => net.channel(LOGIN_SERVER)).toThrow();
  });

  it('does nothing when a channel is selected before there is a server list', async () => {
    const { events, flow, net } = start();
    const channel: ServerEntry = { parent: 1, id: 1, name: 'Channel 1', address: '', adult: 0, playerCount: 0, enabled: 1, maxPlayers: 500 };
    await flow.selectChannel(channel); // no login at all
    await flow.login('webtester', 'password1');
    await flow.selectChannel(channel); // logged in, no list yet
    expect(events).toEqual([]);
    expect(() => net.channel(LOGIN_SERVER)).toThrow();
  });

  it('connects to the server with the channel\'s parent id, not to a channel that happens to have that id', async () => {
    const { flow, net } = start();
    await flow.login('webtester', 'password1');
    // Server and channel ids are separate numbers: channel 2 of server 5 comes first and has the id of server 2.
    const entry = (parent: number, id: number, name: string, address: string) =>
      new ArWriter().u32(parent).u32(id).string(name).string(address).i32(0).i32(0).i32(1).i32(500).toBytes();
    net.channel(CERTIFIER).push(new Uint8Array([
      ...new ArWriter().u32(PacketType.SRVR_LIST).u32(7).u8(0).string('webtester').u32(4).toBytes(),
      ...entry(NULL_ID, 5, 'First', '172.31.238.55'),
      ...entry(5, 2, 'Channel 2', ''),
      ...entry(NULL_ID, 2, 'Second', '172.31.238.56'),
      ...entry(2, 9, 'Channel 9', ''),
    ]));
    const channel9: ServerEntry = { parent: 2, id: 9, name: 'Channel 9', address: '', adult: 0, playerCount: 0, enabled: 1, maxPlayers: 500 };
    await flow.selectChannel(channel9);
    expect(net.channel('172.31.238.56:28000').sent.map(typeOfClientBody)).toEqual([PacketType.QUERYTICKCOUNT, PacketType.GETPLAYERLIST]);
  });
});

describe('LoginFlow, failures while logging in', () => {
  it('fails on an account echo that differs from the typed account', async () => {
    const { events, flow, net } = start();
    await flow.login('WebTester', 'password1');
    const cert = net.channel(CERTIFIER);
    cert.push(serverListFor('someoneelse', 7));
    expect(events).toEqual([{ type: 'error', message: 'Server Verification Error' }]);
    expect(cert.closed).toBe(true);
  });

  it('compares the echo with the trimmed, lower-cased account, not with what was typed', async () => {
    const { events, flow, net } = start();
    await flow.login('  WebTester ', 'password1');
    net.channel(CERTIFIER).push(serverListFor('  WebTester ', 7));
    expect(events).toEqual([{ type: 'error', message: 'Server Verification Error' }]);
  });

  it('times out after 20 seconds without an answer, and closes', async () => {
    const { events, flow, net, clock } = start();
    await flow.login('webtester', 'password1');
    const cert = net.channel(CERTIFIER);
    clock.advance(19999);
    expect(events).toEqual([]);
    clock.advance(1);
    expect(events).toEqual([{ type: 'error', message: 'The server did not answer in time.' }]);
    expect(cert.closed).toBe(true);
  });

  it('stops the timeout once the server list arrives', async () => {
    const { events, clock } = await atServerList();
    clock.advance(60000);
    expect(events.map((e) => e.type)).toEqual(['serverList']);
  });

  it('shows the text of ERROR 120 and closes', async () => {
    const { events, flow, net } = start();
    await flow.login('webtester', 'wrong');
    const cert = net.channel(CERTIFIER);
    cert.push(new ArWriter().u32(PacketType.ERROR).i32(120).toBytes());
    expect(events).toEqual([{ type: 'error', message: 'Login details incorrect.  Please try again.' }]);
    expect(cert.closed).toBe(true);
  });

  it('stops the timeout when an error arrives', async () => {
    const { events, flow, net, clock } = start();
    await flow.login('webtester', 'wrong');
    net.channel(CERTIFIER).push(new ArWriter().u32(PacketType.ERROR).i32(135).toBytes());
    clock.advance(60000);
    expect(events).toEqual([{ type: 'error', message: 'Wrong Passwords 3 times. Cannot log into account for 15 minutes.' }]);
  });

  it('offers to close the other connection on ERROR 103, and keeps the channel for it', async () => {
    const { events, flow, net, clock } = start();
    await flow.login('  WebTester ', 'password1');
    const cert = net.channel(CERTIFIER);
    cert.push(new ArWriter().u32(PacketType.ERROR).i32(103).toBytes());
    expect(events).toEqual([{ type: 'alreadyConnected' }]);
    expect(cert.closed).toBe(false);
    flow.closeExistingConnection();
    expect(hex(cert.sent.at(-1)!)).toBe(hex(encodeCloseExistingConnection('webtester', HASH)));
    // The certifier never answers it: no event, no timeout, and the channel stays open so the packet is not cut off.
    clock.advance(60000);
    expect(events).toEqual([{ type: 'alreadyConnected' }]);
    expect(cert.closed).toBe(false);
  });

  it('sends the request to close the other connection once, and only after ERROR 103', async () => {
    const { flow, net } = start();
    await flow.login('webtester', 'password1');
    const cert = net.channel(CERTIFIER);
    flow.closeExistingConnection(); // nothing was offered yet
    cert.push(serverListFor('webtester', 7));
    flow.closeExistingConnection(); // the login worked
    expect(cert.sent).toHaveLength(1);

    const second = start();
    await second.flow.login('webtester', 'password1');
    const cert2 = second.net.channel(CERTIFIER);
    cert2.push(new ArWriter().u32(PacketType.ERROR).i32(103).toBytes());
    second.flow.closeExistingConnection();
    second.flow.closeExistingConnection();
    expect(cert2.sent.map((b) => new ArReader(b).u32())).toEqual([PacketType.CERTIFY, PacketType.CLOSE_EXISTING_CONNECTION]);
  });

  it('leaves the channel open after the request to close the other connection, and the next login closes it', async () => {
    const { flow, net } = start();
    await flow.login('webtester', 'password1');
    const old = net.channel(CERTIFIER);
    old.push(new ArWriter().u32(PacketType.ERROR).i32(103).toBytes());
    flow.closeExistingConnection();
    expect(old.closed).toBe(false);
    await flow.login('webtester', 'password1');
    expect(old.closed).toBe(true);
    expect(net.channel(CERTIFIER)).not.toBe(old);
  });

  it('does not report the certifier closing after the request to close the other connection', async () => {
    const { events, flow, net } = start();
    await flow.login('webtester', 'password1');
    const cert = net.channel(CERTIFIER);
    cert.push(new ArWriter().u32(PacketType.ERROR).i32(103).toBytes());
    flow.closeExistingConnection();
    cert.drop(4002);
    expect(events).toEqual([{ type: 'alreadyConnected' }]);
  });

  it('reports the certifier closing while the other-connection prompt is showing', async () => {
    const { events, flow, net } = start();
    await flow.login('webtester', 'password1');
    const cert = net.channel(CERTIFIER);
    cert.push(new ArWriter().u32(PacketType.ERROR).i32(103).toBytes());
    cert.drop(4002);
    expect(events).toEqual([{ type: 'alreadyConnected' }, { type: 'closed', message: 'Disconnected from the server.' }]);
  });

  it('replies to ERROR_STRING, shows its text and closes', async () => {
    const { events, flow, net } = start();
    await flow.login('webtester', 'password1');
    const cert = net.channel(CERTIFIER);
    cert.push(new ArWriter().u32(PacketType.ERROR_STRING).string('Down for maintenance.').toBytes());
    expect(hex(cert.sent.at(-1)!)).toBe(hex(encodeErrorReply()));
    expect(events).toEqual([{ type: 'error', message: 'Down for maintenance.' }]);
    expect(cert.closed).toBe(true);
  });

  it('ignores a packet type it has no handler for, and says so on the console', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { events, flow, net } = start();
    await flow.login('webtester', 'password1');
    const cert = net.channel(CERTIFIER);
    cert.push(new ArWriter().u32(0x99).u8(1).toBytes());
    expect(events).toEqual([]);
    expect(cert.closed).toBe(false);
    expect(warn).toHaveBeenCalledWith('unknown packet 0x00000099');
  });

  it('answers a body it cannot read with an error event, never with a throw', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { events, flow, net } = start();
    await flow.login('webtester', 'password1');
    const cert = net.channel(CERTIFIER);
    expect(() => cert.push(serverListFor('webtester', 7).subarray(0, 20))).not.toThrow();
    expect(events).toEqual([{ type: 'error', message: 'The server sent data the game could not read.' }]);
    expect(cert.closed).toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it('reports a channel the server closes as a closed event', async () => {
    const { events, flow, net, clock } = start();
    await flow.login('webtester', 'password1');
    net.channel(CERTIFIER).drop(4002);
    expect(events).toEqual([{ type: 'closed', message: 'Disconnected from the server.' }]);
    clock.advance(60000);
    expect(events).toHaveLength(1);
  });

  it('reports a gateway it cannot reach as code 1006', async () => {
    const events: LobbyEvent[] = [];
    const flow = new LoginFlow(() => Promise.reject(new Error('refused')), CERTIFIER, (e) => events.push(e), fakeClock(0));
    await flow.login('webtester', 'password1');
    expect(events).toEqual([{ type: 'closed', message: 'Cannot reach the game gateway.' }]);
  });

  it('refuses a password or account the wire cannot carry, without opening anything', async () => {
    const { events, flow, net } = start();
    await flow.login('webtester', 'pässword');
    await flow.login('w'.repeat(42), 'password1');
    expect(events).toEqual([
      { type: 'error', message: 'Login details incorrect.  Please try again.' },
      { type: 'error', message: 'Login details incorrect.  Please try again.' },
    ]);
    expect(() => net.channel(CERTIFIER)).toThrow();
  });

  it('refuses an empty account or one with an apostrophe, which the certifier drops without an answer', async () => {
    const { events, flow, net, clock } = start();
    for (const account of ['', '   ', "o'brien", "'"]) await flow.login(account, 'password1');
    expect(events).toEqual(Array.from({ length: 4 }, () => ({ type: 'error', message: 'Login details incorrect.  Please try again.' })));
    expect(() => net.channel(CERTIFIER)).toThrow();
    clock.advance(60000);
    expect(events).toHaveLength(4);
  });

  it('refuses an account over 32 characters or with a space inside, which the rebuilt certifier drops', async () => {
    const { events, flow, net } = start();
    for (const account of ['w'.repeat(33), 'web tester']) await flow.login(account, 'password1');
    expect(events).toEqual(Array.from({ length: 2 }, () => ({ type: 'error', message: 'Login details incorrect.  Please try again.' })));
    expect(() => net.channel(CERTIFIER)).toThrow();
  });

  it('sends an account of 32 characters, the longest the database holds', async () => {
    const { flow, net } = start();
    await flow.login('w'.repeat(32), 'password1');
    expect(() => net.channel(CERTIFIER)).not.toThrow();
  });
});

describe('LoginFlow, failures while listing characters', () => {
  it('fails on a PLAYER_LIST with another auth key', async () => {
    const { events, flow, net, cert } = await atServerList();
    await flow.selectChannel(events.find((e): e is EventOf<'serverList'> => e.type === 'serverList')!.servers[1]!);
    const login = net.channel(LOGIN_SERVER);
    login.push(playerListFor(8));
    expect(events.at(-1)).toEqual({ type: 'error', message: 'Server Verification Error' });
    expect(login.closed).toBe(true);
    expect(cert.closed).toBe(true);
  });

  it('reports a login server that closes, and drops the certifier connection with it', async () => {
    const { events, flow, net, cert, channel } = await atServerList();
    await flow.selectChannel(channel);
    net.channel(LOGIN_SERVER).drop(4002);
    expect(events.at(-1)).toEqual({ type: 'closed', message: 'Disconnected from the server.' });
    expect(cert.closed).toBe(true);
  });

  it('says nothing when the certifier closes after the server list, as Neuz does, and still lists the characters', async () => {
    const { events, cert, flow, net, channel, clock } = await atServerList();
    cert.drop(4002);
    clock.advance(60000);
    expect(events.map((e) => e.type)).toEqual(['serverList']);
    await flow.selectChannel(channel);
    net.channel(LOGIN_SERVER).push(playerListFor(7));
    expect(events.map((e) => e.type)).toEqual(['serverList', 'characters']);
  });

  it('accepts the character list when the certifier closed while the login server was answering', async () => {
    const { events, cert, flow, net, channel } = await atServerList();
    await flow.selectChannel(channel);
    cert.drop(4002);
    expect(events.map((e) => e.type)).toEqual(['serverList']);
    net.channel(LOGIN_SERVER).push(playerListFor(7));
    expect(events.map((e) => e.type)).toEqual(['serverList', 'characters']);
    expect(net.channel(LOGIN_SERVER).closed).toBe(false);
  });

  it('shows an error from the login server and keeps the connection for another try', async () => {
    const { events, login, flow } = await atCharacterList();
    login.push(new ArWriter().u32(PacketType.ERROR).i32(1316).toBytes());
    expect(events.at(-1)).toEqual({ type: 'error', message: 'That character name is already in use.' });
    expect(login.closed).toBe(false);
    flow.createCharacter(NEW_CHARACTER);
    expect(login.sent.at(-1)).toBeDefined();
    expect(typeOfClientBody(login.sent.at(-1)!)).toBe(PacketType.CREATE_PLAYER);
  });

  it('ignores the login server packets it has nothing to do with', async () => {
    const { events, login } = await atCharacterList();
    const before = events.length;
    login.push(new ArWriter().u32(PacketType.PING).u32(5).toBytes());
    login.push(new ArWriter().u32(PacketType.ONE_HOUR_NOTIFY).toBytes());
    login.push(new ArWriter().u32(PacketType.QUERYTICKCOUNT).u32(1).i64(2n).toBytes());
    login.push(new ArWriter().u32(PacketType.CACHE_ADDR).string('172.31.238.55').toBytes());
    expect(events).toHaveLength(before);
    expect(login.closed).toBe(false);
  });
});

describe('LoginFlow, creating and deleting characters', () => {
  it('sends CREATE_PLAYER with the typed account, the password hash and the auth key', async () => {
    const { login, flow } = await atCharacterList();
    flow.createCharacter({ ...NEW_CHARACTER, name: '  WebTest1 ' });
    expect(hex(login.sent.at(-1)!)).toBe(hex(encodeCreatePlayer('webtester', HASH, NEW_CHARACTER, 7)));
  });

  it('shows the new list after the server answers a create or a delete', async () => {
    const { events, login, flow } = await atCharacterList();
    flow.createCharacter(NEW_CHARACTER);
    login.push(playerListFor(7));
    expect(events.filter((e) => e.type === 'characters')).toHaveLength(2);
  });

  it('refuses a character the wire format cannot carry, and sends nothing', async () => {
    const { events, login, flow } = await atCharacterList();
    const sentBefore = login.sent.length;
    const bad: [Partial<NewCharacter>, string][] = [
      [{ slot: 3 }, 'Oops. Try again.'],
      [{ slot: -1 }, 'Oops. Try again.'],
      [{ slot: 1.5 }, 'Oops. Try again.'],
      [{ name: 'abc' }, 'Character Name must be 4 to 16 characters long.'],
      [{ name: '1abcd' }, 'The name cannot start with a number.'],
      [{ bankPin: 0 }, 'Invalid Bank PIN.'],
      [{ bankPin: 10000 }, 'The Bank PIN should be a 4 digit number.'],
      [{ bankPin: 12.5 }, 'The Bank PIN should be a 4 digit number.'],
      [{ hairMesh: 5 }, 'Oops. Try again.'],
      [{ headMesh: 256 }, 'Oops. Try again.'],
      [{ sex: 2 }, 'Oops. Try again.'],
      [{ job: 1 }, 'Oops. Try again.'],
      [{ costume: 256 }, 'Oops. Try again.'],
      [{ hairColor: -1 }, 'Oops. Try again.'],
    ];
    for (const [change, message] of bad) {
      flow.createCharacter({ ...NEW_CHARACTER, ...change });
      expect(events.at(-1), JSON.stringify(change)).toEqual({ type: 'error', message });
    }
    expect(login.sent).toHaveLength(sentBefore);
  });

  it('deletes with the Bank PIN key, the character\'s player id and the friends of that slot', async () => {
    const { login, flow } = await atCharacterList();
    flow.deleteCharacter(0, '1234');
    expect(hex(login.sent.at(-1)!)).toBe(hex(encodeDeletePlayer('webtester', HASH, deleteKey('1234'), 500, 7, [900])));
  });

  it('sends an empty friend list when the slot has no messenger', async () => {
    const s = await atServerList();
    await s.flow.selectChannel(s.channel);
    const login = s.net.channel(LOGIN_SERVER);
    // The same character, with no messenger entries after the list.
    const withoutMessenger = new ArWriter().u32(PacketType.PLAYER_LIST).u32(7).i32(1)
      .i32(0).i32(0).u32(1).u32(11).string('Webby').vec3([0, 0, 0])
      .u32(500).u32(0).u32(0).u32(0).u32(0).u32(2).u32(0).u32(1).u8(0).i32(0).i32(15).u32(0)
      .i32(15).i32(15).i32(15).i32(15).u32(0).i32(0).i32(0).toBytes();
    login.push(withoutMessenger);
    s.flow.deleteCharacter(0, '1234');
    expect(hex(login.sent.at(-1)!)).toBe(hex(encodeDeletePlayer('webtester', HASH, deleteKey('1234'), 500, 7, [])));
  });

  it('refuses a delete with a bad slot, an empty slot or a bad PIN, and sends nothing', async () => {
    const { events, login, flow } = await atCharacterList();
    const sentBefore = login.sent.length;
    flow.deleteCharacter(3, '1234');
    expect(events.at(-1)).toEqual({ type: 'error', message: 'Oops. Try again.' });
    flow.deleteCharacter(2, '1234'); // the list holds slot 0 only
    expect(events.at(-1)).toEqual({ type: 'error', message: 'Oops. Try again.' });
    flow.deleteCharacter(0, '12a4');
    expect(events.at(-1)).toEqual({ type: 'error', message: 'The Bank PIN should be a 4 digit number.' });
    flow.deleteCharacter(0, '');
    expect(events.at(-1)).toEqual({ type: 'error', message: 'Enter the Bank PIN to continue.' });
    expect(login.sent).toHaveLength(sentBefore);
  });
});

describe('LoginFlow, keeping the login server connection', () => {
  it('pings the login server every 10 seconds with the time, as Neuz does', async () => {
    const { login, cert, clock } = await atCharacterList();
    const sentBefore = login.sent.length;
    clock.advance(9999);
    expect(login.sent).toHaveLength(sentBefore);
    clock.advance(1);
    clock.advance(20000);
    // The flow's clock started at 1000 and the channel was picked then.
    expect(login.sent.slice(sentBefore).map(hex)).toEqual([11000, 21000, 31000].map((t) => hex(encodePing(t))));
    expect(cert.sent.map((b) => new ArReader(b).u32())).toEqual([PacketType.CERTIFY]);
    expect(clock.pending()).toBe(1);
  });

  it('pings from the moment the connection is there, before the character list is in', async () => {
    const { flow, net, clock, channel } = await atServerList();
    await flow.selectChannel(channel);
    clock.advance(10000);
    expect(net.channel(LOGIN_SERVER).sent.map(typeOfClientBody)).toEqual([PacketType.QUERYTICKCOUNT, PacketType.GETPLAYERLIST, PacketType.PING]);
  });

  it.each([
    ['the player logs out', (s: Awaited<ReturnType<typeof atCharacterList>>) => s.flow.dispose()],
    ['the login server closes the connection', (s: Awaited<ReturnType<typeof atCharacterList>>) => s.login.drop(4002)],
    ['the login server sends a list that is not for this login', (s: Awaited<ReturnType<typeof atCharacterList>>) => s.login.push(playerListFor(8))],
  ])('stops pinging when %s, and leaves no timer behind', async (_why, end) => {
    const s = await atCharacterList();
    const sentBefore = s.login.sent.length;
    end(s);
    s.clock.advance(60000);
    await flushMicrotasks();
    expect(s.login.sent).toHaveLength(sentBefore);
    expect(s.clock.pending()).toBe(0);
  });

  it('pings only the connection of the channel picked last, with one timer', async () => {
    const { flow, net, login, clock, channel } = await atCharacterList();
    clock.advance(5000);
    await flow.selectChannel(channel);
    const fresh = net.channel(LOGIN_SERVER);
    expect(fresh).not.toBe(login);
    const oldSent = login.sent.length;
    clock.advance(5000); // the old connection's ping would be due now
    expect(login.sent).toHaveLength(oldSent);
    expect(fresh.sent.map(typeOfClientBody)).toEqual([PacketType.QUERYTICKCOUNT, PacketType.GETPLAYERLIST]);
    clock.advance(5000);
    expect(hex(fresh.sent.at(-1)!)).toBe(hex(encodePing(16000)));
    expect(clock.pending()).toBe(1);
  });
});

describe('LoginFlow, changing the channel', () => {
  it('closes the login server, waits a second, and logs in again with the stored hash for a new server list', async () => {
    const { events, flow, net, login, cert, clock, channel } = await atCharacterList();
    flow.changeChannel();
    expect(login.closed).toBe(true);
    // Neuz's Back button waits a second (`Sleep( 1000 )`) before it connects to the certifier again.
    clock.advance(999);
    await flushMicrotasks();
    expect(net.targets).toEqual([CERTIFIER, LOGIN_SERVER]);
    clock.advance(1);
    await flushMicrotasks();
    expect(net.targets).toEqual([CERTIFIER, LOGIN_SERVER, CERTIFIER]);
    const again = net.channel(CERTIFIER);
    expect(again).not.toBe(cert);
    expect(again.sent.map(hex)).toEqual([hex(encodeCertify('webtester', HASH))]);

    // The answer is a server list with a new auth key, taken like the first one; the close of the old connection is not reported.
    again.push(serverListFor('webtester', 8));
    expect(events.map((e) => e.type)).toEqual(['serverList', 'characters', 'serverList']);
    await flow.selectChannel(channel);
    const fresh = net.channel(LOGIN_SERVER);
    expect(fresh).not.toBe(login);
    expect(hex(fresh.sent[1]!)).toBe(hex(encodeGetPlayerList(8, 'webtester', HASH, 1)));
    fresh.push(playerListFor(8));
    expect(events.map((e) => e.type)).toEqual(['serverList', 'characters', 'serverList', 'characters']);
    expect(again.closed).toBe(true);
    flow.deleteCharacter(0, '1234');
    expect(hex(fresh.sent.at(-1)!)).toBe(hex(encodeDeletePlayer('webtester', HASH, deleteKey('1234'), 500, 8, [900])));
  });

  it('forgets the old list and auth key at once, so nothing more goes to the old servers', async () => {
    const { events, flow, net, login, clock, channel } = await atCharacterList();
    const sentBefore = login.sent.length;
    flow.changeChannel();
    await flow.selectChannel(channel);
    flow.createCharacter(NEW_CHARACTER);
    flow.deleteCharacter(0, '1234');
    flow.changeChannel(); // already changing: no second login
    clock.advance(1000);
    await flushMicrotasks();
    expect(net.targets).toEqual([CERTIFIER, LOGIN_SERVER, CERTIFIER]);
    expect(login.sent).toHaveLength(sentBefore);
    expect(net.channel(CERTIFIER).sent).toHaveLength(1);
    expect(events.map((e) => e.type)).toEqual(['serverList', 'characters']);
  });

  it('times out the new login after 20 seconds, counted from the end of the pause', async () => {
    const { events, flow, net, clock } = await atCharacterList();
    flow.changeChannel();
    clock.advance(1000);
    await flushMicrotasks();
    const again = net.channel(CERTIFIER);
    clock.advance(19999);
    expect(events.map((e) => e.type)).toEqual(['serverList', 'characters']);
    clock.advance(1);
    expect(events.at(-1)).toEqual({ type: 'error', message: 'The server did not answer in time.' });
    expect(again.closed).toBe(true);
    expect(clock.pending()).toBe(0);
  });

  it('is called off by logging out during the pause', async () => {
    const { events, flow, net, clock } = await atCharacterList();
    flow.changeChannel();
    flow.dispose();
    clock.advance(60000);
    await flushMicrotasks();
    expect(net.targets).toEqual([CERTIFIER, LOGIN_SERVER]);
    expect(events.map((e) => e.type)).toEqual(['serverList', 'characters']);
    expect(clock.pending()).toBe(0);
  });

  it('is called off by a new login during the pause', async () => {
    const { flow, net, clock } = await atCharacterList();
    flow.changeChannel();
    await flow.login('Other', 'password2');
    clock.advance(1000);
    await flushMicrotasks();
    expect(net.targets).toEqual([CERTIFIER, LOGIN_SERVER, CERTIFIER]);
    expect(net.channel(CERTIFIER).sent.map(hex)).toEqual([hex(encodeCertify('other', hashPassword('password2')))]);
  });

  it('does nothing before there is a server list', async () => {
    const { events, flow, net, clock } = start();
    flow.changeChannel(); // no login at all
    await flow.login('webtester', 'password1');
    const cert = net.channel(CERTIFIER);
    flow.changeChannel(); // logged in, no list yet
    clock.advance(1000);
    await flushMicrotasks();
    expect(net.targets).toEqual([CERTIFIER]);
    expect(cert.closed).toBe(false);
    cert.push(serverListFor('webtester', 7));
    expect(events.map((e) => e.type)).toEqual(['serverList']);
  });

  it('closes a login-server connection that finishes opening after the change', async () => {
    const net = fakeChannels();
    const clock = fakeClock(1000);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const events: LobbyEvent[] = [];
    const open = async (target: string) => {
      if (target === LOGIN_SERVER) await gate;
      return net.open(target);
    };
    const flow = new LoginFlow(open, CERTIFIER, (e) => events.push(e), clock);
    await flow.login('webtester', 'password1');
    net.channel(CERTIFIER).push(serverListFor('webtester', 7));
    const picking = flow.selectChannel((events[0] as EventOf<'serverList'>).servers[1]!);
    flow.changeChannel();
    release();
    await picking;
    expect(net.channel(LOGIN_SERVER).closed).toBe(true);
    expect(net.channel(LOGIN_SERVER).sent).toEqual([]);
    clock.advance(1000);
    await flushMicrotasks();
    expect(net.channel(CERTIFIER).sent.map(hex)).toEqual([hex(encodeCertify('webtester', HASH))]);
    expect(clock.pending()).toBe(1); // the certify timeout, and no ping
  });

  it('ends the session with a message, not a stray rejection, when logging in again throws', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const net = fakeChannels();
    const clock = fakeClock(1000);
    const events: LobbyEvent[] = [];
    let certifiers = 0;
    const open = async (target: string) => {
      const channel = await net.open(target);
      if (target === CERTIFIER && ++certifiers === 2) channel.send = () => { throw new Error('a bug'); };
      return channel;
    };
    const flow = new LoginFlow(open, CERTIFIER, (e) => events.push(e), clock);
    await flow.login('webtester', 'password1');
    net.channel(CERTIFIER).push(serverListFor('webtester', 7));
    await flow.selectChannel((events[0] as EventOf<'serverList'>).servers[1]!);
    net.channel(LOGIN_SERVER).push(playerListFor(7));
    flow.changeChannel();
    clock.advance(1000);
    await flushMicrotasks();
    expect(events.at(-1)).toEqual({ type: 'error', message: 'Something went wrong. Please try again.' });
    expect(logged).toHaveBeenCalledTimes(1);
    expect(net.channel(CERTIFIER).closed).toBe(true);
    expect(clock.pending()).toBe(0);
  });
});

describe('LoginFlow, a listener that throws', () => {
  function throwing() {
    const net = fakeChannels();
    const seen: string[] = [];
    const flow = new LoginFlow(net.open, CERTIFIER, (e) => { seen.push(e.type); throw new Error('view bug'); }, fakeClock(0));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    return { net, seen, flow, logged };
  }

  it('is logged and not blamed on the server, and the flow carries on', async () => {
    const { net, seen, flow, logged } = throwing();
    await flow.login('webtester', 'password1');
    const cert = net.channel(CERTIFIER);
    expect(() => cert.push(serverListFor('webtester', 7))).not.toThrow();
    expect(seen).toEqual(['serverList']);
    expect(cert.closed).toBe(false);
    expect(logged).toHaveBeenCalledTimes(1);
    await flow.selectChannel({ parent: 1, id: 1, name: 'Channel 1', address: '', adult: 0, playerCount: 0, enabled: 1, maxPlayers: 500 });
    expect(net.channel(LOGIN_SERVER).sent).toHaveLength(2);
  });

  it('does not escape when the server closes a channel', async () => {
    const { net, seen, flow, logged } = throwing();
    await flow.login('webtester', 'password1');
    expect(() => net.channel(CERTIFIER).drop(4002)).not.toThrow();
    expect(seen).toEqual(['closed']);
    expect(logged).toHaveBeenCalledTimes(1);
  });

  it('does not escape when it was told about a packet that could not be read', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { net, seen, flow, logged } = throwing();
    await flow.login('webtester', 'password1');
    expect(() => net.channel(CERTIFIER).push(new Uint8Array([1, 2]))).not.toThrow();
    expect(seen).toEqual(['error']);
    expect(logged).toHaveBeenCalledTimes(1);
  });
});

describe('LoginFlow, starting over and stopping', () => {
  it('closes the connections of the earlier login when logging in again', async () => {
    const { flow, net, cert } = await atServerList();
    await flow.login('other', 'password1');
    expect(cert.closed).toBe(true);
    expect(net.channel(CERTIFIER)).not.toBe(cert);
  });

  it('ignores what a closed channel still delivers', async () => {
    const { events, cert, flow } = await atServerList();
    flow.dispose();
    const before = events.length;
    cert.push(new ArWriter().u32(PacketType.ERROR).i32(120).toBytes());
    cert.drop(4002);
    expect(events).toHaveLength(before);
  });

  it('dispose closes every channel, stops the timer and emits nothing', async () => {
    const { events, flow, net, clock, channel } = await atServerList();
    await flow.selectChannel(channel);
    flow.dispose();
    expect(net.channel(CERTIFIER).closed).toBe(true);
    expect(net.channel(LOGIN_SERVER).closed).toBe(true);
    clock.advance(60000);
    await flushMicrotasks();
    expect(events.map((e) => e.type)).toEqual(['serverList']);
  });

  it('closes a channel that finishes opening after dispose', async () => {
    const net = fakeChannels();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const events: LobbyEvent[] = [];
    const flow = new LoginFlow(async (target) => { await gate; return net.open(target); }, CERTIFIER, (e) => events.push(e), fakeClock(0));
    const login = flow.login('webtester', 'password1');
    flow.dispose();
    release();
    await login;
    expect(net.channel(CERTIFIER).closed).toBe(true);
    expect(net.channel(CERTIFIER).sent).toEqual([]);
    expect(events).toEqual([]);
  });

  it('times out a gateway that never finishes opening', async () => {
    const net = fakeChannels();
    const events: LobbyEvent[] = [];
    const clock = fakeClock(0);
    const flow = new LoginFlow(() => new Promise(() => {}), CERTIFIER, (e) => events.push(e), clock);
    void flow.login('webtester', 'password1');
    clock.advance(20000);
    expect(events).toEqual([{ type: 'error', message: 'The server did not answer in time.' }]);
    expect(() => net.channel(CERTIFIER)).toThrow();
  });

  it('runs on the system clock when none is given', async () => {
    vi.useFakeTimers();
    const net = fakeChannels();
    const events: LobbyEvent[] = [];
    const flow = new LoginFlow(net.open, CERTIFIER, (e) => events.push(e));
    await flow.login('webtester', 'password1');
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(20000);
    expect(events).toEqual([{ type: 'error', message: 'The server did not answer in time.' }]);
    expect(vi.getTimerCount()).toBe(0);
    await flow.login('webtester', 'password1');
    flow.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('pings on the system clock and leaves no timer behind', async () => {
    vi.useFakeTimers();
    const net = fakeChannels();
    const events: LobbyEvent[] = [];
    const flow = new LoginFlow(net.open, CERTIFIER, (e) => events.push(e));
    await flow.login('webtester', 'password1');
    net.channel(CERTIFIER).push(serverListFor('webtester', 7));
    expect(vi.getTimerCount()).toBe(0);
    await flow.selectChannel((events[0] as EventOf<'serverList'>).servers[1]!);
    const login = net.channel(LOGIN_SERVER);
    login.push(playerListFor(7));
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(10000);
    expect(typeOfClientBody(login.sent.at(-1)!)).toBe(PacketType.PING);
    expect(vi.getTimerCount()).toBe(1);
    flow.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });
});

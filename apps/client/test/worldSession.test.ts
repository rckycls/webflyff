import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ArWriter, MessageType, NULL_ID, PacketType, bytesToHex, encodeDestPos, encodeJoin, encodePing, encodePlayerBehavior,
  encodePlayerMoved, encodePreJoin, encodeWorldKeepAlive,
} from '@flyffweb/protocol';
import type { AddedMover, CharacterSummary, MoveReport, SlotMessenger, Vec3 } from '@flyffweb/protocol';
import {
  encodeBundle, writeAddSelf, writeDestPos, writeEnvironmentSetting, writeGameTimer, writeReplace, writeSetPos, writeWorldReadInfo,
} from '@flyffweb/testkit';
import type { ScriptMessage } from '@flyffweb/testkit';
import type { WorldEntry } from '../src/lobby/LoginFlow';
import type { OpenChannel } from '../src/net/PacketChannel';
import { ServerClock } from '../src/net/serverClock';
import { WorldSession } from '../src/world/WorldSession';
import type { WorldEvent } from '../src/world/WorldSession';
import { fakeChannels, fakeClock, typeOfClientBody } from './helpers/fakeChannel';
import type { FakeChannel } from './helpers/fakeChannel';

const LOGIN_SERVER = '172.31.238.55:28000';
const CACHE_SERVER = '172.31.238.55:5400';
const HASH = '0123456789abcdef0123456789abcdef';
const OWN = 24; // the player's object ID
const FLARIS = 1;
const POS: Vec3 = [6968, 100, 3328];
const hex = bytesToHex;
type EventOf<T extends WorldEvent['type']> = Extract<WorldEvent, { type: T }>;

const CHARACTER: CharacterSummary = {
  slot: 1, blocked: 0, worldId: FLARIS, index: 0, name: 'Webby', position: POS, playerId: 500, partyId: 11, guildId: 12,
  warId: 13, skinSet: 0, hairMesh: 0, hairColor: 0xff907b6d, headMesh: 0, sex: 0, job: 0, level: 15, jobLevel: 0,
  str: 15, sta: 15, dex: 15, int: 15, mode: 0, equipment: [],
};
const MESSENGER: SlotMessenger = { slot: 1, state: 2, friends: [{ id: 900, blocked: 0, state: 1 }] };

/** The own character as ADD_OBJ carries it: a player, wearing nothing. */
const SELF: AddedMover = {
  index: 11, scale: 1, pos: POS, angle: 0, objectId: OWN, motion: 0, isPlayer: true, hitPoint: 100, state: 0, stateFlag: 0,
  belligerence: 0, sfxId: 0,
  player: {
    self: true, name: 'Webby', sex: 0, skinSet: 0, hairMesh: 0, hairColor: 0, headMesh: 0, playerId: 500, job: 0, level: 15,
    authorization: 0x46, mode: 0, stateMode: 0, pkTime: 0, pkValue: 0, pkPropensity: 0, honor: -1, worn: [],
    equipmentObjectIds: new Array<number>(31).fill(NULL_ID), shopTitle: '',
  },
};

const MOVE: MoveReport = {
  pos: [1, 2, 3], delta: [0, 0, -0.1], angle: 90, state: 1, stateFlag: 2, motion: 3, motionEx: 4, loop: 5, motionOption: 6, tick: 777n,
};

// ---- what the servers send -----------------------------------------------------------------------------------------

const preJoinAnswer = () => new ArWriter().u32(PacketType.PRE_JOIN).toBytes();
const keepAlive = () => new ArWriter().u32(PacketType.KEEP_ALIVE).toBytes();
const errorPacket = (code: number) => new ArWriter().u32(PacketType.ERROR).i32(code).toBytes();
const replacePacket = (worldId: number, pos: Vec3 = [5, 6, 7]) => new ArWriter().u32(PacketType.REPLACE).u32(worldId).vec3(pos).toBytes();

/** The first bundle: the world and the position, then the own character. */
function joinBundle(extra: ScriptMessage[] = [], options: { index?: boolean } = {}): Uint8Array {
  return encodeBundle(PacketType.JOIN, OWN, [writeWorldReadInfo(OWN, FLARIS, POS), writeAddSelf(OWN, SELF), ...extra], options);
}
const snapshot = (messages: ScriptMessage[], options: { index?: boolean } = {}) => encodeBundle(PacketType.SNAPSHOT, OWN, messages, options);

/** A message of a type nothing reads. */
const unknownMessage = (type = 0x7777): ScriptMessage => ({ objectId: OWN, type, fields: new Uint8Array([1, 2, 3]) });
/** A DESTPOS with a stray byte, so its reader does not end where the message does. */
const longDestPos = (): ScriptMessage => ({ ...writeDestPos(OWN, [1, 2, 3], true), fields: new Uint8Array(14) });

// ---- the session under test ----------------------------------------------------------------------------------------

function setup(character: CharacterSummary = CHARACTER) {
  const net = fakeChannels();
  const clock = fakeClock(1000);
  const events: WorldEvent[] = [];
  /** For each `ended` event: whether the session had closed every channel it held by then. */
  const closedBeforeEnd: boolean[] = [];
  let login!: FakeChannel;
  const entry = async (): Promise<WorldEntry> => {
    login = (await net.open(LOGIN_SERVER)) as FakeChannel;
    const serverClock = new ServerClock(() => clock.now());
    serverClock.start(1000, 777n);
    return {
      login, cacheTarget: CACHE_SERVER, account: 'webtester', passwordHash: HASH, authKey: 7, channelId: 3, character,
      messenger: MESSENGER, clock: serverClock,
    };
  };
  const cacheOpened = () => net.targets.includes(CACHE_SERVER);
  return {
    net, clock, events, closedBeforeEnd,
    async make(open: OpenChannel = net.open, hook: (event: WorldEvent) => void = () => {}) {
      const session = new WorldSession(open, await entry(), (e) => {
        events.push(e);
        if (e.type === 'ended') closedBeforeEnd.push(login.closed && (!cacheOpened() || net.channel(CACHE_SERVER).closed));
        hook(e);
      }, clock);
      return { session, login };
    },
  };
}

/** Started: the cache channel is open and the pause is running. */
async function started() {
  const s = setup();
  const { session, login } = await s.make();
  await session.start();
  return { ...s, session, login, cache: s.net.channel(CACHE_SERVER) };
}

/** PRE_JOIN is sent and awaiting its answer. */
async function atPreJoin() {
  const s = await started();
  s.clock.advance(1000);
  return s;
}

/** JOIN is sent and awaiting its answer. */
async function atJoin() {
  const s = await atPreJoin();
  s.login.push(preJoinAnswer());
  return s;
}

/** The JOIN bundle came and the session is playing. */
async function playing() {
  const s = await atJoin();
  s.cache.push(joinBundle());
  return s;
}

const flushMicrotasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** An `OpenChannel` whose channels arrive only once the test calls `release`. */
function gated(net: ReturnType<typeof fakeChannels>) {
  let release!: () => void;
  const opened = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    release: () => release(),
    open: (async (target: string) => {
      await opened;
      return net.open(target);
    }) as OpenChannel,
  };
}
const ended = (events: WorldEvent[]) => events.filter((e): e is EventOf<'ended'> => e.type === 'ended');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('WorldSession, entering', () => {
  it('waits 1 s after the cache channel opens, then sends PRE_JOIN', async () => {
    const { net, clock, login, cache, events } = await started();
    expect(net.targets).toEqual([LOGIN_SERVER, CACHE_SERVER]);
    clock.advance(999);
    expect(login.sent).toEqual([]);
    clock.advance(1);
    expect(login.sent).toHaveLength(1);
    expect(hex(login.sent[0]!)).toBe(hex(encodePreJoin('webtester', 500, 'Webby')));
    expect(cache.sent).toEqual([]); // JOIN waits for the answer
    expect(events).toEqual([]);
  });

  it('counts the pause from the moment the cache channel opens, not from start()', async () => {
    const s = setup();
    const gate = gated(s.net);
    const { session, login } = await s.make(gate.open);
    const starting = session.start();
    s.clock.advance(5000); // the gateway is slow
    expect(login.sent).toEqual([]);
    gate.release();
    await starting;
    s.clock.advance(999);
    expect(login.sent).toEqual([]);
    s.clock.advance(1);
    expect(login.sent.map(typeOfClientBody)).toEqual([PacketType.PRE_JOIN]);
  });

  it('sends JOIN after PRE_JOIN\'s answer, with the entry\'s fields', async () => {
    const { login, cache } = await atPreJoin();
    expect(cache.sent).toEqual([]);
    login.push(preJoinAnswer());
    expect(cache.sent).toHaveLength(1);
    expect(hex(cache.sent[0]!)).toBe(hex(encodeJoin({
      worldId: FLARIS, playerId: 500, authKey: 7, partyId: 11, guildId: 12, warId: 13, channelId: 3, slot: 1, name: 'Webby',
      account: 'webtester', passwordHash: HASH, messenger: MESSENGER,
    })));
    // The browser sends no MAP_KEY and nothing else to the login server but PRE_JOIN.
    expect(login.sent.map(typeOfClientBody)).toEqual([PacketType.PRE_JOIN]);
  });

  it('sends JOIN once, however many PRE_JOIN answers come', async () => {
    const { login, cache } = await atJoin();
    login.push(preJoinAnswer());
    login.push(preJoinAnswer());
    expect(cache.sent).toHaveLength(1);
  });

  it('emits entered with the first bundle\'s WORLD_READINFO', async () => {
    const { cache, events } = await atJoin();
    cache.push(joinBundle());
    expect(events).toHaveLength(1);
    const entered = events[0] as EventOf<'entered'>;
    expect(entered).toMatchObject({ type: 'entered', worldId: FLARIS, pos: POS, playerObjectId: OWN });
    // Every message of the bundle goes on, the WORLD_READINFO and the own ADD_OBJ among them.
    expect(entered.messages.map((m) => [m.objectId, m.type, m.value.type])).toEqual([
      [OWN, MessageType.WORLD_READINFO, 'worldReadInfo'],
      [OWN, MessageType.ADD_OBJ, 'addMover'],
    ]);
  });

  it('enters from a bundle without a table of contents too, as the old World.exe sends it', async () => {
    const { cache, events, session } = await atJoin();
    // CUser::Open (WORLDSERVER/User.cpp:308-349): the environment setting, WORLD_READINFO, the own ADD_OBJ, then the game
    // timer and the rest, which nothing reads; and the server adds the movers in view in the bundles that follow.
    cache.push(encodeBundle(PacketType.JOIN, OWN, [
      writeEnvironmentSetting(OWN, 0), writeWorldReadInfo(OWN, FLARIS, POS), writeAddSelf(OWN, SELF), writeGameTimer(OWN, 12.5),
    ], { index: false }));
    expect(events).toMatchObject([{ type: 'entered', worldId: FLARIS, pos: POS, playerObjectId: OWN }]);
    const entered = events[0] as EventOf<'entered'>;
    expect(entered.messages.map((m) => m.value.type)).toEqual(['environmentSetting', 'worldReadInfo', 'addMover']);
    // the own ADD_OBJ's reader skips the rest of its message, which without a table is the rest of the bundle: the game
    // timer is dropped with it, unseen, so nothing counts as skipped
    expect(session.stats).toEqual({ bundles: 1, indexed: 0, skipped: 0, mismatched: 0, unknownPackets: 0 });
  });

  it('takes the world from WORLD_READINFO, not from the character list', async () => {
    const { cache, events } = await atJoin();
    cache.push(encodeBundle(PacketType.JOIN, OWN, [writeWorldReadInfo(OWN, 6, [10, 20, 30]), writeAddSelf(OWN, SELF)]));
    expect(events).toMatchObject([{ type: 'entered', worldId: 6, pos: [10, 20, 30] }]);
  });

  it('a JOIN after entering is an ordinary bundle', async () => {
    const { cache, events } = await playing();
    // The world server can send the next bundle typed JOIN after a JOIN over 16 KB (`CAr::ReelIn`).
    cache.push(encodeBundle(PacketType.JOIN, OWN, [writeSetPos(OWN, [1, 2, 3])]));
    expect(events.map((e) => e.type)).toEqual(['entered', 'messages']);
    expect((events[1] as EventOf<'messages'>).messages.map((m) => m.value)).toEqual([{ type: 'setPos', pos: [1, 2, 3] }]);
  });

  it('passes the bundles after the first on as messages', async () => {
    const { cache, events } = await playing();
    cache.push(snapshot([writeSetPos(OWN, [4, 5, 6]), writeSetPos(OWN, [7, 8, 9])]));
    cache.push(snapshot([writeSetPos(OWN, [1, 1, 1])], { index: false }));
    expect(events.map((e) => e.type)).toEqual(['entered', 'messages', 'messages']);
    expect((events[1] as EventOf<'messages'>).messages).toHaveLength(2);
  });

  it('an empty bundle is no event', async () => {
    const { cache, events } = await playing();
    cache.push(snapshot([]));
    cache.push(snapshot([unknownMessage()]));
    expect(events.map((e) => e.type)).toEqual(['entered']);
  });

  it('a JOIN without WORLD_READINFO ends with the bad-data text', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { cache, login, events } = await atJoin();
    cache.push(encodeBundle(PacketType.JOIN, OWN, [writeAddSelf(OWN, SELF)]));
    expect(events).toEqual([{ type: 'ended', message: 'The server sent data the game could not read.' }]);
    expect(cache.closed && login.closed).toBe(true);
  });

  it('ignores a bundle that comes before JOIN was sent or answered', async () => {
    const { cache, events } = await atPreJoin();
    cache.push(joinBundle());
    cache.push(snapshot([writeSetPos(OWN, [1, 2, 3])]));
    expect(events).toEqual([]);
  });
});

describe('WorldSession, answering and pinging', () => {
  it('answers KEEP_ALIVE without a frame loop', async () => {
    const { cache } = await playing();
    cache.push(keepAlive());
    cache.push(keepAlive());
    expect(cache.sent.slice(1).map(hex)).toEqual([hex(encodeWorldKeepAlive()), hex(encodeWorldKeepAlive())]);
  });

  it('answers KEEP_ALIVE while entering, too', async () => {
    const { cache, login } = await atJoin();
    cache.push(keepAlive());
    expect(cache.sent.map(hex)).toEqual([expect.any(String), hex(encodeWorldKeepAlive())]);
    expect(login.sent).toHaveLength(1); // nothing went to the login server
  });

  it('pings the login server every 10 s from the moment it takes the channel over, and stops on leave', async () => {
    const { session, clock, login } = await playing(); // made at 1000, entered at 2000
    const before = login.sent.length;
    clock.advance(8999);
    expect(login.sent).toHaveLength(before);
    clock.advance(1);
    expect(login.sent).toHaveLength(before + 1);
    expect(hex(login.sent.at(-1)!)).toBe(hex(encodePing(11000)));
    clock.advance(10000);
    expect(login.sent).toHaveLength(before + 2);
    expect(hex(login.sent.at(-1)!)).toBe(hex(encodePing(21000)));
    session.leave();
    clock.advance(60000);
    expect(login.sent).toHaveLength(before + 2);
    expect(clock.pending()).toBe(0);
  });

  it('keeps pinging while it waits to enter', async () => {
    const { clock, login } = await atJoin();
    clock.advance(10000 - 1000);
    expect(login.sent.map(typeOfClientBody)).toEqual([PacketType.PRE_JOIN, PacketType.PING]);
  });

  it('ignores the login server\'s PING and its other known packets', async () => {
    const { login, events } = await playing();
    login.push(new ArWriter().u32(PacketType.PING).u32(5).toBytes());
    login.push(new ArWriter().u32(PacketType.ONE_HOUR_NOTIFY).toBytes());
    expect(events.map((e) => e.type)).toEqual(['entered']);
  });
});

describe('WorldSession, sending while playing', () => {
  it('sends PLAYERMOVED, PLAYERBEHAVIOR and DESTPOS to the cache server', async () => {
    const { session, cache } = await playing();
    session.sendMoved(MOVE);
    session.sendBehavior(MOVE);
    session.sendDestPos([9, 8, 7], true);
    expect(cache.sent.slice(1).map(hex)).toEqual([
      hex(encodePlayerMoved(MOVE)), hex(encodePlayerBehavior(MOVE)), hex(encodeDestPos([9, 8, 7], true)),
    ]);
  });

  it('sends nothing before the world is entered', async () => {
    const { session, cache } = await atJoin();
    const sent = cache.sent.length;
    session.sendMoved(MOVE);
    session.sendBehavior(MOVE);
    session.sendDestPos([9, 8, 7], false);
    expect(cache.sent).toHaveLength(sent);
  });

  it('sends nothing after an ending or leave', async () => {
    const a = await playing();
    a.session.leave();
    const b = await playing();
    b.cache.drop(1006);
    for (const { session, cache } of [a, b]) {
      const sent = cache.sent.length;
      session.sendMoved(MOVE);
      session.sendBehavior(MOVE);
      session.sendDestPos([1, 2, 3], true);
      expect(cache.sent).toHaveLength(sent);
    }
  });
});

describe('WorldSession, timeouts', () => {
  it('PRE_JOIN timeout: 15 s without an answer ends the session', async () => {
    const { clock, events, login, cache } = await atPreJoin();
    clock.advance(14999);
    expect(events).toEqual([]);
    clock.advance(1);
    expect(events).toEqual([{ type: 'ended', message: 'The server did not answer in time.' }]);
    expect(cache.closed && login.closed).toBe(true);
  });

  it('PRE_JOIN\'s 15 s run from sending it, after the pause', async () => {
    const { clock, events } = await started();
    clock.advance(1000 + 14999);
    expect(events).toEqual([]);
    clock.advance(1);
    expect(ended(events)).toHaveLength(1);
  });

  it('JOIN timeout: 25 s without an answer ends the session', async () => {
    const { clock, events, login, cache } = await atJoin();
    clock.advance(24999);
    expect(events).toEqual([]);
    clock.advance(1);
    expect(events).toEqual([{ type: 'ended', message: 'The server did not answer in time.' }]);
    expect(cache.closed && login.closed).toBe(true);
  });

  it('the answer to PRE_JOIN stops its timer, and the JOIN bundle stops the JOIN timer', async () => {
    const { clock, events } = await playing();
    clock.advance(60000);
    expect(events.map((e) => e.type)).toEqual(['entered']);
  });
});

describe('WorldSession, endings', () => {
  it('the cache channel closing during JOIN gives the wait-a-moment text', async () => {
    const { cache, login, events } = await atJoin();
    cache.drop(4002);
    expect(events).toEqual([{
      type: 'ended',
      message: 'The game closed the connection. If this character was still in the game from an earlier session, wait a moment and try again.',
    }]);
    expect(cache.closed && login.closed).toBe(true);
  });

  it.each([1000, 1006, 4002])('either channel closing later ends with the lost text (code %i)', async (code) => {
    for (const which of ['cache', 'login'] as const) {
      const s = await playing();
      s[which].drop(code);
      expect(s.events.slice(1), which).toEqual([{ type: 'ended', message: 'The connection to the game was lost.' }]);
      expect(s.cache.closed && s.login.closed, which).toBe(true);
    }
  });

  it('the login channel closing during JOIN is the lost text, not the wait-a-moment text', async () => {
    const { login, events } = await atJoin();
    login.drop(4002);
    expect(events).toEqual([{ type: 'ended', message: 'The connection to the game was lost.' }]);
  });

  it('a cache channel closing before JOIN was sent is the lost text', async () => {
    const { cache, events, clock } = await started();
    cache.drop(4002);
    clock.advance(1000);
    expect(events).toEqual([{ type: 'ended', message: 'The connection to the game was lost.' }]);
  });

  it('a close with one of the gateway\'s own codes uses the lobby\'s text', async () => {
    const a = await atJoin();
    a.cache.drop(4001);
    expect(a.events).toEqual([{ type: 'ended', message: 'The game server is not reachable. Try again later.' }]);
    const b = await playing();
    b.login.drop(4008);
    expect(b.events.at(-1)).toEqual({
      type: 'ended', message: 'Too many connection attempts from your network. Wait a minute and try again.',
    });
  });

  it('REPLACE to another world ends the session', async () => {
    const { cache, login, events } = await playing();
    cache.push(replacePacket(2));
    expect(events.slice(1)).toEqual([{ type: 'ended', message: "Moving to another map isn't supported yet." }]);
    expect(cache.closed && login.closed).toBe(true);
  });

  it('a REPLACE message to another world inside a bundle ends the session', async () => {
    const { cache, events } = await playing();
    cache.push(snapshot([writeSetPos(OWN, [1, 2, 3]), writeReplace(NULL_ID, 2, [5, 6, 7])]));
    expect(events.slice(1)).toEqual([{ type: 'ended', message: "Moving to another map isn't supported yet." }]);
  });

  it('a REPLACE message to another world inside the JOIN bundle ends the session without entering', async () => {
    const { cache, events } = await atJoin();
    cache.push(joinBundle([writeReplace(NULL_ID, 2, [5, 6, 7])]));
    expect(events).toEqual([{ type: 'ended', message: "Moving to another map isn't supported yet." }]);
  });

  it('REPLACE to the same world is passed on as a message', async () => {
    const { cache, events } = await playing();
    cache.push(replacePacket(FLARIS, [5, 6, 7]));
    cache.push(snapshot([writeReplace(NULL_ID, FLARIS, [8, 9, 10])]));
    expect(events.map((e) => e.type)).toEqual(['entered', 'messages', 'messages']);
    expect((events[1] as EventOf<'messages'>).messages).toEqual([
      { objectId: NULL_ID, type: MessageType.REPLACE, value: { type: 'replace', worldId: FLARIS, pos: [5, 6, 7] } },
    ]);
    expect((events[2] as EventOf<'messages'>).messages).toEqual([
      { objectId: NULL_ID, type: MessageType.REPLACE, value: { type: 'replace', worldId: FLARIS, pos: [8, 9, 10] } },
    ]);
  });

  it('REPLACE compares with the world the session entered, not the one it asked for', async () => {
    const { cache, events } = await atJoin();
    cache.push(encodeBundle(PacketType.JOIN, OWN, [writeWorldReadInfo(OWN, 6, POS), writeAddSelf(OWN, SELF)]));
    cache.push(replacePacket(FLARIS)); // the world the character list named, no longer this one
    expect(events.map((e) => e.type)).toEqual(['entered', 'ended']);
  });

  it('an ERROR from the login server ends with the lobby\'s text for its code', async () => {
    const { login, cache, events } = await atPreJoin();
    login.push(errorPacket(108));
    expect(events).toEqual([{ type: 'ended', message: 'Server capacity has been reached.' }]);
    expect(cache.closed && login.closed).toBe(true);
  });

  it('an ERROR from the cache server ends with the lobby\'s text for its code', async () => {
    const { login, cache, events } = await playing();
    cache.push(errorPacket(119));
    expect(events.slice(1)).toEqual([{ type: 'ended', message: 'This account is banned. Contact FlyFF Support for assistance.' }]);
    expect(cache.closed && login.closed).toBe(true);
  });

  it('a code with no text shows its number', async () => {
    const { cache, events } = await atJoin();
    cache.push(errorPacket(4242));
    expect(events).toEqual([{ type: 'ended', message: 'Error 4242' }]);
  });

  it('a broken table ends with bad data', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { cache, login, events } = await atJoin();
    const bundle = joinBundle();
    bundle[bundle.length - 6] ^= 0xff; // the trailer's count no longer equals the header's
    cache.push(bundle);
    expect(events).toEqual([{ type: 'ended', message: 'The server sent data the game could not read.' }]);
    expect(cache.closed && login.closed).toBe(true);
  });

  it('a broken table in a later bundle ends the session with bad data', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { cache, events } = await playing();
    const bundle = snapshot([writeSetPos(OWN, [1, 2, 3])]);
    bundle[bundle.length - 6] ^= 0xff;
    cache.push(bundle);
    expect(events.slice(1)).toEqual([{ type: 'ended', message: 'The server sent data the game could not read.' }]);
  });

  it('a packet a decoder rejects ends the session with bad data', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = await atJoin();
    a.cache.push(new ArWriter().u32(PacketType.KEEP_ALIVE).u32(1).toBytes()); // a KEEP_ALIVE with a body
    expect(a.events).toEqual([{ type: 'ended', message: 'The server sent data the game could not read.' }]);
    const b = await atJoin();
    b.login.push(new Uint8Array([1, 2])); // shorter than a packet type
    expect(b.events).toEqual([{ type: 'ended', message: 'The server sent data the game could not read.' }]);
  });

  it('closes every channel before it tells anyone', async () => {
    const a = await atPreJoin();
    a.clock.advance(15000);
    const b = await atJoin();
    b.cache.drop(4002);
    const c = await playing();
    c.cache.push(replacePacket(9));
    const d = await playing();
    d.login.push(errorPacket(108));
    for (const s of [a, b, c, d]) expect(s.closedBeforeEnd).toEqual([true]);
  });

  it('says it once, and nothing after: later packets, timers, drops and sends do nothing', async () => {
    const { net, cache, login, events, clock, session } = await playing();
    cache.drop(4002);
    expect(ended(events)).toHaveLength(1);
    const sent = [cache.sent.length, login.sent.length];
    cache.push(joinBundle());
    cache.push(keepAlive());
    cache.push(replacePacket(3));
    cache.push(errorPacket(108));
    login.push(errorPacket(108));
    login.push(preJoinAnswer());
    login.drop(1006);
    cache.drop(1006);
    clock.advance(120000);
    await flushMicrotasks(); // the fakes report the close the session asked for
    session.sendMoved(MOVE);
    session.leave();
    expect(events.map((e) => e.type)).toEqual(['entered', 'ended']);
    expect([cache.sent.length, login.sent.length]).toEqual(sent);
    expect(clock.pending()).toBe(0);
    expect(net.targets).toEqual([LOGIN_SERVER, CACHE_SERVER]);
  });

  it('a name the wire cannot carry ends the session before anything is opened', async () => {
    const s = setup({ ...CHARACTER, name: 'Zoë' });
    const { session, login } = await s.make();
    await session.start();
    expect(s.events).toEqual([{ type: 'ended', message: 'Something went wrong. Please try again.' }]);
    expect(login.closed).toBe(true);
    expect(s.net.targets).toEqual([LOGIN_SERVER]);
  });
});

describe('WorldSession, the login channel from the start', () => {
  it('takes the login channel\'s packets and close as soon as it is made', async () => {
    const s = setup();
    const { login } = await s.make();
    login.push(errorPacket(108)); // before start()
    expect(s.events).toEqual([{ type: 'ended', message: 'Server capacity has been reached.' }]);
    const t = setup();
    const { login: other } = await t.make();
    other.drop(4002);
    expect(t.events).toEqual([{ type: 'ended', message: 'The connection to the game was lost.' }]);
  });
});

describe('WorldSession, leaving', () => {
  it('leave closes both channels and emits nothing', async () => {
    const { session, cache, login, events, clock } = await playing();
    session.leave();
    expect(cache.closed && login.closed).toBe(true);
    await flushMicrotasks();
    clock.advance(60000);
    expect(events.map((e) => e.type)).toEqual(['entered']);
  });

  it('leave during the 1 s pause sends nothing later', async () => {
    const { session, clock, cache, login, events } = await started();
    clock.advance(500);
    session.leave();
    expect(cache.closed && login.closed).toBe(true);
    clock.advance(60000);
    await flushMicrotasks();
    expect(login.sent).toEqual([]);
    expect(cache.sent).toEqual([]);
    expect(events).toEqual([]);
    expect(clock.pending()).toBe(0);
  });

  it('leave while the cache channel is still opening closes it when it arrives', async () => {
    const s = setup();
    const gate = gated(s.net);
    const { session, login } = await s.make(gate.open);
    const starting = session.start();
    session.leave();
    expect(login.closed).toBe(true);
    gate.release();
    await starting;
    expect(s.net.channel(CACHE_SERVER).closed).toBe(true);
    s.clock.advance(60000);
    expect(login.sent).toEqual([]);
    expect(s.events).toEqual([]);
  });

  it('a cache server that cannot be opened ends with the gateway text', async () => {
    const s = setup();
    const { session, login } = await s.make(() => Promise.reject(new Error('no gateway')));
    await session.start();
    expect(s.events).toEqual([{ type: 'ended', message: 'Cannot reach the game gateway.' }]);
    expect(login.closed).toBe(true);
    expect(s.closedBeforeEnd).toEqual([true]);
  });

  it('answers that arrive after leave are ignored', async () => {
    const { session, login, cache, events, clock } = await atPreJoin();
    session.leave();
    const sent = [login.sent.length, cache.sent.length];
    login.push(preJoinAnswer()); // would send JOIN
    login.push(errorPacket(108));
    cache.push(joinBundle());
    cache.push(keepAlive());
    cache.push(replacePacket(2));
    cache.push(errorPacket(108));
    login.drop(4002);
    cache.drop(4002);
    clock.advance(120000); // neither timeout fires
    await flushMicrotasks();
    expect(events).toEqual([]);
    expect([login.sent.length, cache.sent.length]).toEqual(sent);
  });

  it('leave twice is harmless', async () => {
    const { session, events } = await playing();
    session.leave();
    session.leave();
    expect(events.map((e) => e.type)).toEqual(['entered']);
  });

  it('start after leave opens nothing', async () => {
    const s = setup();
    const { session } = await s.make();
    session.leave();
    await session.start();
    expect(s.net.targets).toEqual([LOGIN_SERVER]);
  });

  it('a second start does nothing', async () => {
    const { session, net, clock, login } = await started();
    await session.start();
    clock.advance(1000);
    expect(net.targets).toEqual([LOGIN_SERVER, CACHE_SERVER]);
    expect(login.sent.map(typeOfClientBody)).toEqual([PacketType.PRE_JOIN]);
  });

  it('a listener that throws does not end the session, nor count as bad data', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const s = setup();
    const { session, login } = await s.make(s.net.open, () => {
      throw new Error('the screen broke');
    });
    await session.start();
    const cache = s.net.channel(CACHE_SERVER);
    s.clock.advance(1000);
    login.push(preJoinAnswer());
    cache.push(joinBundle());
    cache.push(snapshot([writeSetPos(OWN, [1, 2, 3])]));
    expect(s.events.map((e) => e.type)).toEqual(['entered', 'messages']);
    expect(error).toHaveBeenCalledTimes(2);
    s.clock.advance(60000); // no timeout either
    expect(s.events).toHaveLength(2);
  });
});

describe('WorldSession, statistics and logging', () => {
  it('stats count indexed, skipped and mismatched', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { cache, session, events } = await atJoin();
    expect(session.stats).toEqual({ bundles: 0, indexed: 0, skipped: 0, mismatched: 0, unknownPackets: 0 });
    // An indexed JOIN bundle: one message nothing reads, one whose reader does not end where the message does.
    cache.push(joinBundle([unknownMessage(), longDestPos()]));
    expect(session.stats).toEqual({ bundles: 1, indexed: 1, skipped: 1, mismatched: 1, unknownPackets: 0 });
    // Without a table the bundle ends at the first type nothing reads.
    cache.push(snapshot([writeSetPos(OWN, [1, 2, 3]), unknownMessage(), writeSetPos(OWN, [4, 5, 6])], { index: false }));
    expect(session.stats).toEqual({ bundles: 2, indexed: 1, skipped: 2, mismatched: 1, unknownPackets: 0 });
    cache.push(snapshot([longDestPos(), writeSetPos(OWN, [7, 8, 9])]));
    expect(session.stats).toEqual({ bundles: 3, indexed: 2, skipped: 2, mismatched: 2, unknownPackets: 0 });
    // The messages that could be read went on.
    expect((events[0] as EventOf<'entered'>).messages.map((m) => m.value.type)).toEqual(['worldReadInfo', 'addMover']);
    expect((events[1] as EventOf<'messages'>).messages.map((m) => m.value.type)).toEqual(['setPos']);
    expect((events[2] as EventOf<'messages'>).messages.map((m) => m.value.type)).toEqual(['setPos']);
    // A type is named once per session: DESTPOS (mismatched twice) and 0x7777 (where the bundle stopped).
    expect(warn.mock.calls.map((call) => String(call[0]))).toEqual([
      expect.stringContaining('0x00c1'),
      expect.stringContaining('0x7777'),
    ]);
  });

  it('counts and logs an unknown top-level packet type once per session', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { cache, login, session, events } = await playing();
    const other = () => new ArWriter().u32(0x1234).toBytes();
    cache.push(other());
    cache.push(other());
    cache.push(new ArWriter().u32(0x5678).toBytes());
    expect(session.stats.unknownPackets).toBe(3);
    expect(session.stats.bundles).toBe(1);
    expect(warn.mock.calls.map((call) => String(call[0]))).toEqual([
      expect.stringContaining('0x00001234'),
      expect.stringContaining('0x00005678'),
    ]);
    // An unknown packet from the login server is logged too, once.
    login.push(new ArWriter().u32(0x4321).toBytes());
    login.push(new ArWriter().u32(0x4321).toBytes());
    expect(warn).toHaveBeenCalledTimes(3);
    expect(events.map((e) => e.type)).toEqual(['entered']); // none of them ends the session
  });

  it('a message that is skipped in an indexed bundle is counted but not logged', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { cache, session } = await playing();
    cache.push(snapshot([unknownMessage(), unknownMessage(0x7778)]));
    expect(session.stats.skipped).toBe(2);
    expect(warn).not.toHaveBeenCalled();
  });
});

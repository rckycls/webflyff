import { ArWriter, NULL_ID, PacketType } from '@flyffweb/protocol';
import type { FlowClock } from '../../src/lobby/LoginFlow';
import type { OpenChannel, PacketChannel } from '../../src/net/PacketChannel';

/** A `PacketChannel` the test drives by hand: it records what the flow sends and delivers what the test pushes. */
export interface FakeChannel extends PacketChannel {
  /** Every body the flow sent, in order. */
  sent: Uint8Array[];
  /** True once the flow called `close()`. */
  closed: boolean;
  /** Delivers a body as if the server had sent it. */
  push(body: Uint8Array): void;
  /** Ends the channel from the other side with a close code, like the gateway or the network would. */
  drop(code: number): void;
}

export interface FakeChannels {
  open: OpenChannel;
  /** The channel most recently opened for `target`; throws when nothing was opened for it. */
  channel(target: string): FakeChannel;
}

export function fakeChannels(): FakeChannels {
  const opened = new Map<string, FakeChannel>();
  const open: OpenChannel = (target) => {
    const channel: FakeChannel = {
      sent: [],
      closed: false,
      onPacket: () => {},
      onClose: () => {},
      send(body) {
        channel.sent.push(body);
      },
      close() {
        channel.closed = true;
        // A real WebSocket reports its own close afterwards; the flow has to ignore that one.
        queueMicrotask(() => channel.onClose(1000));
      },
      push(body) {
        channel.onPacket(body);
      },
      drop(code) {
        channel.onClose(code);
      },
    };
    opened.set(target, channel);
    return Promise.resolve(channel);
  };
  return {
    open,
    channel(target) {
      const channel = opened.get(target);
      if (channel === undefined) throw new Error(`no channel was opened for ${target}`);
      return channel;
    },
  };
}

/** A clock whose time only moves when the test calls `advance`. */
export interface FakeClock extends FlowClock {
  advance(ms: number): void;
}

export function fakeClock(start: number): FakeClock {
  let time = start;
  let nextId = 1;
  const timers = new Map<number, { due: number; run: () => void }>();
  return {
    setTimeout: ((run: () => void, ms = 0) => {
      const id = nextId++;
      timers.set(id, { due: time + ms, run });
      return id;
    }) as unknown as typeof setTimeout,
    clearTimeout: ((id: number) => {
      timers.delete(id);
    }) as unknown as typeof clearTimeout,
    now: () => time,
    advance(ms) {
      const until = time + ms;
      for (;;) {
        // Earliest due timer first; a timer may add or clear others, so look again after each one.
        let next: [number, { due: number; run: () => void }] | undefined;
        for (const entry of timers) if (entry[1].due <= until && (next === undefined || entry[1].due < next[1].due)) next = entry;
        if (next === undefined) break;
        timers.delete(next[0]);
        time = Math.max(time, next[1].due);
        next[1].run();
      }
      time = until;
    },
  };
}

/** SRVR_LIST with the account echo and auth key: server `FlyFF` (id 1) and its `Channel 1` (id 1, enabled, max 500). */
export function serverListFor(account: string, authKey: number): Uint8Array {
  return new ArWriter().u32(PacketType.SRVR_LIST).u32(authKey).u8(0).string(account).u32(2)
    .u32(NULL_ID).u32(1).string('FlyFF').string('172.31.238.55').i32(0).i32(0).i32(1).i32(0)
    .u32(1).u32(1).string('Channel 1').string('').i32(1).i32(12).i32(1).i32(500).toBytes();
}

/** PLAYER_LIST with one character (slot 0, player 500, name `Webby`) and a slot-0 messenger holding friend 900. */
export function playerListFor(authKey: number): Uint8Array {
  return new ArWriter().u32(PacketType.PLAYER_LIST).u32(authKey).i32(1)
    .i32(0).i32(0).u32(1).u32(11).string('Webby').vec3([6968, 100, 3328])
    .u32(500).u32(0).u32(0).u32(0).u32(0).u32(2).u32(0xff907b6d).u32(1).u8(0).i32(0).i32(15).u32(0)
    .i32(15).i32(15).i32(15).i32(15).u32(0).i32(2).u32(502).u32(503)
    .i32(1).u8(0).u32(0).i32(1).u32(900).i32(0).u32(1).toBytes();
}

/** The packet type of a body the client sent to the login server: the `u32` after `DPID_UNKNOWN`. */
export function typeOfClientBody(body: Uint8Array): number {
  return new DataView(body.buffer, body.byteOffset, body.byteLength).getUint32(4, true);
}

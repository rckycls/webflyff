import net from 'node:net';
import type { WebSocket } from 'ws';
import {
  ArWriter, CloseCode, DPID_UNKNOWN, PacketType, ProtocolError, ServerFrameReader, encodeClientFrame,
  encodeGatewayClientAddr, readProtocolId,
} from '@flyffweb/protocol';
import { normalizeIPv4 } from './clientAddress';
import type { Limits, RouteTarget } from './config';
import { RateWindow } from './limits';

/** The close code for a connection that ended without a close frame. */
const ABNORMAL_CLOSURE = 1006;

export interface RelayOptions {
  route: RouteTarget;
  /**
   * The player's real IPv4 address (dotted, no IPv6 form), sent to certifier and cache routes when `sendClientAddr`
   * is on.
   */
  clientAddress: string;
  sendClientAddr: boolean;
  limits: Limits;
}

export interface RelayResult {
  /**
   * The code the connection ended with: one of `CloseCode` when the gateway ended it, otherwise the code the
   * browser closed with (1005 when it gave none), or the one `ws` closed it with after a message it could not take
   * (1007, 1009), or 1006 when the browser vanished or stopped answering pings.
   */
  closeCode: number;
  /** Packet body bytes passed from the browser to the server. Not counted: frame headers, the client address. */
  bytesUp: number;
  /** Packet body bytes passed from the server to the browser. Not counted: frame headers, the protocol ID. */
  bytesDown: number;
}

/**
 * True for a body whose packet type is the one only the gateway may send (`GATEWAY_CLIENT_ADDR`). Certifier
 * packets start with the type; login-server packets start with `DPID_UNKNOWN` and then the type, so both
 * positions are looked at, on every route.
 */
function isClientAddrPacket(body: Uint8Array): boolean {
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const typeAt = (offset: number): boolean =>
    body.byteLength >= offset + 4 && view.getUint32(offset, true) === PacketType.GATEWAY_CLIENT_ADDR;
  return typeAt(0) || typeAt(4);
}

/**
 * The client-address packet as the route's server reads it. The certifier reads the type first
 * (`CDPCertifier::UserMessageHandler`, Source/CERTIFIER/DPCertifier.cpp:170). The cache server skips a sender ID
 * before the type (`CDPCacheSrvr::UserMessageHandler`, Source/CACHESERVER/DPCacheSrvr.cpp:82), so there it goes
 * after `DPID_UNKNOWN`, like every packet Neuz sends it (`BEFORESENDSOLE`).
 */
function clientAddrPacket(role: 'certifier' | 'cache', address: string): Uint8Array {
  const packet = encodeGatewayClientAddr(address);
  return role === 'cache' ? new ArWriter().u32(DPID_UNKNOWN).bytes(packet).toBytes() : packet;
}

/**
 * The code `ws` closes the connection with after an error in what it received (1002 protocol error, 1007 text that
 * is not UTF-8, 1009 message too big). `ws` keeps it in a symbol property of the error. Its 'close' event cannot
 * tell: it reports the code of a close frame it received, and after such an error that is 1006.
 */
function closeCodeOfWsError(error: Error): number {
  for (const key of Object.getOwnPropertySymbols(error)) {
    const value = (error as unknown as Record<symbol, unknown>)[key];
    if (key.description === 'status-code' && typeof value === 'number') return value;
  }
  return ABNORMAL_CLOSURE;
}

/**
 * Pairs one open WebSocket with one new TCP connection to a FlyFF server and relays packets between them. Each
 * binary WebSocket message is one packet body, framed for the server on the way out; each server frame is
 * unframed into one message on the way back.
 *
 * - The server's first body is its protocol ID, which the client frames' checksums need. The relay reads it and
 *   never passes it on. Browser packets that arrive earlier are held (`maxHeldPackets`) and sent after it.
 * - On a certifier or cache route with `sendClientAddr`, the first packet sent is the client address (spec section
 *   5; the cache server's in the piece 3 spec, section 3.3).
 * - The connection ends, with the matching `CloseCode`, when the TCP connection fails or the server's protocol ID
 *   has not arrived `connectTimeoutMs` after the call (4001; the real servers send it as soon as they accept), the
 *   server ends it (4002), the server sends bytes that are not frames or a first packet that is not a protocol ID
 *   (4005), or the browser sends a text message or a client-address packet (4006), a packet over `maxPacketBytes`,
 *   more than `maxPacketsPerSecond` packets, or too many before the protocol ID (4004). When the browser leaves
 *   first, the TCP connection is destroyed.
 * - A browser that sleeps leaves a WebSocket that never closes: every `pingIntervalMs` the relay pings it, and if no
 *   pong comes within `pongTimeoutMs` of the first unanswered ping, the WebSocket is terminated and, with it, the
 *   TCP connection, so the server does not keep the session.
 *
 * Throws, before anything is opened, when `clientAddress` is not a dotted IPv4 address. It writes no log: the
 * caller knows the address and the route and, from `done`, the code and the byte counts.
 *
 * `done` resolves once the connection is over and the TCP socket is gone.
 */
export function startRelay(ws: WebSocket, opts: RelayOptions): { done: Promise<RelayResult> } {
  const { route, limits } = opts;
  if (normalizeIPv4(opts.clientAddress) !== opts.clientAddress) {
    // It goes into a packet when the protocol ID arrives; a bad value must not wait to throw inside a socket listener.
    throw new Error(`clientAddress must be a dotted IPv4 address, not ${JSON.stringify(opts.clientAddress)}`);
  }
  const reader = new ServerFrameReader(limits.maxServerBodyBytes);
  const rate = new RateWindow(limits.maxPacketsPerSecond);
  /** Browser bodies that came before the protocol ID, oldest first. */
  const held: Uint8Array[] = [];
  let protocolId: number | undefined;
  let connected = false;
  let finished = false;
  let closeCode: number = CloseCode.SERVER_CLOSED;
  let bytesUp = 0;
  let bytesDown = 0;

  ws.binaryType = 'nodebuffer';
  const tcp = net.connect({ host: route.host, port: route.port });
  tcp.setNoDelay(true); // small packets in both directions; a game does not wait for Nagle

  let resolveDone!: (result: RelayResult) => void;
  const done = new Promise<RelayResult>((resolve) => { resolveDone = resolve; });

  // The timers are made before `finish`, which clears them, so that it never reads one that is not made yet. They
  // only fire later, when `finish` exists too.
  /** Runs until the server's protocol ID has arrived. */
  const connectTimer = setTimeout(() => finish(CloseCode.SERVER_UNREACHABLE), limits.connectTimeoutMs);
  let pongTimer: NodeJS.Timeout | undefined;
  const pingTimer = setInterval(() => {
    if (ws.readyState !== ws.OPEN) return;
    ws.ping();
    // Runs from the first ping that gets no answer, and is cancelled by any pong.
    pongTimer ??= setTimeout(() => {
      finish(ABNORMAL_CLOSURE, false); // nobody is listening for a close code
      ws.terminate();
    }, limits.pongTimeoutMs);
  }, limits.pingIntervalMs);

  /**
   * Ends the connection with `code`: the TCP socket is destroyed, and the WebSocket is closed with `code`
   * unless the browser's side is the one that already ended. Only the first call has any effect.
   */
  const finish = (code: number, closeWebSocket = true): void => {
    if (finished) return;
    finished = true;
    closeCode = code;
    clearTimeout(connectTimer);
    clearInterval(pingTimer);
    clearTimeout(pongTimer);
    held.length = 0;
    tcp.destroy();
    if (closeWebSocket && ws.readyState === ws.OPEN) ws.close(code);
  };

  /** Passes a browser body to the server. Only once the protocol ID is known. */
  const forward = (body: Uint8Array): void => {
    tcp.write(encodeClientFrame(body, protocolId!));
    bytesUp += body.byteLength;
  };

  const onServerBody = (body: Uint8Array): void => {
    if (protocolId !== undefined) {
      ws.send(body, { binary: true });
      bytesDown += body.byteLength;
      return;
    }
    // The first body of a connection: the protocol ID, which is not for the browser.
    protocolId = readProtocolId(body);
    if (protocolId === undefined) {
      finish(CloseCode.BAD_SERVER_DATA);
      return;
    }
    clearTimeout(connectTimer);
    if (opts.sendClientAddr && (route.role === 'certifier' || route.role === 'cache')) {
      tcp.write(encodeClientFrame(clientAddrPacket(route.role, opts.clientAddress), protocolId));
    }
    for (const early of held.splice(0)) forward(early);
  };

  tcp.once('connect', () => { connected = true; });
  tcp.on('data', (chunk: Buffer) => {
    if (finished) return;
    let bodies: Uint8Array[];
    try {
      bodies = reader.push(chunk);
    } catch (error) {
      if (!(error instanceof ProtocolError)) throw error;
      finish(CloseCode.BAD_SERVER_DATA);
      return;
    }
    for (const body of bodies) {
      if (finished) return;
      onServerBody(body);
    }
  });
  // Whatever way the server's side ends (an error, a clean end, even in the middle of a frame), that is the end:
  // a socket that cannot connect says so with an error, any other end shows as 'close'.
  tcp.on('error', () => finish(connected ? CloseCode.SERVER_CLOSED : CloseCode.SERVER_UNREACHABLE));
  tcp.on('close', () => {
    finish(CloseCode.SERVER_CLOSED);
    resolveDone({ closeCode, bytesUp, bytesDown });
  });

  ws.on('message', (data, isBinary) => {
    if (finished) return;
    if (!rate.allow()) {
      finish(CloseCode.LIMIT);
      return;
    }
    if (!isBinary) {
      finish(CloseCode.FORBIDDEN_PACKET);
      return;
    }
    const body = data as Buffer; // `binaryType` is 'nodebuffer'
    if (body.byteLength > limits.maxPacketBytes) {
      finish(CloseCode.LIMIT);
    } else if (isClientAddrPacket(body)) {
      finish(CloseCode.FORBIDDEN_PACKET);
    } else if (protocolId !== undefined) {
      forward(body);
    } else if (held.length < limits.maxHeldPackets) {
      held.push(new Uint8Array(body)); // a copy, so nothing else keeps the whole network chunk alive
    } else {
      finish(CloseCode.LIMIT);
    }
  });
  ws.on('pong', () => {
    clearTimeout(pongTimer);
    pongTimer = undefined;
  });
  // The browser left, or its connection broke or sent what `ws` will not take: the server side goes too. After an
  // error `ws` has sent its own close code and then reports 1006, so the code is taken from the error.
  ws.on('error', (error) => finish(closeCodeOfWsError(error), false));
  ws.on('close', (code) => finish(code, false));

  return { done };
}

import net from 'node:net';
import type { WebSocket } from 'ws';
import {
  CloseCode, PacketType, ProtocolError, ServerFrameReader, encodeClientFrame, encodeGatewayClientAddr, readProtocolId,
} from '@flyffweb/protocol';
import type { Limits, RouteTarget } from './config';
import type { Logger } from './log';

export interface RelayOptions {
  route: RouteTarget;
  /** The `address:port` the browser asked for; for log lines. */
  routeKey: string;
  /** The player's real IPv4 address, sent to certifier routes when `sendClientAddr` is on. */
  clientAddress: string;
  sendClientAddr: boolean;
  limits: Limits;
  /** The relay itself writes nothing to it, and never packet contents; the server around it logs open and close. */
  log: Logger;
}

export interface RelayResult {
  /**
   * The code the connection ended with: one of `CloseCode` when the gateway ended it, otherwise the code the
   * browser closed with (1005 when it gave none, 1006 when it vanished).
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
 * Pairs one open WebSocket with one new TCP connection to a FlyFF server and relays packets between them. Each
 * binary WebSocket message is one packet body, framed for the server on the way out; each server frame is
 * unframed into one message on the way back.
 *
 * - The server's first body is its protocol ID, which the client frames' checksums need. The relay reads it and
 *   never passes it on. Browser packets that arrive earlier are held (`maxHeldPackets`) and sent after it.
 * - On a certifier route with `sendClientAddr`, the first packet sent is the client address (spec section 5).
 * - The connection ends, with the matching `CloseCode`, when the TCP connection fails or does not complete in
 *   `connectTimeoutMs` (4001), the server ends it (4002), the server sends bytes that are not frames or a first
 *   packet that is not a protocol ID (4005), or the browser sends a text message or a client-address packet
 *   (4006), a packet over `maxPacketBytes`, or too many before the protocol ID (4004). When the browser leaves
 *   first, the TCP connection is destroyed.
 *
 * `done` resolves once the connection is over and the TCP socket is gone.
 */
export function startRelay(ws: WebSocket, opts: RelayOptions): { done: Promise<RelayResult> } {
  const { route, limits } = opts;
  const reader = new ServerFrameReader(limits.maxServerBodyBytes);
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

  /**
   * Ends the connection with `code`: the TCP socket is destroyed, and the WebSocket is closed with `code`
   * unless the browser's side is the one that already ended. Only the first call has any effect.
   */
  const finish = (code: number, closeWebSocket = true): void => {
    if (finished) return;
    finished = true;
    closeCode = code;
    clearTimeout(connectTimer);
    held.length = 0;
    tcp.destroy();
    if (closeWebSocket && ws.readyState === ws.OPEN) ws.close(code);
  };

  const connectTimer = setTimeout(() => finish(CloseCode.SERVER_UNREACHABLE), limits.connectTimeoutMs);

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
    if (opts.sendClientAddr && route.role === 'certifier') {
      tcp.write(encodeClientFrame(encodeGatewayClientAddr(opts.clientAddress), protocolId));
    }
    for (const early of held.splice(0)) forward(early);
  };

  tcp.once('connect', () => {
    connected = true;
    clearTimeout(connectTimer);
  });
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
  // The browser left, or its connection broke (`ws` closes it and reports 'close' next): the server side goes too.
  ws.on('error', () => finish(1006, false));
  ws.on('close', (code) => finish(code, false));

  return { done };
}

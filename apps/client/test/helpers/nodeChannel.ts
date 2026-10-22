import { WebSocket } from 'ws';
import type { OpenChannel, PacketChannel } from '../../src/net/PacketChannel';

export interface NodeChannelOptions {
  /** Sent as the `Origin` header; the gateway refuses an upgrade whose origin it does not list. */
  origin: string;
  /** Sent as `X-Forwarded-For`. The gateway believes it only from a peer in its `trustedProxies`, so a test can play several addresses. */
  forwardedFor?: string;
}

/**
 * `openWebSocketChannel` for Node: a `ws` client that sends the `Origin` and `X-Forwarded-For` headers a browser
 * behind a proxy would. Same contract: each message is one packet body, `open` resolves once the gateway has
 * accepted the connection and rejects when it has not, and `onClose` fires once the connection has ended.
 */
export function openNodeChannel(gatewayUrl: string, opts: NodeChannelOptions): OpenChannel {
  const base = gatewayUrl.replace(/\/+$/, '');
  return (target) => new Promise<PacketChannel>((resolve, reject) => {
    const headers: Record<string, string> = {};
    if (opts.forwardedFor !== undefined) headers['X-Forwarded-For'] = opts.forwardedFor;
    const socket = new WebSocket(`${base}/connect/${target}`, { origin: opts.origin, headers });
    const channel: PacketChannel = {
      send(body) {
        if (socket.readyState === WebSocket.OPEN) socket.send(body);
      },
      close() {
        socket.close();
      },
      onPacket: () => {},
      onClose: () => {},
    };
    let opened = false;
    socket.on('open', () => {
      opened = true;
      resolve(channel);
    });
    socket.on('message', (data: Buffer, isBinary: boolean) => {
      // The gateway sends binary messages only. `new Uint8Array(data)` copies, so a later read of the pooled buffer cannot change it.
      if (isBinary) channel.onPacket(new Uint8Array(data));
    });
    // `ws` reports a refused upgrade (403, 404) as an error and closes after it; an error after the open is followed by the close below.
    socket.on('error', (error) => {
      if (!opened) reject(error);
    });
    socket.on('close', (code) => {
      if (opened) channel.onClose(code);
      else reject(new Error(`the gateway could not be reached (close code ${code})`));
    });
  });
}

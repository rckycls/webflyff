import type { OpenChannel, PacketChannel } from './PacketChannel';

/**
 * The browser's way to reach a game server: one WebSocket per server connection, at
 * `<gatewayUrl>/connect/<address>:<port>`, each binary message one packet body.
 */
export function openWebSocketChannel(gatewayUrl: string): OpenChannel {
  const base = gatewayUrl.replace(/\/+$/, '');
  return (target) => new Promise<PacketChannel>((resolve, reject) => {
    const socket = new WebSocket(`${base}/connect/${target}`);
    socket.binaryType = 'arraybuffer';
    const channel: PacketChannel = {
      // A send after the socket began closing has nowhere to go; the owner learns of the close through `onClose`.
      // `slice()` copies into a plain ArrayBuffer, the only kind `send` accepts; `body`'s type also allows a shared one.
      send(body) {
        if (socket.readyState === WebSocket.OPEN) socket.send(body.slice());
      },
      close() {
        socket.close();
      },
      onPacket: () => {},
      onClose: () => {},
    };
    let opened = false;
    socket.onopen = () => {
      opened = true;
      resolve(channel);
    };
    socket.onmessage = (event) => {
      // The gateway sends binary messages only.
      if (event.data instanceof ArrayBuffer) channel.onPacket(new Uint8Array(event.data));
    };
    socket.onclose = (event) => {
      // A socket that never opened is a gateway that could not be reached, or that refused the upgrade (an origin it
      // does not allow, a path it does not serve); the browser reports both as code 1006.
      if (opened) channel.onClose(event.code);
      else reject(new Error(`the gateway could not be reached (close code ${event.code})`));
    };
  });
}

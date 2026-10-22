import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';
import type { WebSocket as ServerSocket } from 'ws';
import { bytesToHex } from '@flyffweb/protocol';
import { openWebSocketChannel } from '../src/net/webSocketChannel';

// A real ws server on a loopback port stands in for the gateway; Node's own WebSocket plays the browser.
let server: WebSocketServer | undefined;

afterEach(async () => {
  if (server === undefined) return;
  for (const client of server.clients) client.terminate();
  await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = undefined;
});

async function gateway(
  options: { verifyClient?: () => boolean } = {},
): Promise<{ url: string; requests: string[]; connection: Promise<ServerSocket> }> {
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0, ...options });
  server = wss;
  const requests: string[] = [];
  const connection = new Promise<ServerSocket>((resolve) => {
    wss.on('connection', (socket, request) => {
      requests.push(request.url ?? '');
      resolve(socket);
    });
  });
  await once(wss, 'listening');
  return { url: `ws://127.0.0.1:${(wss.address() as AddressInfo).port}`, requests, connection };
}

describe('openWebSocketChannel', () => {
  it('connects to /connect/<address>:<port> and carries one packet body per message, both ways', async () => {
    const { url, requests, connection } = await gateway();
    const channel = await openWebSocketChannel(url)('172.31.238.55:23000');
    const socket = await connection;
    expect(requests).toEqual(['/connect/172.31.238.55:23000']);

    const received: Uint8Array[] = [];
    channel.onPacket = (body) => received.push(body);
    const fromBrowser = new Promise<Uint8Array>((resolve) => socket.once('message', (data: Buffer, isBinary: boolean) => {
      expect(isBinary).toBe(true);
      resolve(new Uint8Array(data));
    }));
    channel.send(new Uint8Array([0xfc, 0, 0, 0, 1, 2, 3]));
    expect(bytesToHex(await fromBrowser)).toBe('fc000000010203');

    socket.send(new Uint8Array([0x18, 0, 0, 0]));
    socket.send(new Uint8Array([0xfd, 0, 0, 0, 9]));
    while (received.length < 2) await new Promise((resolve) => setTimeout(resolve, 5));
    expect(received.map(bytesToHex)).toEqual(['18000000', 'fd00000009']);
    expect(received[0]).toBeInstanceOf(Uint8Array);
  });

  it('reports the close code the gateway ends the connection with', async () => {
    const { url, connection } = await gateway();
    const channel = await openWebSocketChannel(url)('172.31.238.55:23000');
    const closed = new Promise<number>((resolve) => { channel.onClose = resolve; });
    (await connection).close(4002);
    expect(await closed).toBe(4002);
  });

  it('closes the connection when asked to', async () => {
    const { url, connection } = await gateway();
    const channel = await openWebSocketChannel(url)('172.31.238.55:23000');
    const socket = await connection;
    const serverSawClose = new Promise<number>((resolve) => socket.once('close', resolve));
    channel.close();
    expect(await serverSawClose).toBe(1005);
  });

  it('rejects when the gateway cannot be reached', async () => {
    const { url } = await gateway();
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    await expect(openWebSocketChannel(url)('172.31.238.55:23000')).rejects.toThrow();
  });

  it('rejects when the gateway refuses the upgrade, as it does for an origin it does not allow', async () => {
    const { url } = await gateway({ verifyClient: () => false });
    await expect(openWebSocketChannel(url)('172.31.238.55:23000')).rejects.toThrow();
  });
});

import net from 'node:net';
import { afterEach, expect, it } from 'vitest';
import {
  bytesToHex, encodeClientFrame, encodeProtocolIdBody, encodeServerFrame, ServerFrameReader, readProtocolId,
} from '@flyffweb/protocol';
import { startFakeFlyffServer, type FakeFlyffServer } from '@flyffweb/testkit';
import { startCapture, type CaptureHandle } from '../src/capture';

let server: FakeFlyffServer | undefined; let capture: CaptureHandle | undefined;
let other: FakeFlyffServer | undefined; let raw: net.Server | undefined;
afterEach(async () => {
  await capture?.close(); await server?.close(); await other?.close();
  await new Promise<void>((resolve) => (raw ? raw.close(() => resolve()) : resolve()));
  capture = server = other = raw = undefined;
});

it('records the protocol ID, client bodies and server bodies in order', async () => {
  server = await startFakeFlyffServer({ protocolId: 0x1234, onBody: (_b, reply) => reply(new Uint8Array([0xfd, 0, 0, 0])) });
  capture = await startCapture({
    listenHost: '127.0.0.1', targetHost: '127.0.0.1', routes: [{ listenPort: 0, targetPort: server.port }],
    meta: { account: 'acc', password: 'pw', bankPin: '1234' },
  });
  const sock = net.connect(capture.listenPorts[0]!, '127.0.0.1');
  const reader = new ServerFrameReader();
  const bodies: Uint8Array[] = [];
  sock.on('data', (d: Buffer) => bodies.push(...reader.push(new Uint8Array(d))));
  await expect.poll(() => bodies.length).toBe(1);
  sock.write(encodeClientFrame(new Uint8Array([0xfc, 0, 0, 0]), readProtocolId(bodies[0]!)!));
  await expect.poll(() => bodies.length).toBe(2);
  sock.destroy();
  const rec = capture.recording();
  expect(rec.account).toBe('acc');
  expect(rec.packets.map((p) => [p.connection, p.direction, p.hex, p.port])).toEqual([
    [1, 's2c', '0000000034120000', server.port],
    [1, 'c2s', 'fc000000', server.port],
    [1, 's2c', 'fd000000', server.port],
  ]);
  expect(server.crcErrors).toBe(0);
  expect(bytesToHex(server.received[0]!)).toBe('fc000000');
});

const meta = { account: 'acc', password: 'pw', bankPin: '1234' };

/** A client of the capture that decodes server bodies and notes when the capture hangs up. */
function connect(port: number) {
  const socket = net.connect(port, '127.0.0.1');
  const reader = new ServerFrameReader();
  const state = { socket, bodies: [] as Uint8Array[], closed: false };
  socket.on('data', (d: Buffer) => state.bodies.push(...reader.push(d)));
  socket.on('close', () => { state.closed = true; });
  socket.on('error', () => {});
  return state;
}

it('numbers connections across routes, records each against its server port and reports every close', async () => {
  server = await startFakeFlyffServer({ protocolId: 0x11 });
  other = await startFakeFlyffServer({ protocolId: 0x22, onBody: (_b, reply) => reply(new Uint8Array([0xee])) });
  const closed: number[] = [];
  capture = await startCapture({
    listenHost: '127.0.0.1', targetHost: '127.0.0.1', meta, onConnectionClosed: (n) => closed.push(n),
    routes: [{ listenPort: 0, targetPort: server.port }, { listenPort: 0, targetPort: other.port }],
  });
  expect(capture.listenPorts).toHaveLength(2);

  const first = connect(capture.listenPorts[0]!);
  await expect.poll(() => first.bodies.length).toBe(1);
  first.socket.destroy();
  await expect.poll(() => closed).toEqual([1]);

  const second = connect(capture.listenPorts[1]!);
  await expect.poll(() => second.bodies.length).toBe(1);
  second.socket.write(encodeClientFrame(new Uint8Array([0xab]), 0x22));
  await expect.poll(() => second.bodies.length).toBe(2);
  second.socket.destroy();
  await expect.poll(() => closed).toEqual([1, 2]);

  expect(capture.recording().packets.map((p) => [p.connection, p.direction, p.hex, p.port])).toEqual([
    [1, 's2c', '0000000011000000', server.port],
    [2, 's2c', '0000000022000000', other.port],
    [2, 'c2s', 'ab', other.port],
    [2, 's2c', 'ee', other.port],
  ]);
});

it('hangs up on the client when the server drops the connection', async () => {
  server = await startFakeFlyffServer();
  const closed: number[] = [];
  capture = await startCapture({
    listenHost: '127.0.0.1', targetHost: '127.0.0.1', meta, onConnectionClosed: (n) => closed.push(n),
    routes: [{ listenPort: 0, targetPort: server.port }],
  });
  const client = connect(capture.listenPorts[0]!);
  await expect.poll(() => client.bodies.length).toBe(1);
  server.dropClients();
  await expect.poll(() => client.closed).toBe(true);
  await expect.poll(() => closed).toEqual([1]);
});

it('holds client bytes that arrive before the protocol ID and records them after it', async () => {
  // A server that announces its protocol ID only once the client has already sent something.
  raw = net.createServer((socket) => {
    socket.on('error', () => {});
    socket.once('data', () => socket.write(encodeServerFrame(encodeProtocolIdBody(0x1234))));
  });
  await new Promise<void>((resolve) => raw!.listen(0, '127.0.0.1', resolve));
  capture = await startCapture({
    listenHost: '127.0.0.1', targetHost: '127.0.0.1', meta,
    routes: [{ listenPort: 0, targetPort: (raw.address() as net.AddressInfo).port }],
  });
  const client = connect(capture.listenPorts[0]!);
  client.socket.write(encodeClientFrame(new Uint8Array([0xfc, 0, 0, 0]), 0x1234));
  await expect.poll(() => client.bodies.length).toBe(1);
  client.socket.destroy();
  expect(capture.recording().packets.map((p) => [p.direction, p.hex])).toEqual([
    ['s2c', '0000000034120000'],
    ['c2s', 'fc000000'],
  ]);
});

it('keeps relaying, and says so, when it cannot parse what the client sends', async () => {
  server = await startFakeFlyffServer({ protocolId: 0x1234 });
  const lines: string[] = [];
  capture = await startCapture({
    listenHost: '127.0.0.1', targetHost: '127.0.0.1', meta, log: (line) => lines.push(line),
    routes: [{ listenPort: 0, targetPort: server.port }],
  });
  const client = connect(capture.listenPorts[0]!);
  await expect.poll(() => client.bodies.length).toBe(1);
  client.socket.write(encodeClientFrame(new Uint8Array([1, 2, 3]), 0x9999)); // the wrong protocol ID
  await expect.poll(() => server!.crcErrors).toBe(1); // the bytes still reached the server
  expect(lines.filter((line) => line.includes('stopped recording client packets'))).toHaveLength(1);
  expect(capture.recording().packets.map((p) => p.direction)).toEqual(['s2c']);
  expect(lines.join(' ')).not.toContain('010203'); // packet contents stay out of the log
});

it('lets go of its ports on close, and close can be called twice', async () => {
  capture = await startCapture({
    listenHost: '127.0.0.1', targetHost: '127.0.0.1', meta, routes: [{ listenPort: 0, targetPort: 9 }],
  });
  const port = capture.listenPorts[0]!;
  await Promise.all([capture.close(), capture.close()]);
  const again = await startCapture({
    listenHost: '127.0.0.1', targetHost: '127.0.0.1', meta, routes: [{ listenPort: port, targetPort: 9 }],
  });
  expect(again.listenPorts).toEqual([port]);
  await again.close();
});

it('fails to start, and frees the ports it did take, when one is already in use', async () => {
  const taken = net.createServer();
  await new Promise<void>((resolve) => taken.listen(0, '127.0.0.1', resolve));
  const takenPort = (taken.address() as net.AddressInfo).port;
  try {
    await expect(startCapture({
      listenHost: '127.0.0.1', targetHost: '127.0.0.1', meta,
      routes: [{ listenPort: 0, targetPort: 9 }, { listenPort: takenPort, targetPort: 9 }],
    })).rejects.toMatchObject({ code: 'EADDRINUSE' });
  } finally {
    await new Promise<void>((resolve) => taken.close(() => resolve()));
  }
});

import net from 'node:net';
import type { WebSocket } from 'ws';
import { afterEach, expect, it, vi } from 'vitest';
import {
  ArWriter, CloseCode, DPID_UNKNOWN, bytesToHex, encodeGatewayClientAddr, encodeProtocolIdBody, encodeServerFrame,
} from '@flyffweb/protocol';
import { startFakeFlyffServer, type FakeFlyffServerOptions } from '@flyffweb/testkit';
import { DEFAULT_LIMITS } from '../src/config';
import { startRelay, type RelayOptions } from '../src/relay';
import { relayHarness } from './helpers/wsClient';

// Everything a test opens is closed here, newest first: browser and relay before the servers they talk to.
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

type Role = RelayOptions['route']['role'];

async function fakeServer(options?: FakeFlyffServerOptions) {
  const server = await startFakeFlyffServer(options);
  cleanups.push(() => server.close());
  return server;
}

/** Options for a relay to `port` as a `role` route; `sendClientAddr` is off unless a test turns it on. */
function relayOptions(port: number, role: Role, over: Partial<RelayOptions> = {}): RelayOptions {
  return {
    route: { host: '127.0.0.1', port, role },
    clientAddress: '10.0.0.9',
    sendClientAddr: false,
    limits: DEFAULT_LIMITS,
    ...over,
  };
}

async function harness(options: RelayOptions) {
  const h = await relayHarness(options);
  cleanups.push(() => h.close());
  return h;
}

/** A TCP server driven by hand, for what the fake FlyFF server cannot do: raw bytes, half frames, a bad first body. */
async function rawServer(onConnection: (socket: net.Socket) => void) {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    onConnection(socket);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  cleanups.push(
    () => new Promise<void>((resolve) => {
      server.close(() => resolve());
      for (const socket of sockets) socket.destroy();
    }),
  );
  return { port: (server.address() as net.AddressInfo).port };
}

const PROTOCOL_ID = 0x1234;
const idFrame = encodeServerFrame(encodeProtocolIdBody(PROTOCOL_ID));
const hex = (text: string) => Buffer.from(text, 'hex');
const clientAddr = (address: string) => bytesToHex(encodeGatewayClientAddr(address));
const keepAlive = new Uint8Array([0x18, 0, 0, 0]);

it('sends the client address first on certifier routes, then relays both ways', async () => {
  const server = await startFakeFlyffServer({ onBody: (b, reply) => { if (b[0] === 0xfc) reply(new Uint8Array([0xfd, 0, 0, 0])); } });
  cleanups.push(() => server.close());
  const h = await harness({ route: { host: '127.0.0.1', port: server.port, role: 'certifier' }, clientAddress: '10.0.0.9', sendClientAddr: true, limits: DEFAULT_LIMITS });
  h.client.send(new Uint8Array([0xfc, 0, 0, 0]));          // may arrive before the protocol ID: must be held
  await server.waitForBodies(2);
  expect(bytesToHex(server.received[0]!)).toBe(bytesToHex(encodeGatewayClientAddr('10.0.0.9')));
  expect(bytesToHex(server.received[1]!)).toBe('fc000000');
  await expect.poll(() => h.messages.map(bytesToHex)).toEqual(['fd000000']); // protocol-ID body never forwarded
  expect(server.crcErrors).toBe(0);
});

it.each<{ name: string; role: Role; sendClientAddr: boolean }>([
  { name: 'a login route', role: 'login', sendClientAddr: true },
  { name: 'a cache route', role: 'cache', sendClientAddr: true },
  { name: 'a certifier route with sendClientAddr off', role: 'certifier', sendClientAddr: false },
])('sends no client address on $name', async ({ role, sendClientAddr }) => {
  const server = await fakeServer();
  const h = await harness(relayOptions(server.port, role, { sendClientAddr }));
  h.client.send(new Uint8Array([0xfc, 0, 0, 0]));
  h.client.send(new Uint8Array([0xfd, 0, 0, 0]));
  await server.waitForBodies(2);
  // The client address would have been the first body.
  expect(server.received.map(bytesToHex)).toEqual(['fc000000', 'fd000000']);
  expect(server.crcErrors).toBe(0);
});

for (const role of ['certifier', 'login'] as const) {
  const shapes = {
    'a client-address packet': encodeGatewayClientAddr('1.1.1.1'),
    'a client-address packet after DPID_UNKNOWN': new ArWriter().u32(DPID_UNKNOWN).bytes(encodeGatewayClientAddr('1.1.1.1')).toBytes(),
    'just the packet type': new Uint8Array([0xe0, 0, 0, 0]),
  };
  for (const [name, forged] of Object.entries(shapes)) {
    it(`closes with 4006 on a browser that sends ${name} (${role} route)`, async () => {
      const server = await fakeServer();
      const h = await harness(relayOptions(server.port, role, { sendClientAddr: role === 'certifier' }));
      h.client.send(keepAlive);
      const before = role === 'certifier' ? 2 : 1; // the gateway's own client address, then the keep-alive
      await server.waitForBodies(before);
      h.client.send(forged);
      await expect(h.closed).resolves.toEqual({ code: CloseCode.FORBIDDEN_PACKET });
      await expect(h.result).resolves.toMatchObject({ closeCode: 4006 });
      expect(server.received).toHaveLength(before); // nothing the browser forged got through
      if (role === 'certifier') expect(bytesToHex(server.received[0]!)).toBe(clientAddr('10.0.0.9'));
    });
  }
}

it('lets through bodies that only contain the type somewhere else', async () => {
  const server = await fakeServer();
  const h = await harness(relayOptions(server.port, 'login'));
  const unaligned = new Uint8Array([0, 0xe0, 0, 0, 0]);
  const third = new Uint8Array([1, 0, 0, 0, 2, 0, 0, 0, 0xe0, 0, 0, 0]);
  h.client.send(unaligned);
  h.client.send(third);
  await server.waitForBodies(2);
  expect(server.received.map(bytesToHex)).toEqual([bytesToHex(unaligned), bytesToHex(third)]);
});

it('closes with 4006 on a text message', async () => {
  const server = await fakeServer();
  const h = await harness(relayOptions(server.port, 'login'));
  h.client.send('hello');
  await expect(h.closed).resolves.toEqual({ code: CloseCode.FORBIDDEN_PACKET });
  await expect(h.result).resolves.toMatchObject({ closeCode: 4006 });
});

it('closes with 4004 on a packet one byte over the limit, and relays one at the limit', async () => {
  const server = await fakeServer();
  const h = await harness(relayOptions(server.port, 'login'));
  h.client.send(new Uint8Array(16384));
  await server.waitForBodies(1);
  expect(server.received[0]!.byteLength).toBe(16384);
  expect(server.crcErrors).toBe(0);

  h.client.send(new Uint8Array(16385));
  await expect(h.closed).resolves.toEqual({ code: CloseCode.LIMIT });
  await expect(h.result).resolves.toMatchObject({ closeCode: 4004, bytesUp: 16384 });
  expect(server.received).toHaveLength(1);
});

it('holds up to four packets sent before the protocol ID and sends them in order', async () => {
  const server = await fakeServer({ holdProtocolId: true });
  const h = await harness(relayOptions(server.port, 'certifier', { sendClientAddr: true }));
  for (let n = 1; n <= 4; n++) h.client.send(new Uint8Array([0xfc, n, 0, 0]));
  await h.flush(); // the relay has all four, and the server has not announced its protocol ID
  expect(server.received).toEqual([]);

  server.releaseProtocolId();
  await server.waitForBodies(5);
  expect(server.received.map(bytesToHex)).toEqual([clientAddr('10.0.0.9'), 'fc010000', 'fc020000', 'fc030000', 'fc040000']);
  expect(server.crcErrors).toBe(0);

  h.client.close(1000);
  await expect(h.result).resolves.toMatchObject({ bytesUp: 16 }); // held packets count once they are sent
});

it('closes with 4004 when a fifth packet arrives before the protocol ID', async () => {
  const server = await fakeServer({ holdProtocolId: true });
  const h = await harness(relayOptions(server.port, 'login'));
  for (let n = 1; n <= 5; n++) h.client.send(new Uint8Array([0xfc, n, 0, 0]));
  await expect(h.closed).resolves.toEqual({ code: CloseCode.LIMIT });
  await expect(h.result).resolves.toMatchObject({ closeCode: 4004, bytesUp: 0 });
  server.releaseProtocolId(); // too late for this connection: the held packets went with it, they are not sent late
  await expect.poll(() => server.connectionsClosed).toBe(1);
  expect(server.received).toEqual([]);
});

it.each<{ name: string; send: (client: WebSocket) => void; code: number }>([
  { name: 'a client-address packet', send: (c) => c.send(encodeGatewayClientAddr('1.1.1.1')), code: CloseCode.FORBIDDEN_PACKET },
  {
    name: 'a client-address packet after DPID_UNKNOWN',
    send: (c) => c.send(new ArWriter().u32(DPID_UNKNOWN).bytes(encodeGatewayClientAddr('1.1.1.1')).toBytes()),
    code: CloseCode.FORBIDDEN_PACKET,
  },
  { name: 'a text message', send: (c) => c.send('hello'), code: CloseCode.FORBIDDEN_PACKET },
  { name: 'a packet over the size limit', send: (c) => c.send(new Uint8Array(16385)), code: CloseCode.LIMIT },
])('closes with $code on $name sent before the protocol ID', async ({ send, code }) => {
  const server = await fakeServer({ holdProtocolId: true });
  const h = await harness(relayOptions(server.port, 'login'));
  send(h.client);
  await expect(h.closed).resolves.toEqual({ code });
  await expect(h.result).resolves.toMatchObject({ closeCode: code, bytesUp: 0 });
  expect(server.received).toEqual([]);
});

it('holds nothing when maxHeldPackets is 0', async () => {
  const server = await fakeServer({ holdProtocolId: true });
  const h = await harness(relayOptions(server.port, 'login', { limits: { ...DEFAULT_LIMITS, maxHeldPackets: 0 } }));
  h.client.send(keepAlive);
  await expect(h.closed).resolves.toEqual({ code: CloseCode.LIMIT });
});

it('closes with 4001 when the server port refuses the connection', async () => {
  const probe = net.createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', () => resolve()));
  const { port } = probe.address() as net.AddressInfo;
  await new Promise<void>((resolve) => probe.close(() => resolve()));

  const h = await harness(relayOptions(port, 'login', { limits: { ...DEFAULT_LIMITS, connectTimeoutMs: 2000 } }));
  h.client.send(keepAlive); // sent while the connection is still being refused
  await expect(h.closed).resolves.toEqual({ code: CloseCode.SERVER_UNREACHABLE });
  await expect(h.result).resolves.toEqual({ closeCode: 4001, bytesUp: 0, bytesDown: 0 });
});

it('closes with 4001 when the TCP connection does not complete within connectTimeoutMs', async () => {
  // A socket that is never connected: it can neither succeed nor fail, so only the timer can end the wait.
  const NEVER_CONNECTS = 1;
  const realConnect = net.connect;
  const connect = vi.spyOn(net, 'connect').mockImplementation(((...args: unknown[]) => {
    const first = args[0] as { port?: number } | undefined;
    // The browser side of the harness connects with net.connect too; only the relay's call is swallowed.
    return first?.port === NEVER_CONNECTS ? new net.Socket() : (realConnect as (...a: unknown[]) => net.Socket)(...args);
  }) as typeof net.connect);

  const h = await harness(relayOptions(NEVER_CONNECTS, 'login', { limits: { ...DEFAULT_LIMITS, connectTimeoutMs: 100 } }));
  await expect(h.closed).resolves.toEqual({ code: CloseCode.SERVER_UNREACHABLE });
  await expect(h.result).resolves.toMatchObject({ closeCode: 4001 });
  expect(connect).toHaveBeenCalledWith(expect.objectContaining({ host: '127.0.0.1', port: NEVER_CONNECTS }));
});

it('closes with 4001 when the TCP connection is made but no protocol ID arrives within connectTimeoutMs', async () => {
  const server = await fakeServer({ holdProtocolId: true });
  const h = await harness(relayOptions(server.port, 'login', { limits: { ...DEFAULT_LIMITS, connectTimeoutMs: 100 } }));
  await expect(h.closed).resolves.toEqual({ code: CloseCode.SERVER_UNREACHABLE });
  await expect(h.result).resolves.toEqual({ closeCode: 4001, bytesUp: 0, bytesDown: 0 });
  await expect.poll(() => server.connectionsClosed).toBe(1); // it did connect, and the relay hung up on it
  expect(server.connections).toBe(1);
});

it('keeps the connection, well past connectTimeoutMs, once the protocol ID arrived in time', async () => {
  const server = await fakeServer();
  const h = await harness(relayOptions(server.port, 'login', { limits: { ...DEFAULT_LIMITS, connectTimeoutMs: 40 } }));
  h.client.send(keepAlive);
  await server.waitForBodies(1); // the relay has the protocol ID
  await new Promise((resolve) => setTimeout(resolve, 200)); // five times the timeout: only an uncleared timer could end it
  expect(h.client.readyState).toBe(h.client.OPEN);
  expect(server.connectionsClosed).toBe(0);
});

it('closes with 4002 when the server drops the connection', async () => {
  const server = await fakeServer();
  const h = await harness(relayOptions(server.port, 'login'));
  h.client.send(keepAlive);
  await server.waitForBodies(1); // the relay is connected and past the protocol ID
  server.dropClients();
  await expect(h.closed).resolves.toEqual({ code: CloseCode.SERVER_CLOSED });
  await expect(h.result).resolves.toMatchObject({ closeCode: 4002 });
});

it('closes with 4002, and does not throw, when the server leaves in the middle of a frame', async () => {
  const { port } = await rawServer((socket) => {
    socket.write(idFrame);
    socket.write(hex('5e0a000000ab')); // a frame of 10 bytes with one of them sent
    socket.end();
  });
  const h = await harness(relayOptions(port, 'login'));
  await expect(h.closed).resolves.toEqual({ code: CloseCode.SERVER_CLOSED });
  await expect(h.result).resolves.toMatchObject({ closeCode: 4002, bytesDown: 0 });
  expect(h.messages).toEqual([]); // half a frame is not a packet
});

it.each([
  ['a first body that is not a protocol ID', encodeServerFrame(new Uint8Array([1, 2, 3]))],
  ['a first body of 8 bytes that does not start with zero', encodeServerFrame(new ArWriter().u32(1).u32(PROTOCOL_ID).toBytes())],
  ['a first byte that is not a frame marker', hex('41')],
])('closes with 4005 on %s', async (_name, bytes) => {
  const { port } = await rawServer((socket) => socket.write(bytes));
  const h = await harness(relayOptions(port, 'login'));
  await expect(h.closed).resolves.toEqual({ code: CloseCode.BAD_SERVER_DATA });
  await expect(h.result).resolves.toMatchObject({ closeCode: 4005 });
  expect(h.messages).toEqual([]);
});

it.each([
  ['a byte that is not a frame marker', hex('41')],
  ['a frame longer than the limit', hex('5effffff7f')],
])('closes with 4005 on %s after the protocol ID was taken in', async (_name, bytes) => {
  // The bad bytes are a chunk of their own: in the same chunk as the ID the reader would drop the ID along with them.
  const { port } = await rawServer((socket) => {
    socket.write(idFrame);
    socket.once('data', () => socket.write(bytes)); // the relay sends the browser's packet only once it has the ID
  });
  const h = await harness(relayOptions(port, 'login'));
  h.client.send(keepAlive);
  await expect(h.closed).resolves.toEqual({ code: CloseCode.BAD_SERVER_DATA });
  await expect(h.result).resolves.toMatchObject({ closeCode: 4005, bytesUp: 4 });
  expect(h.messages).toEqual([]);
});

it.each(['all in one chunk', 'a byte at a time'])('passes on server frames the network cut anywhere: %s', async (how) => {
  const first = new Uint8Array([0xfd, 1, 2, 3, 4, 5]);
  const second = new Uint8Array([0xee, 9]);
  const stream = Buffer.concat([idFrame, encodeServerFrame(first), encodeServerFrame(second)]);
  const { port } = await rawServer((socket) => {
    if (how === 'all in one chunk') socket.write(stream);
    else for (const byte of stream) socket.write(Uint8Array.of(byte));
  });
  const h = await harness(relayOptions(port, 'login'));
  await expect.poll(() => h.messages.map(bytesToHex)).toEqual([bytesToHex(first), bytesToHex(second)]);
});

it('destroys the TCP connection when the browser closes the WebSocket', async () => {
  let connected!: () => void;
  const connectedPromise = new Promise<void>((resolve) => { connected = resolve; });
  let serverSawClose!: () => void;
  const serverSawClosePromise = new Promise<void>((resolve) => { serverSawClose = resolve; });
  const { port } = await rawServer((socket) => {
    socket.on('close', serverSawClose);
    connected();
  });
  const h = await harness(relayOptions(port, 'login'));
  await connectedPromise;

  h.client.close(1000);
  await serverSawClosePromise;
  await expect(h.result).resolves.toMatchObject({ closeCode: 1000 }); // a close the browser began keeps its own code
});

it('counts the body bytes it relayed each way, and nothing else', async () => {
  const server = await fakeServer({
    onBody: (b, reply) => { if (b[0] === 0xfc) reply(new Uint8Array([0xfd, 1, 2, 3, 4])); },
  });
  const h = await harness(relayOptions(server.port, 'certifier', { sendClientAddr: true }));
  h.client.send(new Uint8Array([0xfc, 0, 0]));          // 3 bytes
  h.client.send(new Uint8Array([0xfc, 9, 9, 9, 9]));    // 5 bytes
  await expect.poll(() => h.messages.length).toBe(2);   // 2 x 5 bytes back
  h.client.close(1000);
  // Not counted: the 8-byte protocol-ID body, the injected client-address packet, the 13-byte frame headers.
  await expect(h.result).resolves.toEqual({ closeCode: 1000, bytesUp: 8, bytesDown: 10 });
  expect(server.received).toHaveLength(3); // client address and the two packets
});

it('records the code ws closes a browser with when it cuts a message: too big (1009)', async () => {
  const server = await fakeServer();
  const h = await harness(relayOptions(server.port, 'login'));
  h.client.send(new Uint8Array(16386)); // one byte more than reaches the relay's own size check
  await expect(h.closed).resolves.toEqual({ code: 1009 });
  await expect(h.result).resolves.toMatchObject({ closeCode: 1009 });
});

it('records the code ws closes a browser with when it cuts a message: text that is not UTF-8 (1007)', async () => {
  const server = await fakeServer();
  const h = await harness(relayOptions(server.port, 'login'));
  h.client.send(Buffer.from([0xff, 0xfe]), { binary: false });
  await expect(h.closed).resolves.toEqual({ code: 1007 });
  await expect(h.result).resolves.toMatchObject({ closeCode: 1007 });
});

it('records 1006 when the browser vanishes without a close', async () => {
  const server = await fakeServer();
  const h = await harness(relayOptions(server.port, 'login'));
  h.client.send(keepAlive);
  await server.waitForBodies(1);
  h.client.terminate();
  await expect(h.result).resolves.toMatchObject({ closeCode: 1006 });
  await expect.poll(() => server.connectionsClosed).toBe(1);
});

it('throws at once, and opens no connection, for a client address that is not dotted IPv4', () => {
  const connect = vi.spyOn(net, 'connect');
  const ws = {} as WebSocket; // never touched: the address is checked first
  for (const clientAddress of ['', 'localhost', '::1', '::ffff:10.0.0.9', '1.2.3', '256.0.0.1', '010.0.0.9', '10.0.0.9\n']) {
    expect(() => startRelay(ws, relayOptions(1, 'certifier', { clientAddress })), JSON.stringify(clientAddress)).toThrow(/clientAddress/);
  }
  expect(connect).not.toHaveBeenCalled();
});

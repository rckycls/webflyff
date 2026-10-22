import net from 'node:net';
import { afterEach, expect, it } from 'vitest';
import {
  ServerFrameReader, bytesToHex, encodeClientFrame, encodeProtocolIdBody, readProtocolId,
} from '@flyffweb/protocol';
import { startFakeFlyffServer, type FakeFlyffServer } from '../src';

let server: FakeFlyffServer | undefined;
const clients: net.Socket[] = [];
afterEach(async () => {
  for (const client of clients.splice(0)) client.destroy();
  await server?.close();
  server = undefined;
});

/** A client that decodes what the server sends and notes when the server hangs up. */
function connect(port: number) {
  const socket = net.connect(port, '127.0.0.1');
  clients.push(socket);
  const reader = new ServerFrameReader();
  const state = { socket, bodies: [] as Uint8Array[], closed: false };
  socket.on('data', (chunk: Buffer) => state.bodies.push(...reader.push(chunk)));
  socket.on('close', () => { state.closed = true; });
  socket.on('error', () => {});
  return state;
}

it('announces its protocol ID, then hands checked bodies to onBody and replies on the same connection', async () => {
  server = await startFakeFlyffServer({
    protocolId: 0xabcdef01,
    onBody: (body, reply) => reply(new Uint8Array([...body, 0xff])),
  });
  expect(server.protocolId).toBe(0xabcdef01);
  const a = connect(server.port);
  const b = connect(server.port);
  await expect.poll(() => [a.bodies.length, b.bodies.length]).toEqual([1, 1]);
  expect(bytesToHex(a.bodies[0]!)).toBe(bytesToHex(encodeProtocolIdBody(0xabcdef01)));
  expect(readProtocolId(b.bodies[0]!)).toBe(0xabcdef01);

  a.socket.write(encodeClientFrame(new Uint8Array([1, 2]), 0xabcdef01));
  await expect.poll(() => a.bodies.length).toBe(2);
  expect([...a.bodies[1]!]).toEqual([1, 2, 0xff]);
  expect(b.bodies).toHaveLength(1); // the reply went to the sender only
  expect(server.connections).toBe(2);
  expect(server.crcErrors).toBe(0);
  expect(server.received.map(bytesToHex)).toEqual(['0102']);
});

it('counts a frame with a bad checksum and destroys that connection only', async () => {
  server = await startFakeFlyffServer({ protocolId: 7 });
  const bad = connect(server.port);
  const good = connect(server.port);
  await expect.poll(() => [bad.bodies.length, good.bodies.length]).toEqual([1, 1]);

  bad.socket.write(encodeClientFrame(new Uint8Array([1, 2, 3]), 8)); // mixed with the wrong protocol ID
  await expect.poll(() => bad.closed).toBe(true);
  expect(server.crcErrors).toBe(1);
  expect(server.received).toEqual([]);
  expect(good.closed).toBe(false);

  good.socket.write(encodeClientFrame(new Uint8Array([4]), 7));
  await server.waitForBodies(1);
  expect(server.received.map(bytesToHex)).toEqual(['04']);
  expect(server.crcErrors).toBe(1);
});

it('sends to the newest connection, drops all clients on request and keeps listening', async () => {
  server = await startFakeFlyffServer();
  expect(() => server!.send(new Uint8Array([1]))).toThrow('no client');
  const a = connect(server.port);
  await expect.poll(() => a.bodies.length).toBe(1);
  const b = connect(server.port);
  await expect.poll(() => b.bodies.length).toBe(1);

  server.send(new Uint8Array([9, 9]));
  await expect.poll(() => b.bodies.length).toBe(2);
  expect([...b.bodies[1]!]).toEqual([9, 9]);
  expect(a.bodies).toHaveLength(1);

  server.dropClients();
  await expect.poll(() => [a.closed, b.closed]).toEqual([true, true]);
  const c = connect(server.port);
  await expect.poll(() => c.bodies.length).toBe(1);
  expect(server.connections).toBe(3);
  server.send(new Uint8Array([5]));
  await expect.poll(() => c.bodies.length).toBe(2);
});

it('waitForBodies resolves once enough bodies have arrived, across connections', async () => {
  server = await startFakeFlyffServer({ protocolId: 3 });
  const a = connect(server.port);
  const b = connect(server.port);
  await expect.poll(() => [a.bodies.length, b.bodies.length]).toEqual([1, 1]);

  let done = false;
  const waiting = server.waitForBodies(2).then(() => { done = true; });
  a.socket.write(encodeClientFrame(new Uint8Array([1]), 3));
  await expect.poll(() => server!.received.length).toBe(1);
  expect(done).toBe(false);
  b.socket.write(encodeClientFrame(new Uint8Array([2]), 3));
  await waiting;
  expect(server.received.map(bytesToHex)).toEqual(['01', '02']);
  await server.waitForBodies(1); // already satisfied
});

it('reads frames that the network split into single bytes', async () => {
  server = await startFakeFlyffServer({ protocolId: 3 });
  const a = connect(server.port);
  await expect.poll(() => a.bodies.length).toBe(1);
  const frame = encodeClientFrame(new Uint8Array([7, 7, 7]), 3);
  for (const byte of frame) {
    a.socket.write(new Uint8Array([byte]));
    await new Promise((resolve) => setImmediate(resolve));
  }
  await server.waitForBodies(1);
  expect(server.received.map(bytesToHex)).toEqual(['070707']);
  expect(server.crcErrors).toBe(0);
});

it('close() hangs up on connected clients, stops listening and can be called twice', async () => {
  server = await startFakeFlyffServer();
  const port = server.port;
  const a = connect(port);
  await expect.poll(() => a.bodies.length).toBe(1);
  await Promise.all([server.close(), server.close()]);
  await expect.poll(() => a.closed).toBe(true);
  const refused = connect(port);
  await expect.poll(() => refused.closed).toBe(true);
  expect(refused.bodies).toEqual([]);
});

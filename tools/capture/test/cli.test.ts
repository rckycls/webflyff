import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { encodeClientFrame, parseRecording, ServerFrameReader } from '@flyffweb/protocol';
import { startFakeFlyffServer, type FakeFlyffServer } from '@flyffweb/testkit';
import { main, parseCli, type CliIo } from '../src/cli';

// The relay listens on the port number of the server it forwards to, so a test needs two addresses: the fake
// server owns 127.0.0.1:<port> and the capture takes 127.0.0.2:<port>. Linux and Windows route all of 127/8.
const second = await new Promise<boolean>((resolve) => {
  const probe = net.createServer();
  probe.once('error', () => resolve(false));
  probe.listen(0, '127.0.0.2', () => probe.close(() => resolve(true)));
});

const required = ['--account', 'acc', '--password', 'pw', '--pin', '1234'];

describe('parseCli', () => {
  it('reads the command from the README, with the fixture path resolved', () => {
    const parsed = parseCli([
      '--listen', '172.31.238.55', '--target', '127.0.0.1', '--ports', '23000,28000',
      '--account', 'acc', '--password', 'pw', '--pin', '1234',
      '--out', 'packages/protocol/test/fixtures/neuz-login.json',
    ]);
    expect(parsed).toEqual({
      kind: 'run',
      options: {
        listen: '172.31.238.55', target: '127.0.0.1',
        routes: [{ listenPort: 23000, targetPort: 23000 }, { listenPort: 28000, targetPort: 28000 }],
        account: 'acc', password: 'pw', bankPin: '1234',
        out: path.resolve('packages/protocol/test/fixtures/neuz-login.json'),
      },
    });
  });

  it('defaults to the README values, so only the account is needed', () => {
    const parsed = parseCli(required);
    expect(parsed.kind).toBe('run');
    if (parsed.kind !== 'run') return;
    expect(parsed.options.listen).toBe('172.31.238.55');
    expect(parsed.options.target).toBe('127.0.0.1');
    expect(parsed.options.routes.map((route) => route.targetPort)).toEqual([23000, 28000]);
    const here = path.dirname(fileURLToPath(import.meta.url));
    expect(parsed.options.out).toBe(path.resolve(here, '../../../packages/protocol/test/fixtures/neuz-login.json'));
  });

  it('shows help', () => {
    expect(parseCli(['-h'])).toEqual({ kind: 'help' });
  });

  it.each([
    ['no account', ['--password', 'pw', '--pin', '1234'], '--account is required'],
    ['no password', ['--account', 'a', '--pin', '1234'], '--password is required'],
    ['no pin', ['--account', 'a', '--password', 'pw'], '--pin is required'],
    ['a short pin', [...required, '--pin', '123'], '--pin must be exactly 4 digits'],
    ['a long pin', [...required, '--pin', '12345'], '--pin must be exactly 4 digits'],
    ['a pin with letters', [...required, '--pin', '12a4'], '--pin must be exactly 4 digits'],
    ['a port that is not a number', [...required, '--ports', '23000,abc'], '--ports must be port numbers'],
    ['port 0', [...required, '--ports', '0'], '--ports must be port numbers'],
    ['a port above 65535', [...required, '--ports', '65536'], '--ports must be port numbers'],
    ['a port twice', [...required, '--ports', '23000,23000'], 'port 23000 twice'],
    ['an empty port list', [...required, '--ports', ''], '--ports needs a value'],
    ['an empty listen address', [...required, '--listen', ''], '--listen needs a value'],
    ['an unknown flag', [...required, '--nope'], 'nope'],
  ])('rejects %s', (_name, argv, message) => {
    const parsed = parseCli(argv);
    expect(parsed.kind).toBe('error');
    expect(parsed.kind === 'error' && parsed.message).toContain(message);
  });
});

describe('main', () => {
  let server: FakeFlyffServer | undefined;
  let dir: string | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  function makeIo() {
    const out: string[] = [];
    const err: string[] = [];
    const io: CliIo = { stdout: (text) => out.push(text), stderr: (text) => err.push(text) };
    return { io, out, err };
  }

  it('prints usage and exits 0 for --help, 2 for a bad command line', async () => {
    const help = makeIo();
    expect(await main(['--help'], help.io, new AbortController().signal)).toBe(0);
    expect(help.out.join('\n')).toContain('Usage: npm run capture');
    const bad = makeIo();
    expect(await main(['--pin', 'x'], bad.io, new AbortController().signal)).toBe(2);
    expect(bad.err.join('\n')).toContain('capture: --account is required');
  });

  it('exits 1 and points at README step 1 when this PC does not answer on the address', async () => {
    const { io, err } = makeIo();
    // 203.0.113.0/24 is reserved for documentation, so no PC owns an address in it.
    const argv = [...required, '--listen', '203.0.113.9', '--ports', '23000'];
    expect(await main(argv, io, new AbortController().signal)).toBe(1);
    expect(err.join('\n')).toContain('README step 1');
  });

  it('exits 1 and points at the Wireshark fallback when the port is taken', async () => {
    const taken = net.createServer();
    await new Promise<void>((resolve) => taken.listen(0, '127.0.0.1', resolve));
    try {
      const port = String((taken.address() as net.AddressInfo).port);
      const { io, err } = makeIo();
      const argv = [...required, '--listen', '127.0.0.1', '--ports', port];
      expect(await main(argv, io, new AbortController().signal)).toBe(1);
      expect(err.join('\n')).toContain('README step 5');
    } finally {
      await new Promise<void>((resolve) => taken.close(() => resolve()));
    }
  });

  it.skipIf(!second)('writes the recording when a connection closes and again when stopped', async () => {
    server = await startFakeFlyffServer({ protocolId: 0x1234, onBody: (_b, reply) => reply(new Uint8Array([0xfd])) });
    dir = mkdtempSync(path.join(os.tmpdir(), 'capture-test-'));
    const file = path.join(dir, 'made', 'on', 'demand', 'rec.json'); // the folders do not exist yet
    const { io, out } = makeIo();
    const stop = new AbortController();
    const done = main(
      ['--listen', '127.0.0.2', '--target', '127.0.0.1', '--ports', String(server.port),
        '--account', 'acc', '--password', 'pw', '--pin', '1234', '--out', file],
      io, stop.signal,
    );
    await expect.poll(() => out.some((line) => line.startsWith('ready'))).toBe(true);

    const exchange = async (): Promise<net.Socket> => {
      const socket = net.connect(server!.port, '127.0.0.2');
      const bodies: Uint8Array[] = [];
      const reader = new ServerFrameReader();
      socket.on('data', (d: Buffer) => bodies.push(...reader.push(d)));
      socket.on('error', () => {});
      await expect.poll(() => bodies.length).toBe(1);
      socket.write(encodeClientFrame(new Uint8Array([0xfc]), 0x1234));
      await expect.poll(() => bodies.length).toBe(2);
      return socket;
    };

    (await exchange()).destroy();
    await expect.poll(() => existsSync(file)).toBe(true); // written by the closing connection, before any stop
    const afterClose = parseRecording(JSON.parse(readFileSync(file, 'utf8')));
    expect(afterClose.packets.map((p) => [p.connection, p.direction, p.hex])).toEqual([
      [1, 's2c', '0000000034120000'], [1, 'c2s', 'fc'], [1, 's2c', 'fd'],
    ]);

    const open = await exchange(); // still connected when the window is closed
    stop.abort();
    expect(await done).toBe(0);
    open.destroy();
    const saved = parseRecording(JSON.parse(readFileSync(file, 'utf8')));
    expect(saved).toMatchObject({ account: 'acc', password: 'pw', bankPin: '1234' });
    expect(saved.packets.map((p) => [p.connection, p.direction, p.hex])).toEqual([
      [1, 's2c', '0000000034120000'], [1, 'c2s', 'fc'], [1, 's2c', 'fd'],
      [2, 's2c', '0000000034120000'], [2, 'c2s', 'fc'], [2, 's2c', 'fd'],
    ]);
  });

  it('writes nothing, and says so, when stopped before anything was recorded', async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'capture-test-'));
    const file = path.join(dir, 'rec.json');
    const { io, out } = makeIo();
    const stop = new AbortController();
    stop.abort();
    const probe = net.createServer();
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const port = String((probe.address() as net.AddressInfo).port);
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    expect(await main([...required, '--listen', '127.0.0.1', '--ports', port, '--out', file], io, stop.signal)).toBe(0);
    expect(existsSync(file)).toBe(false);
    expect(out.join('\n')).toContain('nothing was recorded');
  });
});

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createDistMiddleware, resolveDistRequest, serveDist } from '../vite.serveDist';
import type { Mount } from '../vite.serveDist';

const FLYFFWEB = path.resolve(import.meta.dirname, '../..', '..');

describe('resolveDistRequest', () => {
  const mounts: Mount[] = [
    { prefix: '/assets/', dir: path.join(FLYFFWEB, 'dist', 'assets') },
    { prefix: '/other/', dir: path.join(FLYFFWEB, 'dist', 'other') },
  ];

  it('maps /assets/index.json to dist/assets/index.json', () => {
    const hit = resolveDistRequest('/assets/index.json', mounts);

    expect(hit).toEqual({
      kind: 'file',
      mount: mounts[0],
      rel: 'index.json',
      file: path.join(FLYFFWEB, 'dist', 'assets', 'index.json'),
    });
  });

  it('maps a nested path, and a second mount to its own folder, and ignores the query', () => {
    expect(resolveDistRequest('/assets/worlds/wdmadrigal/tiles/0_0.b9fe1fe6be.bin?x=1', mounts)).toMatchObject({
      kind: 'file',
      file: path.join(FLYFFWEB, 'dist', 'assets', 'worlds', 'wdmadrigal', 'tiles', '0_0.b9fe1fe6be.bin'),
    });
    expect(resolveDistRequest('/other/x.json', mounts)).toMatchObject({
      kind: 'file',
      file: path.join(FLYFFWEB, 'dist', 'other', 'x.json'),
    });
  });

  it('leaves every other url to the next handler', () => {
    expect(resolveDistRequest('/', mounts)).toBeNull();
    expect(resolveDistRequest('/src/main.ts', mounts)).toBeNull();
    expect(resolveDistRequest('/assets', mounts)).toBeNull();
    expect(resolveDistRequest('/assetsfoo/x', mounts)).toBeNull();
  });

  it('refuses a path that leaves the folder', () => {
    for (const url of [
      '/assets/../package.json',
      '/assets/../../package.json',
      '/assets/a/../../other/x',
      '/assets/%2e%2e/package.json',
      '/assets/%2E%2E%2Fpackage.json',
      '/assets/..%2fpackage.json',
      '/assets/..\\package.json',
      '/assets/a\\..\\..\\package.json',
    ]) {
      // On POSIX a backslash is only a file name character, so those two are merely missing files there.
      const hit = resolveDistRequest(url, mounts);
      if (url.includes('\\') && path.sep === '/') expect(hit?.kind).toBe('file');
      else expect(hit, url).toEqual({ kind: 'forbidden' });
    }
  });

  it('keeps ".." that stays inside the folder', () => {
    expect(resolveDistRequest('/assets/a/../index.json', mounts)).toMatchObject({
      kind: 'file',
      file: path.join(FLYFFWEB, 'dist', 'assets', 'index.json'),
    });
  });

  it('refuses a malformed escape or a NUL byte', () => {
    expect(resolveDistRequest('/assets/%E0%A4%A', mounts)).toEqual({ kind: 'forbidden' });
    expect(resolveDistRequest('/assets/x%00.json', mounts)).toEqual({ kind: 'forbidden' });
  });
});

describe('createDistMiddleware', () => {
  let tmp: string;
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    tmp = mkdtempSync(path.join(tmpdir(), 'flyffweb-serve-'));
    mkdirSync(path.join(tmp, 'assets', 'models'), { recursive: true });
    mkdirSync(path.join(tmp, 'assets', 'worlds'));
    const big = JSON.stringify({ version: 1, files: Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`k${i}`, `v${i}`])) });
    writeFileSync(path.join(tmp, 'assets', 'index.json'), big);
    writeFileSync(path.join(tmp, 'assets', 'models', 'a.1111111111.glb'), Buffer.alloc(4096, 7));
    writeFileSync(path.join(tmp, 'assets', 'models', 'tex.2222222222.ktx2'), Buffer.alloc(4096, 9));
    writeFileSync(path.join(tmp, 'assets', 'worlds', '0_0.3333333333.bin'), Buffer.alloc(4096, 5));
    writeFileSync(path.join(tmp, 'secret.txt'), 'secret');

    const middleware = createDistMiddleware([{ prefix: '/assets/', dir: path.join(tmp, 'assets') }]);
    server = http.createServer((req, res) =>
      middleware(req, res, () => {
        res.statusCode = 418;
        res.end('next');
      }),
    );
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    rmSync(tmp, { recursive: true, force: true });
  });

  function get(url: string, headers: http.OutgoingHttpHeaders = {}) {
    return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
      http
        .get({ host: '127.0.0.1', port, path: url, headers }, (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: Buffer.concat(chunks) }));
        })
        .on('error', reject);
    });
  }

  it('serves a file under /assets/ gzipped when the client accepts it', async () => {
    const res = await get('/assets/index.json', { 'accept-encoding': 'gzip' });

    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBe('gzip');
    expect(res.headers['vary']).toMatch(/accept-encoding/i);
    expect(JSON.parse(gunzipSync(res.body).toString()).version).toBe(1);
  });

  it('prefers brotli when the client offers it', async () => {
    const res = await get('/assets/index.json', { 'accept-encoding': 'br, gzip' });

    expect(res.headers['content-encoding']).toBe('br');
  });

  it('sends the plain bytes without an accept-encoding', async () => {
    const res = await get('/assets/index.json', { 'accept-encoding': 'identity' });

    expect(res.headers['content-encoding']).toBeUndefined();
    expect(JSON.parse(res.body.toString()).version).toBe(1);
  });

  it('compresses glb and tiles, but not ktx2 (already supercompressed)', async () => {
    const accept = { 'accept-encoding': 'gzip' };

    expect((await get('/assets/models/a.1111111111.glb', accept)).headers['content-encoding']).toBe('gzip');
    expect((await get('/assets/worlds/0_0.3333333333.bin', accept)).headers['content-encoding']).toBe('gzip');
    const ktx2 = await get('/assets/models/tex.2222222222.ktx2', accept);
    expect(ktx2.headers['content-encoding']).toBeUndefined();
    expect(ktx2.body.length).toBe(4096);
  });

  it('answers 403 for a path that leaves the folder, and never reads the file outside', async () => {
    const res = await get('/assets/%2e%2e/secret.txt');

    expect(res.status).toBe(403);
    expect(res.body.toString()).not.toContain('secret');
  });

  it('answers 404 for a missing file under a mount instead of passing it on', async () => {
    const res = await get('/assets/models/missing.glb');

    expect(res.status).toBe(404);
    expect(res.body.toString()).not.toBe('next');
  });

  it('passes every other url to the next handler', async () => {
    const res = await get('/index.html');

    expect(res.status).toBe(418);
    expect(res.body.toString()).toBe('next');
  });
});

describe('serveDist plugin', () => {
  it('registers the middleware in the dev server and in vite preview', () => {
    const plugin = serveDist({ distDir: path.join(FLYFFWEB, 'dist') });
    const server = { middlewares: { use: vi.fn() } };

    (plugin.configureServer as (s: unknown) => void)(server);
    (plugin.configurePreviewServer as (s: unknown) => void)(server);

    expect(server.middlewares.use).toHaveBeenCalledTimes(2);
    for (const [handler] of server.middlewares.use.mock.calls) expect(typeof handler).toBe('function');
  });

  it('serves /assets/ only: /basis/ is left to Vite (the transcoder is the one three.js ships)', () => {
    const plugin = serveDist({ distDir: path.join(FLYFFWEB, 'dist') });
    const server = { middlewares: { use: vi.fn() } };
    (plugin.configureServer as (s: unknown) => void)(server);
    const middleware = server.middlewares.use.mock.calls[0]![0] as (req: unknown, res: unknown, next: () => void) => void;
    const next = vi.fn();

    middleware({ url: '/basis/basis_transcoder.wasm', headers: {} }, {}, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});

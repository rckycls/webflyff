// Serves the converter's output to the viewer: `FlyffWeb/dist/assets` at `/assets/` and `FlyffWeb/dist/basis` (the
// Basis transcoder, `npm run copy-basis`) at `/basis/`, in the dev server and in `vite preview`.
//
// Not Vite's `publicDir`: that folder is ~1 GB and `vite build` would copy it into the build. Here the files stay where
// the converter wrote them.
//
// Responses are compressed (brotli or gzip) when the client accepts it, which is what a real host does too, so what is
// measured here is close to what a device would download. `.ktx2` is left out: it is already supercompressed.

import compression from 'compression';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import sirv from 'sirv';
import type { Connect, Plugin } from 'vite';

export interface Mount {
  /** Url prefix, with both slashes: `/assets/`. */
  prefix: string;
  /** The folder it maps to. */
  dir: string;
}

export type DistRequest =
  /** `file` is the path on disk; `rel` is the url path below the prefix, decoded. */
  | { kind: 'file'; mount: Mount; rel: string; file: string }
  /** Under a prefix, but the path leaves the folder (or is not a valid path at all). */
  | { kind: 'forbidden' };

/**
 * Where a request url goes: the file below the mount whose prefix it starts with, `forbidden` when the decoded path
 * leaves that mount's folder (`..`, `%2e%2e`, `..\` on Windows), or null for a url that is not under any mount.
 * The query string is ignored.
 */
export function resolveDistRequest(url: string, mounts: readonly Mount[]): DistRequest | null {
  const queryAt = url.search(/[?#]/);
  const pathname = queryAt === -1 ? url : url.slice(0, queryAt);
  const mount = mounts.find((m) => pathname.startsWith(m.prefix));
  if (mount === undefined) return null;

  let rel: string;
  try {
    rel = decodeURIComponent(pathname.slice(mount.prefix.length));
  } catch {
    return { kind: 'forbidden' };
  }
  if (rel.includes('\0')) return { kind: 'forbidden' };

  const root = path.resolve(mount.dir);
  const file = path.resolve(root, rel);
  if (file !== root && !file.startsWith(root + path.sep)) return { kind: 'forbidden' };
  return { kind: 'file', mount, rel, file };
}

/** Worth compressing: text-like or uncompressed binary. `.ktx2` is supercompressed already. */
const COMPRESSIBLE = /\.(json|bin|glb|wasm|js)$/i;

function shouldCompress(req: IncomingMessage): boolean {
  if (req.headers.range) return false; // a compressed partial body would not be the range that was asked for
  const url = req.url ?? '';
  const queryAt = url.search(/[?#]/);
  return COMPRESSIBLE.test(queryAt === -1 ? url : url.slice(0, queryAt));
}

/** `<webName>.<10 hex of sha256>.<ext>`: content-addressed, so it can be cached for good. */
const HASHED = /\.[0-9a-f]{10}\.[a-z0-9]+$/;

function setCacheHeaders(res: ServerResponse, pathname: string): void {
  if (HASHED.test(pathname)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  // Everything else (index.json, the transcoder) keeps sirv's `no-cache`: revalidated with its ETag every time.
}

export function createDistMiddleware(mounts: readonly Mount[]): Connect.NextHandleFunction {
  // @types/compression speaks express; Connect's handler type is what the dev and preview servers hand us.
  const compress = compression({ filter: shouldCompress }) as unknown as Connect.NextHandleFunction;
  const servers = new Map(
    mounts.map((mount) => [mount, sirv(mount.dir, { dev: true, etag: true, setHeaders: setCacheHeaders })] as const),
  );

  return (req, res, next) => {
    const url = req.url ?? '/';
    const hit = resolveDistRequest(url, mounts);
    if (hit === null) {
      next();
      return;
    }
    if (hit.kind === 'forbidden') {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }
    // sirv serves a url relative to its folder; with no `next` it answers 404 itself instead of falling through to
    // Vite (whose HTML fallback would answer a missing model with index.html).
    req.url = '/' + url.slice(hit.mount.prefix.length);
    compress(req, res, () => servers.get(hit.mount)!(req, res));
  };
}

export interface ServeDistOptions {
  /** `FlyffWeb/dist`: its `assets` and `basis` folders are served. */
  distDir: string;
}

export function serveDist(options: ServeDistOptions): Plugin {
  const middleware = createDistMiddleware([
    { prefix: '/assets/', dir: path.join(options.distDir, 'assets') },
    { prefix: '/basis/', dir: path.join(options.distDir, 'basis') },
  ]);
  return {
    name: 'flyffweb-serve-dist',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

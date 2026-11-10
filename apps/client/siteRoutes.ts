// The website's addresses in the dev server and in `vite preview` (website spec §3.1): `/play` and `/sign-up` go to their
// pages with the trailing slash, as the hosted site's `try_files {path}/index.html` serves them, and a path that is no
// page or file gets the 404 page with status 404, as Caddy's `handle_errors` does (docs/hosting.md step 8).

import { readFile } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import path from 'node:path';
import type { Connect, Plugin } from 'vite';

/** The pages, by their address. */
const PAGES = new Set(['/', '/play/', '/sign-up/']);
/** The same pages without the slash. */
const REDIRECTS = new Map([['/play', '/play/'], ['/sign-up', '/sign-up/']]);
/** Vite's own addresses, the converter's assets, the build's files, the web service and the test pages. */
const LEFT_TO_VITE = ['/assets/', '/client/', '/src/', '/api/', '/@', '/node_modules/', '/e2e/', '/site/'];

export type Route = { redirect: string } | { notFound: true } | null;

/** Where a path goes: a redirect, the 404 page, or `null` for "let Vite serve it" (a page, a file, Vite's own). */
export function routeFor(pathname: string): Route {
  const redirect = REDIRECTS.get(pathname);
  if (redirect !== undefined) return { redirect };
  if (PAGES.has(pathname)) return null;
  if (LEFT_TO_VITE.some((prefix) => pathname.startsWith(prefix))) return null;
  // a file: a dot in the last segment
  if (pathname.slice(pathname.lastIndexOf('/') + 1).includes('.')) return null;
  return { notFound: true };
}

/** The path of a request's url, or `null` when it cannot be read. */
function pathnameOf(url: string | undefined): string | null {
  try {
    return new URL(url ?? '/', 'http://site').pathname;
  } catch {
    return null;
  }
}

/** The middleware: a redirect, or the 404 page made by `notFoundPage` (its HTML) with status 404, or the next handler. */
function middleware(
  notFoundPage: (req: Connect.IncomingMessage) => Promise<string>, headers: () => Record<string, string> = () => ({}),
): Connect.NextHandleFunction {
  return (req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const pathname = pathnameOf(req.url);
    const route = pathname === null ? { notFound: true as const } : routeFor(pathname);
    if (route === null) return next();
    if ('redirect' in route) {
      const query = req.url?.includes('?') === true ? req.url.slice(req.url.indexOf('?')) : '';
      res.writeHead(301, { ...headers(), Location: route.redirect + query });
      res.end();
      return;
    }
    notFoundPage(req).then((html) => {
      res.writeHead(404, { ...headers(), 'Content-Type': 'text/html; charset=utf-8' });
      res.end(req.method === 'HEAD' ? undefined : html);
    }, next);
  };
}

/** The plugin: `routeFor` in the dev server (the 404 page as Vite serves it) and in preview (the built 404 page). */
export function siteRoutes(): Plugin {
  let outDir = '';
  return {
    name: 'flyffweb-site-routes',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use(middleware(async (req) => {
        const html = await readFile(path.join(server.config.root, '404.html'), 'utf8');
        return server.transformIndexHtml('/404.html', html, req.originalUrl);
      }));
    },
    configurePreviewServer(server) {
      // its own answers carry the preview's headers too (vite.config.ts: the site's security headers)
      const headers = () => Object.fromEntries(Object.entries(server.config.preview.headers ?? {}).map(([k, v]) => [k, String(v)]));
      server.middlewares.use(middleware(() => readFile(path.join(outDir, '404.html'), 'utf8'), headers));
    },
  };
}

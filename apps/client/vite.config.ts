import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveDist } from '@flyffweb/scene/vite/serveDist.ts';
import { defineConfig } from 'vite';
import { devGatewayProxy } from './devGatewayProxy.ts';
import { siteContent } from './siteContent.ts';
import { siteRoutes } from './siteRoutes.ts';

// This file is FlyffWeb/apps/client/vite.config.ts. The root scripts run Vite from FlyffWeb with `--config` pointing here,
// so the root is set explicitly: the pages and src/ are next to this file.
const clientRoot = path.dirname(fileURLToPath(import.meta.url));
const flyffwebRoot = path.resolve(clientRoot, '../..');

// The viewer uses 5173. One constant, for `server.port` and for the Origin that forwarded gateway connections carry.
const DEV_PORT = 5174;

export default defineConfig(({ command }) => {
  // `GATEWAY_PROXY` (phones reach the gateway through this dev server, docs/servers-in-a-vm.md) is for the dev server only:
  // a build, whose gateway address the hosting guide sets with `VITE_GATEWAY_URL`, ignores it.
  const gateway = command === 'serve' ? devGatewayProxy(process.env, DEV_PORT) : undefined;
  return {
    root: clientRoot,
    // The website (website spec §3.1): home at /, sign-up at /sign-up/, the game at /play/, and 404.html for the rest.
    appType: 'mpa',
    // No publicDir: dist/assets is ~1 GB and a build would copy it. serveDist serves the world's assets in place, as for the viewer.
    publicDir: false,
    plugins: [serveDist({ distDir: path.join(flyffwebRoot, 'dist') }), siteRoutes(), siteContent(path.join(clientRoot, 'content'))],
    define: gateway?.define,
    // `host` makes the dev server reachable from a phone on the same Wi-Fi.
    // `/api` is the web service (apps/web), as Caddy passes it on the hosted site; `WEB_API` points elsewhere.
    server: {
      port: DEV_PORT, host: true,
      proxy: { ...gateway?.proxy, '/api': { target: process.env.WEB_API ?? 'http://127.0.0.1:8091', changeOrigin: false } },
    },
    build: {
      // The same target as the viewer: Safari 16.0 instead of Vite's default 16.4, because the spec's browsers include iOS / iPadOS 16.
      target: ['chrome111', 'edge111', 'firefox114', 'safari16'],
      // /assets/ is the converter's output on the hosted site, so the build's own files must not go there too.
      assetsDir: 'client',
      // three.js alone is about 700 kB minified; the client is one chunk by design, as the viewer is.
      chunkSizeWarningLimit: 1000,
      rolldownOptions: {
        input: {
          home: path.join(clientRoot, 'index.html'),
          signUp: path.join(clientRoot, 'sign-up/index.html'),
          play: path.join(clientRoot, 'play/index.html'),
          notFound: path.join(clientRoot, '404.html'),
        },
      },
    },
  };
});

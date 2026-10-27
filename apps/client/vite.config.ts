import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveDist } from '@flyffweb/scene/vite/serveDist.ts';
import { defineConfig } from 'vite';
import { devGatewayProxy } from './devGatewayProxy.ts';

// This file is FlyffWeb/apps/client/vite.config.ts. The root scripts run Vite from FlyffWeb with `--config` pointing here,
// so the root is set explicitly: index.html and src/ are next to this file.
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
    // No publicDir: dist/assets is ~1 GB and a build would copy it. serveDist serves the world's assets in place, as for the viewer.
    publicDir: false,
    plugins: [serveDist({ distDir: path.join(flyffwebRoot, 'dist') })],
    define: gateway?.define,
    // `host` makes the dev server reachable from a phone on the same Wi-Fi.
    server: { port: DEV_PORT, host: true, proxy: gateway?.proxy },
    build: {
      // The same target as the viewer: Safari 16.0 instead of Vite's default 16.4, because the spec's browsers include iOS / iPadOS 16.
      target: ['chrome111', 'edge111', 'firefox114', 'safari16'],
      // /assets/ is the converter's output on the hosted site, so the build's own files must not go there too.
      assetsDir: 'client',
      // three.js alone is about 700 kB minified; the client is one chunk by design, as the viewer is.
      chunkSizeWarningLimit: 1000,
    },
  };
});

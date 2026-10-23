import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveDist } from '@flyffweb/scene/vite/serveDist.ts';
import { defineConfig } from 'vite';

// This file is FlyffWeb/apps/client/vite.config.ts. The root scripts run Vite from FlyffWeb with `--config` pointing here,
// so the root is set explicitly: index.html and src/ are next to this file.
const clientRoot = path.dirname(fileURLToPath(import.meta.url));
const flyffwebRoot = path.resolve(clientRoot, '../..');

export default defineConfig({
  root: clientRoot,
  // No publicDir: dist/assets is ~1 GB and a build would copy it. serveDist serves the world's assets in place, as for the viewer.
  publicDir: false,
  plugins: [serveDist({ distDir: path.join(flyffwebRoot, 'dist') })],
  // The viewer uses 5173. `host` makes the dev server reachable from a phone on the same Wi-Fi.
  server: { port: 5174, host: true },
  build: {
    // The same target as the viewer: Safari 16.0 instead of Vite's default 16.4, because the spec's browsers include iOS / iPadOS 16.
    target: ['chrome111', 'edge111', 'firefox114', 'safari16'],
    // /assets/ is the converter's output on the hosted site, so the build's own files must not go there too.
    assetsDir: 'client',
    // three.js alone is about 700 kB minified; the client is one chunk by design, as the viewer is.
    chunkSizeWarningLimit: 1000,
  },
});

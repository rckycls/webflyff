import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// This file is FlyffWeb/apps/client/vite.config.ts. The root scripts run Vite from FlyffWeb with `--config` pointing here,
// so the root is set explicitly: index.html and src/ are next to this file.
const clientRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: clientRoot,
  // The viewer uses 5173. `host` makes the dev server reachable from a phone on the same Wi-Fi.
  server: { port: 5174, host: true },
  build: {
    // The same target as the viewer: Safari 16.0 instead of Vite's default 16.4, because the spec's browsers include iOS / iPadOS 16.
    target: ['chrome111', 'edge111', 'firefox114', 'safari16'],
    // /assets/ is the converter's output on the hosted site, so the build's own files must not go there too.
    assetsDir: 'client',
  },
});

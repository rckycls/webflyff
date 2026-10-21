import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { serveDist } from './vite.serveDist.ts';

// This file is FlyffWeb/apps/viewer/vite.config.ts. The root scripts run Vite from FlyffWeb with `--config` pointing here,
// so the root is set explicitly: index.html and src/ are next to this file.
const viewerRoot = path.dirname(fileURLToPath(import.meta.url));
const flyffwebRoot = path.resolve(viewerRoot, '../..');

export default defineConfig({
  root: viewerRoot,
  // No publicDir: dist/assets is ~1 GB and a build would copy it. serveDist serves it in place instead.
  publicDir: false,
  plugins: [serveDist({ distDir: path.join(flyffwebRoot, 'dist') })],
  build: {
    // /assets/ is the converter's output (serveDist), so the build's own files must not go there too.
    assetsDir: 'viewer',
    // three.js alone is about 700 kB minified; the viewer is one chunk by design.
    chunkSizeWarningLimit: 1000,
  },
});

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveDist } from '@flyffweb/scene/vite/serveDist.ts';
import { defineConfig } from 'vite';

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
    // Vite's default target, but Safari 16.0 instead of 16.4: the spec's browsers include iOS / iPadOS 16, and three.js
    // r186 uses class static blocks (`static { }`), which Safari parses only from 16.4. With this target they are
    // rewritten into code Safari 16.0 parses. (The other syntax three uses, Safari 16.0 has.)
    target: ['chrome111', 'edge111', 'firefox114', 'safari16'],
    // /assets/ is the converter's output (serveDist), so the build's own files must not go there too.
    assetsDir: 'viewer',
    // three.js alone is about 700 kB minified; the viewer is one chunk by design.
    chunkSizeWarningLimit: 1000,
  },
});

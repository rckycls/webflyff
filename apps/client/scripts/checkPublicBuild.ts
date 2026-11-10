// `npm run check:public-build`: the two checks on a build made for the public (website plan, ruling on spec §5), which a
// unit test cannot see. The owner runs it before every deploy (docs/hosting.md step 3).
//
// 1. A public build (no `VITE_TEST_HOOKS`) has no test hooks: no output script holds `__client` (src/testHooks.ts).
// 2. Home and sign-up load no game code: no chunk that `index.html` or `sign-up/index.html` loads at start was made from
//    three.js, the scene package or the world code (spec §3.1). The build's own list of the modules in each chunk is
//    read, not a text marker: a tree-shaken import of three.js keeps no marker. /play's chunks are checked to hold
//    three.js, so a check that stopped seeing it fails instead of passing by accident.
//
// The build goes to a temporary folder, never `apps/client/dist` (the one the hosting guide publishes).

import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import type { Plugin } from 'vite';

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEST_HOOK = '__client';
/** The game's code, by module path (with forward slashes). */
const GAME_CODE: [string, RegExp][] = [
  ['three.js', /\/node_modules\/three\//],
  ['the scene package', /\/packages\/scene\//],
  ['the world code', /\/apps\/client\/src\/world\//],
];

interface ManifestChunk { file: string; imports?: string[] }
type Manifest = Record<string, ManifestChunk>;

/** The files an entry loads at start: its own and its static imports, followed (dynamic imports are left out). */
function startFiles(manifest: Manifest, entry: string): string[] {
  const files = new Set<string>();
  const visit = (key: string) => {
    const chunk = manifest[key];
    if (chunk === undefined) throw new Error(`the build's manifest has no ${key}`);
    if (files.has(chunk.file)) return;
    files.add(chunk.file);
    for (const imported of chunk.imports ?? []) visit(imported);
  };
  visit(entry);
  return [...files];
}

/** A plugin that records the modules of every chunk the build writes, by the chunk's file name. */
function recordModules(modules: Map<string, string[]>): Plugin {
  return {
    name: 'check-public-build-modules',
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type === 'chunk') modules.set(output.fileName, output.moduleIds.map((id) => id.replaceAll('\\', '/')));
      }
    },
  };
}

async function scripts(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries.filter((e) => e.isFile() && e.name.endsWith('.js')).map((e) => path.join(e.parentPath, e.name));
}

async function main(): Promise<number> {
  delete process.env.VITE_TEST_HOOKS;
  const outDir = await mkdtemp(path.join(os.tmpdir(), 'flyffweb-public-build-'));
  const modules = new Map<string, string[]>();
  const problems: string[] = [];
  try {
    await build({
      configFile: path.join(clientRoot, 'vite.config.ts'),
      logLevel: 'warn',
      plugins: [recordModules(modules)],
      build: { outDir, emptyOutDir: true, manifest: true },
    });
    for (const file of await scripts(outDir)) {
      if ((await readFile(file, 'utf8')).includes(TEST_HOOK)) {
        problems.push(`${path.relative(outDir, file)} holds the test hooks (${TEST_HOOK})`);
      }
    }
    const manifest = JSON.parse(await readFile(path.join(outDir, '.vite/manifest.json'), 'utf8')) as Manifest;
    const gameCodeIn = (file: string) => GAME_CODE.filter(([, pattern]) => (modules.get(file) ?? []).some((id) => pattern.test(id)));
    for (const page of ['index.html', 'sign-up/index.html']) {
      for (const file of startFiles(manifest, page)) {
        for (const [name] of gameCodeIn(file)) problems.push(`${page} loads ${file}, which holds ${name}`);
      }
    }
    const play = startFiles(manifest, 'play/index.html').flatMap(gameCodeIn).map(([name]) => name);
    if (!play.includes('three.js')) problems.push("three.js is not seen in /play's chunks: this check no longer sees the modules");
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
  if (problems.length > 0) {
    for (const problem of problems) console.error(`check:public-build: ${problem}`);
    return 1;
  }
  console.log('check:public-build: ok (no test hooks; home and sign-up load no game code)');
  return 0;
}

process.exitCode = await main();

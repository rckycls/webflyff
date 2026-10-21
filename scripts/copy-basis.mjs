// Copies the Basis transcoder that KTX2Loader needs from three.js into dist/basis/, where the viewer's dev and preview
// servers serve it as /basis/. A node script rather than a shell command so it runs the same in PowerShell and Git Bash.

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const flyffweb = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const from = path.join(flyffweb, 'node_modules', 'three', 'examples', 'jsm', 'libs', 'basis');
const to = path.join(flyffweb, 'dist', 'basis');
const files = ['basis_transcoder.js', 'basis_transcoder.wasm'];

const missing = files.filter((file) => !existsSync(path.join(from, file)));
if (missing.length > 0) {
  console.error(`copy-basis: ${missing.join(', ')} not found in ${from}. Run npm install in ${flyffweb} first.`);
  process.exit(1);
}

mkdirSync(to, { recursive: true });
for (const file of files) copyFileSync(path.join(from, file), path.join(to, file));
console.log(`copy-basis: ${files.join(', ')} -> ${to}`);

// The end-to-end tests draw converted assets, so without a converted `dist/assets` there is nothing to test.

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const index = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../dist/assets/index.json');

export default function globalSetup(): void {
  if (!existsSync(index)) throw new Error(`${index} is missing: run \`npm run convert\` first`);
}

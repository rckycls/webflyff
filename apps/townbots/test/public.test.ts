// This repository is public: the bot program names nothing of the bots it runs (their towns, names, words, lines,
// places or items are in the server's private settings file). A guard against the towns' names slipping into it.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const app = fileURLToPath(new URL('..', import.meta.url));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

it('names no town the bots live in', () => {
  const found = [...files(join(app, 'src')), ...files(join(app, 'scripts')), ...files(join(app, 'test')), join(app, 'README.md')]
    .filter((path) => !path.endsWith('public.test.ts'))
    .flatMap((path) => readFileSync(path, 'utf8').split('\n').map((line, i) => [path, i + 1, line] as const))
    .filter(([, , line]) => /flaris|saint ?morning|darkon|darken/i.test(line))
    .map(([path, n]) => `${path.slice(app.length)}:${n}`);
  expect(found).toEqual([]);
});

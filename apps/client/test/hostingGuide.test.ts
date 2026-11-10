import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { siteHeaders } from '../siteHeaders';

const guide = readFileSync(fileURLToPath(new URL('../../../docs/hosting.md', import.meta.url)), 'utf8');

it("the guide's Caddyfile carries the same headers as siteHeaders", () => {
  for (const [name, value] of Object.entries(siteHeaders('wss://{host}'))) expect(guide).toContain(`${name} "${value}"`);
  expect(guide).toContain('reverse_proxy 127.0.0.1:8091');
});

it('the guide serves the pages, the 404 page and the web service as the site needs', () => {
  expect(guide).toContain('try_files {path} {path}/index.html');
  expect(guide).toContain('rewrite * /404.html');
  expect(guide).toContain('max_size 4KB');
  expect(guide).toContain('npm run check:public-build');
  expect(guide).toContain('Install-WebLogin.ps1');
  // the old fallback sent every unknown address to the game
  expect(guide).not.toContain('try_files {path} /index.html');
});

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { ADMIN_CSP } from '../src/admin/adminServer';

// line ends as git checks the file out on Windows (CRLF) are read as \n, as deploy/Common.ps1 does
const guide = readFileSync(fileURLToPath(new URL('../../../docs/hosting.md', import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
/** Every code block that starts with `first` (the line after its opening fence), up to its closing fence. */
function blocksStarting(first: string): string[] {
  return [...guide.matchAll(new RegExp(`\`\`\`\\n(${first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?)\\n\`\`\``, 'g'))].map((m) => m[1]!);
}

it("step 8's Caddyfile keeps exactly one site line (deploy/Common.ps1 Get-Caddyfile needs it)", () => {
  const site = blocksStarting('(site-headers) {');
  expect(site).toHaveLength(1);
  expect(site[0]!.match(/^[a-z0-9.-]+\.[a-z]{2,63} \{$/gm)).toHaveLength(1);
});

it('step 8b has the admin site in its own block, with the panel\'s own headers', () => {
  const admin = blocksStarting('admin.play.example.com {');
  expect(admin).toHaveLength(1);
  const block = admin[0]!;
  expect(block).toContain(`Content-Security-Policy "${ADMIN_CSP}"`);
  for (const line of ['X-Frame-Options DENY', 'Referrer-Policy no-referrer', 'X-Robots-Tag noindex', 'max_size 16KB', 'reverse_proxy 127.0.0.1:8092']) {
    expect(block).toContain(line);
  }
  expect(guide).toContain('Install-AdminLogin.ps1');
  expect(guide).toContain('npm run admin:setup -- --file C:\\flyff-web\\admin-login.json');
});

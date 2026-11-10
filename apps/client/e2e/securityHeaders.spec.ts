// The site's security headers (website spec §3.7) on a production build (the `prod` project: `vite build`, then
// `vite preview`, which sends `siteHeaders`), and the game logging in and entering the world under its
// Content-Security-Policy with no violation. Run with `npm run test:firstload:client`.

import { expect, test } from '@playwright/test';
import { enterFlaris, playGateway } from './worldHarness';

const HEADERS = ['content-security-policy', 'permissions-policy', 'referrer-policy', 'strict-transport-security', 'x-content-type-options'];

test('every page has the headers', { tag: '@prod' }, async ({ request }) => {
  for (const [path, status] of [['/', 200], ['/sign-up/', 200], ['/play/', 200], ['/no-such-page', 404]] as const) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(status);
    const headers = response.headers();
    for (const name of HEADERS) expect(headers[name], `${name} on ${path}`).toBeTruthy();
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  }
});

test('the game enters the world under the CSP with no violation', { tag: '@prod' }, async ({ page }) => {
  test.setTimeout(180_000);
  // a policy error can also come out as a page error (the transcoder's worker: 'Evaluating a string as JavaScript violates…')
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (/Content Security Policy/i.test(message.text())) errors.push(message.text()); });
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __violations: string[] }).__violations = seen;
    document.addEventListener('securitypolicyviolation', (event) => {
      seen.push(`${event.violatedDirective} ${event.blockedURI} ${event.sourceFile}:${event.lineNumber}`);
    });
  });
  const csp = page.waitForResponse((response) => new URL(response.url()).pathname === '/play/');
  await playGateway(page);
  await enterFlaris(page); // opens /play/
  expect((await csp).headers()['content-security-policy']).toContain("script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'");
  // drawn: the client has its first frame of the world
  expect((await page.evaluate(() => window.__client!.perf())).onScreenAt).not.toBeNull();
  // a moment of play, for what loads after the first frame (the ring of tiles, sounds, effects)
  await page.waitForTimeout(3000);
  expect(await page.evaluate(() => (window as unknown as { __violations: string[] }).__violations)).toEqual([]);
  expect(errors.filter((text) => /Content Security Policy|violates/i.test(text))).toEqual([]);
});

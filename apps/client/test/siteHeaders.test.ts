import { expect, it } from 'vitest';
import { siteHeaders } from '../siteHeaders';

it('has the five headers, framing refused', () => {
  const h = siteHeaders('wss://{host}');
  expect(Object.keys(h).sort()).toEqual(['Content-Security-Policy', 'Permissions-Policy', 'Referrer-Policy', 'Strict-Transport-Security', 'X-Content-Type-Options']);
  expect(h['Content-Security-Policy']).toContain("frame-ancestors 'none'");
  expect(h['Content-Security-Policy']).toContain("connect-src 'self' wss://{host}");
  expect(h['Strict-Transport-Security']).toBe('max-age=31536000');
  expect(h['X-Content-Type-Options']).toBe('nosniff');
  expect(h['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
  expect(h['Permissions-Policy']).toBe('camera=(), microphone=(), geolocation=()');
});

// spec §3.7's policy, plus 'unsafe-eval', which the game showed it needs (e2e/securityHeaders.spec.ts): the Basis texture
// transcoder (Emscripten embind) builds functions from strings in its worker, which takes the page's policy
it("is the spec's policy with the game's 'unsafe-eval', and no inline script", () => {
  const csp = siteHeaders('wss://{host}')['Content-Security-Policy'];
  expect(csp).toBe("default-src 'self'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; "
    + "img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' wss://{host}; worker-src 'self' blob:; "
    + "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  // one line: Caddy and a header take no line breaks
  expect(csp).not.toMatch(/[\r\n]/);
});

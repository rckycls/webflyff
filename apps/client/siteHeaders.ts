// The site's security headers (website spec §3.7): Caddy sends them on the hosted site (docs/hosting.md step 8, kept the
// same by test/hostingGuide.test.ts), and `vite preview` sends them, so the `prod` e2e project runs the game under them
// (e2e/securityHeaders.spec.ts). The dev server sends none, so that hot reload keeps working.
//
// The Content-Security-Policy, by directive:
// - script-src 'unsafe-eval': the Basis texture transcoder (three.js's KTX2Loader, its Emscripten embind glue) builds
//   functions from strings in its worker, and a blob worker takes the page's policy; without it no textured world loads
//   (found by e2e/securityHeaders.spec.ts). No inline script is allowed, so a script still has to come from the site;
// - script-src 'wasm-unsafe-eval': the transcoder itself is WebAssembly;
// - style-src 'unsafe-inline': the pages and the game set inline styles (positions, sizes, theme pictures);
// - img-src / media-src data: blob:: textures and pictures made in the page, decoded sounds;
// - worker-src blob:: the transcoder's workers are made from blobs;
// - connect-src: the site itself, and the gateway's WebSocket (`extraConnect`: `wss://{host}` in the Caddyfile).

export function siteHeaders(extraConnect: string): Record<string, string> {
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    `connect-src 'self' ${extraConnect}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  return {
    'Strict-Transport-Security': 'max-age=31536000',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': csp,
  };
}

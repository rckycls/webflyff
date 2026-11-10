import { expect, it } from 'vitest';
import { routeFor } from '../siteRoutes';

it.each([['/play', '/play/'], ['/sign-up', '/sign-up/']])('redirects %s', (path, to) => expect(routeFor(path)).toEqual({ redirect: to }));
it.each(['/', '/play/', '/sign-up/', '/assets/x.png', '/client/a.js', '/src/main.ts', '/api/status', '/@vite/client',
  '/e2e/lobbyHarness.html', '/node_modules/.vite/deps/three.js', '/404.html', '/site/screenshots/a.webp'])(
  'leaves %s to Vite', (path) => expect(routeFor(path)).toBeNull());
it('sends an unknown page to the 404 page', () => {
  expect(routeFor('/nope')).toEqual({ notFound: true });
  expect(routeFor('/play/extra')).toEqual({ notFound: true });
  expect(routeFor('/no/such/page/')).toEqual({ notFound: true });
});

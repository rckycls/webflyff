/// <reference types="vite/client" />
// (the reference: `import.meta.env` below also typechecks in the e2e tests' project, apps/client/tsconfig.node.json,
// whose imports reach this file through the world code)
//
// 2026-11-12 (closed beta): the measurement overlay (`Overlay`, the corner text with fps, heap, the device and the bundles)
// is for the dev server and for a build made for the tests (`VITE_TEST_HOOKS=1`, as the test hooks are: main.ts). A build
// made for the players hides it, unless the page's address asks for it with `stats` in its query (`/play/?stats`): the
// owner's way to read it on the live site. Nothing else changes with it: the overlay still counts, and the phone's
// Start menu shows its Stats button only while it is shown.

/** What `import.meta.env` gives that the choice reads. */
export interface OverlayEnv {
  DEV?: boolean;
  VITE_TEST_HOOKS?: string;
}

/** The query word that shows the overlay on a build made for the players: `/play/?stats`. */
export const STATS_FLAG = 'stats';

/** Whether the overlay is shown: always in the dev server and a test build, else only with `?stats` in `search`. */
export function debugOverlayShown(env: OverlayEnv, search: string): boolean {
  if (env.DEV === true || env.VITE_TEST_HOOKS === '1') return true;
  return new URLSearchParams(search).has(STATS_FLAG);
}

/** `debugOverlayShown` for this page: the build's own `import.meta.env`, and the address's query `search`. */
export function debugOverlayShownHere(search: string): boolean {
  return debugOverlayShown(import.meta.env, search);
}

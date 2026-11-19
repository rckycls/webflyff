// 2026-11-20 (loading screen): how far the world's load is, from what has really come (the owner's "real bar"). V15 has
// no bar; its pictures only say "Now Loading". The parts and their weights are the design's
// (docs/superpowers/specs/2026-11-20-loading-screen-design.md): the server's answers 20, the game files 10, the map 45
// (its manifest a tenth, the tiles in view the rest), the models in view 20, the windows' pictures 5. The time the server
// takes cannot be measured, so the bar waits there.

/** What the world screen has, read each frame of the loading screen. */
export interface LoadParts {
  /** The server's answers, 0 to 1 (`serverShare`). */
  server: number;
  /** The game data and the catalogs beside it are in. */
  files: boolean;
  /** Null before the world's manifest is in; then the tiles in view that are on screen, of all of them. */
  map: { done: number; total: number } | null;
  /** Null before the movers' views exist; then the models finished, of those asked for. */
  models: { done: number; total: number } | null;
  /** The glyph sheets and the quest marks' pictures are in. */
  windows: boolean;
  /** The world has been drawn on screen once. */
  drawn: boolean;
}

/** Below this until the world is drawn: the bar is full only when the world is there. */
const BEFORE_DRAWN = 0.99;

/** The part of the server's answers a phase of `WorldSession` stands for. A REPLACE (`transition`) is half of a change. */
export function serverShare(phase: string): number {
  switch (phase) {
    case 'pausing': return 0.15;
    case 'preJoin': return 0.35;
    case 'join': return 0.65;
    case 'transition': return 0.5;
    case 'playing': return 1;
    default: return 0;
  }
}

const share = (part: { done: number; total: number }): number => (part.total <= 0 ? 1 : Math.min(1, part.done / part.total));

/** How far the load is, 0 to 1. */
export function loadFraction(parts: LoadParts): number {
  if (parts.drawn) return 1;
  // no tiles asked for yet (the stage not focused): the manifest's tenth only
  const map = parts.map === null ? 0 : 0.1 + (parts.map.total <= 0 ? 0 : 0.9 * share(parts.map));
  const models = parts.models === null ? 0 : share(parts.models);
  const sum = 0.2 * Math.min(1, Math.max(0, parts.server)) + (parts.files ? 0.1 : 0) + 0.45 * map + 0.2 * models
    + (parts.windows ? 0.05 : 0);
  return Math.min(BEFORE_DRAWN, sum);
}

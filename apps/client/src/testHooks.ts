// `window.__client`: what the Playwright tests (and a tester's console) use to look into the game client, as
// `window.__viewer` is for the viewer (apps/viewer/src/testHooks.ts). It is a registry: the hooks are there from the
// start, and the world screen registers what they answer from while it is open. Outside a world screen they throw
// (`ready` rejects) with "no world screen".

import type { Vec3 } from '@flyffweb/protocol';
import type { SessionStats } from './world/WorldSession';

/** The session's counts of what its bundles held, and the overlay's errors. */
export interface ClientStats extends SessionStats {
  /** The latest errors the overlay lists, oldest first. */
  errors: string[];
}

/** A mover in view: its object ID, its name and its position in the client's (D3D) coordinates, as the rules have it. */
export interface ClientMover {
  objectId: number;
  name: string;
  pos: Vec3;
}

export interface ClientHooks {
  /** Resolves once the world screen shows the world (its map around the player and the models in view); rejects if it ends first. */
  ready(): Promise<void>;
  movers(): ClientMover[];
  stats(): ClientStats;
  /** Where the chase camera looks from, in the client's (D3D) coordinates, as last drawn ([0, 0, 0] before). */
  camera(): Vec3;
  /** Stops the rules and holds every model at the first frame of its motion, for pictures. Drawing goes on. */
  pause(): void;
}

declare global {
  var __client: ClientHooks | undefined;
}

let world: ClientHooks | null = null;

/** The world screen calls this when it opens. The function it returns takes the hooks back, unless a newer screen registered since. */
export function registerWorld(hooks: ClientHooks): () => void {
  world = hooks;
  return () => {
    if (world === hooks) world = null;
  };
}

function current(): ClientHooks {
  if (world === null) throw new Error('no world screen');
  return world;
}

export function createClientHooks(): ClientHooks {
  return {
    ready: async () => current().ready(),
    movers: () => current().movers(),
    stats: () => current().stats(),
    camera: () => current().camera(),
    pause: () => current().pause(),
  };
}

export function installTestHooks(): ClientHooks {
  const hooks = createClientHooks();
  globalThis.__client = hooks;
  return hooks;
}

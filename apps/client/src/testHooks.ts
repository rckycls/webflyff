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

/**
 * A mover in view: its object ID, its name, its position in the client's (D3D) coordinates, as the rules have it, its
 * HP (`m_nHitPoint`), and the rules' motion and state (`m_dwMotion`, the `MTI_*` set last without the weapon's set, and
 * `m_dwState`, the `OBJSTA_*` bits).
 */
export interface ClientMover {
  objectId: number;
  name: string;
  pos: Vec3;
  hp: number;
  motion: number;
  state: number;
}

/**
 * What the screen played of the fight since it opened, in order. A test reads these rather than the drawing: the damage
 * numbers are a layer over the canvas, which a readback of it never shows, and under a software renderer a frame can be
 * so slow that a number lives only two or three of them.
 */
export interface ClientPlayed {
  /** The damage numbers added (`CDamageNumMng::AddNumber`): the value, and whether the own player was hurt (its colours). */
  numbers: Array<{ value: number; ownHurt: boolean }>;
  /** The effects played (`CreateSfx`), by `XI_*` id. */
  effects: number[];
  /** The swings other movers' MELEE_ATTACKs started (`OnMeleeAttack`): the attacker, and the motion it swings with. */
  swings: Array<{ attackerId: number; motion: number }>;
}

/** The own character's numbers (`OwnState`): its HP, level, and the task bar's action point (null before the TASKBAR). */
export interface ClientOwn {
  hp: number;
  level: number;
  actionPoint: number | null;
}

export interface ClientHooks {
  /** Resolves once the world screen shows the world (its map around the player and the models in view); rejects if it ends first. */
  ready(): Promise<void>;
  movers(): ClientMover[];
  /** The own character's numbers, made as the JOIN enters the world; null before, or with no own mover in it. */
  own(): ClientOwn | null;
  stats(): ClientStats;
  /** Where the chase camera looks from, in the client's (D3D) coordinates, as last drawn ([0, 0, 0] before). */
  camera(): Vec3;
  /** Stops the rules and holds every model at the first frame of its motion, for pictures. Drawing goes on. */
  pause(): void;
  /**
   * After `pause`: the next frame runs `steps` rules steps (the movers, their models, the effects and the damage numbers
   * with them), and this resolves once that frame is drawn. For a picture of a number or an effect at a known tick.
   * Rejects when the rules are not paused, the screen ends first, or `steps` is not a whole number from 0.
   */
  step(steps: number): Promise<void>;
  /** What the screen played of the fight so far (`ClientPlayed`). */
  played(): ClientPlayed;
  /**
   * Where the middle of the box of the mover `objectId` is on the drawing, as shares of its width and height from the top
   * left (where a tap lands on it); null if the mover is not drawn.
   */
  screenOf(objectId: number): [number, number] | null;
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
    own: () => current().own(),
    stats: () => current().stats(),
    camera: () => current().camera(),
    pause: () => current().pause(),
    step: async (steps) => current().step(steps),
    played: () => current().played(),
    screenOf: (objectId) => current().screenOf(objectId),
  };
}

export function installTestHooks(): ClientHooks {
  const hooks = createClientHooks();
  globalThis.__client = hooks;
  return hooks;
}

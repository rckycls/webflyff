// The world view, `#/world?world=wdmadrigal&radius=1&paused=1`: a player character walks a world. The map is a
// WorldStage (WorldStage.ts: the light, the sky and the fog, and the terrain tiles that stream in around the player with
// the objects they place); the view adds the character, which walks with WASD / the arrow keys or the on-screen
// joystick (Shift or a full push runs) and stands on the ground (sampleHeight, as CWorld::GetLandHeight), and a chase
// camera that follows it as the client's back camera does.
//
// It starts where the world's editor camera was (`manifest.camera`), facing the way that camera looked. That
// `camera` line (`x y z angle angleX`) is written by the world editor and not read by the client, so its meaning
// comes from the shipped files: across the 35 .wld files the first angle stays within 0..pi/2 (1.571 with the second
// at 0.000 five times: looking straight down, untouched) while the second spans 0..6.263, a full turn. So `angle` is
// the editor camera's pitch and `angleX` its yaw, both in radians (CToolCamera turns with
// D3DXQuaternionRotationYawPitchRoll, Camera.cpp:463, which takes radians); in degrees both would be next to nothing.
// The player faces the yaw (D3D: +z turned toward +x, the heading convention of player.ts); the chase camera keeps
// the client's own pitch, since the editor's is that of a camera high above the ground.
//
// `x`, `z` and `yaw` start it somewhere else, in the numbers a player sees: `x` and `z` are the client's coordinates
// (D3D, the ones /pos shows; web z is -z), both or neither, and `yaw` is the direction it faces in degrees, 0 facing
// north (D3D +z), 90 east (+x), 180 south, turning clockwise seen from above (the heading of player.ts, in degrees).
// Without them it starts as above. The compare page's spots are such addresses. An `x`, `z` off the world (a typo,
// another world's numbers) is reported on the overlay and the player starts at the world's own start instead, still
// facing `yaw` if one was given: on the world there is ground to stand on, off it there would be nothing at all.
//
// `paused=1` stands the character still in the first frame of its standing motion and ignores the keys and the
// joystick, for pictures (`walkRoute` still walks).

import { MAP_SIZE } from '@flyffweb/formats';
import type { Vec3, WorldManifest } from '@flyffweb/formats';
import {
  CHASE_PITCH,
  DEFAULT_MALE,
  DEFAULT_MOTION,
  Joystick,
  KeyboardInput,
  PART_SLOTS,
  Route,
  WorldStage,
  assembleCharacter,
  chaseCamera,
  combineIntents,
  geometryBytes,
  loadGltf,
  loopMotion,
  motionKey,
  partKey,
  skeletonKey,
  steer,
} from '@flyffweb/scene';
import type { AssembledCharacter, Gait, PlayerState } from '@flyffweb/scene';
import type { AnimationAction } from 'three';
import { LoopOnce, SkinnedMesh } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ViewFactory } from '../router';
import { registerLoadedTiles, registerWalkRoute } from '../testHooks';

export const DEFAULT_WORLD = 'wdmadrigal';
const DEFAULT_RADIUS = 1;
const MAX_RADIUS = 4;

/** A frame longer than this (a tab in the background) moves the player as if it took this long. */
const MAX_STEP_SECONDS = 1;
/** The character's motions, by gait. */
const MOTIONS: Record<Gait, string> = {
  stand: DEFAULT_MOTION.male,
  walk: 'mvr_male_genwalk',
  run: 'mvr_male_genrun',
};
const FADE_SECONDS = 0.2;

export interface WorldParams {
  /** The world's web name. */
  world: string;
  /** Visible tiles around the player's (1: 3 x 3). */
  radius: number;
  paused: boolean;
  /** The start position in the client's (D3D) x, or null for the manifest's. Set together with `z`. */
  x: number | null;
  /** The start position in the client's (D3D) z; the web z is its negative. */
  z: number | null;
  /** The direction it faces in degrees (0 north, 90 east, clockwise), or null for the manifest's. */
  yaw: number | null;
}

/** A number written in an address, or null for nothing, an empty value, or anything that is not a finite number. */
function numberParam(params: URLSearchParams, name: string): number | null {
  const given = params.get(name);
  // Number('') is 0: an empty value is no value
  if (given === null || given.trim() === '') return null;
  const value = Number(given);
  return Number.isFinite(value) ? value : null;
}

/**
 * Reads `world` (default wdmadrigal), `radius` (a whole number 0 to 4, default 1), `paused` (`1` or `true`), and the
 * start: `x` and `z` (the client's coordinates; only used together) and `yaw` (degrees).
 */
export function readWorldParams(params: URLSearchParams): WorldParams {
  const given = params.get('radius');
  // Number('') is 0: an empty value is no value
  const radius = given === null || given.trim() === '' ? DEFAULT_RADIUS : Number(given);
  const paused = params.get('paused');
  const x = numberParam(params, 'x');
  const z = numberParam(params, 'z');
  const both = x !== null && z !== null;
  return {
    world: params.get('world') || DEFAULT_WORLD,
    radius: Number.isInteger(radius) && radius >= 0 && radius <= MAX_RADIUS ? radius : DEFAULT_RADIUS,
    paused: paused === '1' || paused === 'true',
    x: both ? x : null,
    z: both ? z : null,
    yaw: numberParam(params, 'yaw'),
  };
}

/**
 * Where the player starts, in web coordinates (x, z, and the heading in radians as player.ts has it): the client's
 * `x` and `z` of the address with z negated, or the manifest camera's position; the address's `yaw` in degrees, or
 * the camera's yaw (angleX, see the top of this file). Heading 0 faces D3D +z, the same as a yaw of 0.
 */
export function startPose(
  params: Pick<WorldParams, 'x' | 'z' | 'yaw'>,
  camera: Pick<WorldManifest['camera'], 'position' | 'angleX'>,
): { x: number; z: number; heading: number } {
  return {
    x: params.x ?? camera.position[0],
    z: params.z === null ? camera.position[2] : 0 - params.z,
    heading: params.yaw === null ? camera.angleX : (params.yaw * Math.PI) / 180,
  };
}

/**
 * Null when the address's start is on the world (or it gives none), else what the overlay says about it. The world
 * runs from 0 to `size * 128 * mpu` in the client's x and z (128 cells a tile, `mpu` metres a cell).
 */
export function outsideWorld(
  params: Pick<WorldParams, 'x' | 'z'>,
  manifest: Pick<WorldManifest, 'name' | 'size' | 'mpu'>,
): string | null {
  if (params.x === null || params.z === null) return null;
  const width = manifest.size[0] * MAP_SIZE * manifest.mpu;
  const depth = manifest.size[1] * MAP_SIZE * manifest.mpu;
  const { x, z } = params;
  if (x >= 0 && x < width && z >= 0 && z < depth) return null;
  return (
    `the start x ${x}, z ${z} is off ${manifest.name} (x 0 to ${width}, z 0 to ${depth}); ` +
    "starting at the world's own start instead"
  );
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface Walk {
  route: Route;
  resolve: () => void;
  reject: (error: Error) => void;
}

export const worldView: ViewFactory = (ctx) => {
  const { renderer, store, overlay } = ctx;
  const params = readWorldParams(ctx.route.params);

  const keyboard = new KeyboardInput(window);
  const joystick = new Joystick(ctx.container);

  const player: PlayerState = { x: 0, z: 0, heading: 0 };
  let height = 0;
  /** Null until the world's manifest has arrived (and for good when it cannot be had). */
  let stage: WorldStage | null = null;
  let character: AssembledCharacter | null = null;
  let characterParts = 0;
  let characterBytes = 0;
  const actions = new Map<Gait, AnimationAction>();
  let gait: Gait = 'stand';
  let walk: Walk | null = null;
  let disposed = false;

  registerLoadedTiles(() => stage?.loadedTiles() ?? []);
  registerWalkRoute((points, speed) => {
    if (!(speed > 0)) return Promise.reject(new Error(`walkRoute: speed ${speed} is not a positive number`));
    walk?.reject(new Error('walkRoute: a newer route replaced this one'));
    return new Promise<void>((resolve, reject) => {
      walk = { route: new Route(points, speed), resolve, reject };
    });
  });

  /** A glb, or null (and an error on the overlay) when it cannot be had. */
  const load = async (key: string): Promise<GLTF | null> => {
    try {
      return await loadGltf(store, ctx.loaders.gltf, key);
    } catch (error) {
      overlay.error(`world: ${key}: ${messageOf(error)}`);
      return null;
    }
  };

  /** Loads the character and stands it on `onto`'s scene. */
  const loadCharacter = async (onto: WorldStage): Promise<void> => {
    const partKeys = PART_SLOTS.flatMap((slot) => {
      const stem = DEFAULT_MALE[slot];
      return stem === undefined ? [] : [partKey(stem)];
    });
    const gaits = Object.keys(MOTIONS) as Gait[];
    const [skeleton, ...rest] = await Promise.all([
      load(skeletonKey('male')),
      ...gaits.map((g) => load(motionKey('male', MOTIONS[g]))),
      ...partKeys.map(load),
    ]);
    const motions = rest.slice(0, gaits.length);
    const parts = rest.slice(gaits.length).flatMap((part) => (part === null ? [] : [part]));
    if (disposed || skeleton === null) return;

    let assembled: AssembledCharacter;
    try {
      assembled = await assembleCharacter(skeleton, parts, ctx.textures);
    } catch (error) {
      overlay.error(`world: could not assemble the character: ${messageOf(error)}`);
      return;
    }
    if (disposed) {
      assembled.release();
      return;
    }
    character = assembled;
    characterParts = parts.length;
    assembled.root.traverse((object) => {
      if (object instanceof SkinnedMesh) characterBytes += geometryBytes(object.geometry);
    });
    overlay.addGpuBytes(characterBytes);
    onto.scene.add(assembled.root);

    gaits.forEach((g, i) => {
      const clip = motions[i]?.animations[0];
      if (clip === undefined) {
        if (motions[i] !== null) overlay.error(`world: motion ${MOTIONS[g]} has no animation`);
        return;
      }
      const looped = loopMotion(clip);
      const action = assembled.mixer.clipAction(looped.clip);
      if (looped.frames < 2) action.setLoop(LoopOnce, 1).clampWhenFinished = true;
      actions.set(g, action);
    });
    actions.get('stand')?.play();
    // the pose of frame 0, also when paused (the mixer is then never updated)
    assembled.mixer.setTime(0);
  };

  const start = async (): Promise<void> => {
    let opened: WorldStage;
    try {
      opened = await WorldStage.open(params.world, ctx, params.radius);
    } catch (error) {
      overlay.error(`world ${params.world}: ${messageOf(error)}`);
      return;
    }
    if (disposed) {
      opened.dispose();
      return;
    }

    // the editor camera's angleX is its yaw (see the top of the file), unless the address says otherwise
    const outside = outsideWorld(params, opened.manifest);
    if (outside !== null) overlay.error(`world ${params.world}: ${outside}`);
    const pose = startPose(outside === null ? params : { ...params, x: null, z: null }, opened.manifest.camera);
    player.x = pose.x;
    player.z = pose.z;
    player.heading = pose.heading;

    stage = opened;
    const at: Vec3 = [player.x, 0, player.z];
    opened.focus(at);
    await Promise.all([opened.ready(), loadCharacter(opened)]);
    height = opened.heightAt(at) ?? 0;
  };

  const ready = start().catch((error: unknown) => overlay.error(`world: ${messageOf(error)}`));

  const setGait = (next: Gait): void => {
    if (next === gait) return;
    const from = actions.get(gait);
    const to = actions.get(next);
    gait = next;
    if (to === undefined) return;
    to.reset().fadeIn(FADE_SECONDS).play();
    from?.fadeOut(FADE_SECONDS);
  };

  return {
    ready,
    frame(dt) {
      const current = stage;
      // nothing to draw until the world's manifest is in (or ever, if it cannot be had)
      if (current === null) {
        renderer.clear();
        return;
      }
      const step = Math.min(Math.max(dt, 0), MAX_STEP_SECONDS);
      let next: Gait = 'stand';
      let arrived: Walk | null = null;
      if (walk !== null) {
        if (walk.route.step(player, step)) {
          arrived = walk;
          walk = null;
        } else next = walk.route.gait;
      } else if (!params.paused) {
        next = steer(player, combineIntents(keyboard.intent(), joystick.intent()), step);
      }

      const at: Vec3 = [player.x, height, player.z];
      current.focus(at);
      height = current.heightAt(at) ?? height;
      at[1] = height;

      if (character !== null) {
        character.root.position.set(at[0], at[1], at[2]);
        // the model faces +z; heading 0 faces -z
        character.root.rotation.y = Math.PI - player.heading;
        setGait(next);
        if (!params.paused) character.mixer.update(step);
      }
      const view = chaseCamera(at, player.heading, CHASE_PITCH, (gx, gz) => current.heightAt([gx, 0, gz]));
      current.setCamera(view.position, view.target);
      // resolved once the tiles around the end point are asked for
      arrived?.resolve();
      current.render();
    },
    counts() {
      const { tiles, models } = stage?.counts() ?? { tiles: 0, models: 0 };
      return { tiles, models: models + characterParts };
    },
    dispose() {
      disposed = true;
      registerWalkRoute(null);
      registerLoadedTiles(null);
      walk?.reject(new Error('walkRoute: the world view was closed'));
      walk = null;
      keyboard.dispose();
      joystick.dispose();
      stage?.dispose();
      if (character !== null) {
        character.root.removeFromParent();
        character.release();
        overlay.addGpuBytes(-characterBytes);
        character = null;
      }
      stage = null;
    },
  };
};

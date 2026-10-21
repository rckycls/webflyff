// The world view, `#/world?world=wdmadrigal&radius=1&paused=1`: a player character walks a world. Terrain tiles stream
// in around it (tileStreamer.ts) with the objects they place (objects.ts); it walks with WASD / the arrow keys or the
// on-screen joystick (Shift or a full push runs) and stands on the ground (sampleHeight, as CWorld::GetLandHeight);
// a chase camera follows it as the client's back camera does. The light is the client's at noon (lighting.ts).
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
// The sky and the fog are `bgColor`, a D3DCOLOR (0xAARRGGBB), and the fog is linear from `fog.start` to `fog.end`;
// nothing past the fog's end can be seen, so the camera's far plane is there.
//
// `x`, `z` and `yaw` start it somewhere else, in the numbers a player sees: `x` and `z` are the client's coordinates
// (D3D, the ones /pos shows; web z is -z), both or neither, and `yaw` is the direction it faces in degrees, 0 facing
// north (D3D +z), 90 east (+x), 180 south, turning clockwise seen from above (the heading of player.ts, in degrees).
// Without them it starts as above. The compare page's spots are such addresses.
//
// `paused=1` stands the character still in the first frame of its standing motion and ignores the keys and the
// joystick, for pictures (`walkRoute` still walks).

import type { Vec3, WorldManifest } from '@flyffweb/formats';
import type { AnimationAction, WebGLRenderer } from 'three';
import {
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  LoopOnce,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  SkinnedMesh,
  Vector2,
} from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { loadGltf } from '../assets/loaders';
import { assembleCharacter, loopMotion } from '../character/assemble';
import type { AssembledCharacter } from '../character/assemble';
import { DEFAULT_MALE, DEFAULT_MOTION, PART_SLOTS, motionKey, partKey, skeletonKey } from '../character/parts';
import { Joystick } from '../input/joystick';
import { KeyboardInput, combineIntents } from '../input/keyboard';
import { geometryBytes } from '../overlay/gpuMemory';
import type { ViewFactory } from '../router';
import { registerLoadedTiles, registerWalkRoute } from '../testHooks';
import { TerrainLighting } from './TerrainTile';
import { d3dColor, noonLight } from './lighting';
import { ObjectPool } from './objects';
import { CHASE_PITCH, Route, chaseCamera, steer } from './player';
import type { Gait, PlayerState } from './player';
import { TileStreamer } from './tileStreamer';

export const DEFAULT_WORLD = 'wdmadrigal';
const DEFAULT_RADIUS = 1;
const MAX_RADIUS = 4;

/** The client's field of view, pi / 4 at zoom level 0 (CWorld::Projection, World3D.cpp:64), and near plane (:51). */
const FOV_DEGREES = 45;
const NEAR = 0.5;
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

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A grey of `level` as D3D stores it (0 to 1, more for an overbright light), in three.js' working colour space. */
function grey(level: number): Color {
  return new Color().setRGB(level, level, level, SRGBColorSpace);
}

interface Walk {
  route: Route;
  resolve: () => void;
  reject: (error: Error) => void;
}

export const worldView: ViewFactory = (ctx) => {
  const { renderer, store, overlay } = ctx;
  const params = readWorldParams(ctx.route.params);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV_DEGREES, aspectOf(renderer), NEAR, 1000);

  // The terrain is lit by its own shader in D3D's numbers; three.js lights do the models. Intensity pi undoes three's
  // 1 / pi Lambert factor, so a light of level 1 gives the texture as it is, as in D3D.
  const light = noonLight();
  const lighting = new TerrainLighting();
  lighting.ambient.setScalar(light.ambient);
  lighting.sunColor.setScalar(light.sunColor);
  lighting.sunDirection.set(...light.sunDirection);
  const ambient = new AmbientLight(grey(light.ambient), Math.PI);
  const sun = new DirectionalLight(grey(light.sunColor), Math.PI);
  sun.position.set(...light.sunDirection);
  scene.add(ambient, sun);

  const keyboard = new KeyboardInput(window);
  const joystick = new Joystick(ctx.container);
  const pool = new ObjectPool(store, ctx.loaders, ctx.textures, overlay);

  const player: PlayerState = { x: 0, z: 0, heading: 0 };
  let height = 0;
  let streamer: TileStreamer | null = null;
  let character: AssembledCharacter | null = null;
  let characterParts = 0;
  let characterBytes = 0;
  const actions = new Map<Gait, AnimationAction>();
  let gait: Gait = 'stand';
  let walk: Walk | null = null;
  let disposed = false;

  registerLoadedTiles(() => streamer?.loaded() ?? []);
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

  const loadCharacter = async (): Promise<void> => {
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
    scene.add(assembled.root);

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
    let manifest: WorldManifest;
    try {
      manifest = await store.manifest(params.world);
    } catch (error) {
      overlay.error(`world ${params.world}: ${messageOf(error)}`);
      return;
    }
    if (disposed) return;

    const sky = new Color().setRGB(...d3dColor(manifest.bgColor), SRGBColorSpace);
    scene.background = sky;
    scene.fog = new Fog(sky, manifest.fog.start, manifest.fog.end);
    if (manifest.fog.end > NEAR) camera.far = manifest.fog.end;
    camera.updateProjectionMatrix();

    // the editor camera's angleX is its yaw (see the top of the file), unless the address says otherwise
    const pose = startPose(params, manifest.camera);
    player.x = pose.x;
    player.z = pose.z;
    player.heading = pose.heading;

    const tiles = new TileStreamer(params.world, manifest, store, scene, {
      textures: ctx.textures,
      objects: pool,
      overlay,
      lighting,
      radius: params.radius,
    });
    streamer = tiles;
    const at: Vec3 = [player.x, 0, player.z];
    tiles.update(at);
    await Promise.all([tiles.ready(), loadCharacter()]);
    height = tiles.heightAt(at) ?? 0;
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
      const aspect = aspectOf(renderer);
      if (aspect !== camera.aspect) {
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
      }
      if (streamer !== null) {
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
        streamer.update(at);
        height = streamer.heightAt(at) ?? height;
        at[1] = height;

        if (character !== null) {
          character.root.position.set(at[0], at[1], at[2]);
          // the model faces +z; heading 0 faces -z
          character.root.rotation.y = Math.PI - player.heading;
          setGait(next);
          if (!params.paused) character.mixer.update(step);
        }
        const ground = streamer;
        const view = chaseCamera(at, player.heading, CHASE_PITCH, (gx, gz) => ground.heightAt([gx, 0, gz]));
        camera.position.set(...view.position);
        camera.lookAt(...view.target);
        pool.update(view.position);
        // resolved once the tiles around the end point are asked for
        arrived?.resolve();
      }
      renderer.render(scene, camera);
    },
    counts() {
      return { tiles: streamer?.count() ?? 0, models: pool.modelCount() + characterParts };
    },
    dispose() {
      disposed = true;
      registerWalkRoute(null);
      registerLoadedTiles(null);
      walk?.reject(new Error('walkRoute: the world view was closed'));
      walk = null;
      keyboard.dispose();
      joystick.dispose();
      streamer?.dispose();
      streamer = null;
      pool.dispose();
      if (character !== null) {
        scene.remove(character.root);
        character.release();
        overlay.addGpuBytes(-characterBytes);
        character = null;
      }
      sun.dispose();
      ambient.dispose();
    },
  };
};

const drawingSize = new Vector2();

function aspectOf(renderer: WebGLRenderer): number {
  const size = renderer.getSize(drawingSize);
  return size.y > 0 ? size.x / size.y : 1;
}

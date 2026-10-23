// The map of a world on screen: the scene with its light, sky and fog, the camera, and the terrain tiles and the objects
// they place, streamed in around a point (tileStreamer.ts, objects.ts). The viewer's world view and the game client's
// world screen both stand a character on it; where that character is, how it moves and where the camera looks from
// are theirs (`focus` and `setCamera`), and so is anything else they add to `scene`. The game client's movement rules
// also read the world from it (`ground`: the land of the tiles that are in and their objects' collision shapes,
// ground.ts and collision.ts), which the viewer never asks for.
//
// The light is the client's at noon (lighting.ts). The terrain is lit by its own shader in D3D's numbers
// (`TerrainLighting`); three.js lights do the models. Intensity pi undoes three's 1 / pi Lambert factor, so a light of
// level 1 gives the texture as it is, as in D3D.
//
// The sky and the fog are the manifest's `bgColor`, a D3DCOLOR (0xAARRGGBB), and the fog is linear from `fog.start` to
// `fog.end`; nothing past the fog's end can be seen, so the camera's far plane is there.

import type { Vec3, WorldManifest } from '@flyffweb/formats';
import {
  AmbientLight,
  Color,
  DirectionalLight,
  Fog,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  Vector2,
} from 'three';
import type { WebGLRenderer } from 'three';
import type { SceneServices } from '../boot';
import { TerrainLighting } from './TerrainTile';
import { CollisionShapes } from './collision';
import { tileLand } from './ground';
import type { Ground } from './ground';
import { d3dColor, noonLight } from './lighting';
import { ObjectPool } from './objects';
import { TileStreamer } from './tileStreamer';

/** The client's field of view, pi / 4 at zoom level 0 (CWorld::Projection, World3D.cpp:64), and near plane (:51). */
const FOV_DEGREES = 45;
const NEAR = 0.5;
/** The far plane of a world whose fog does not end beyond the near plane (the fog's end is the far plane otherwise). */
const FAR = 1000;

/** A grey of `level` as D3D stores it (0 to 1, more for an overbright light), in three.js' working colour space. */
function grey(level: number): Color {
  return new Color().setRGB(level, level, level, SRGBColorSpace);
}

const drawingSize = new Vector2();

function aspectOf(renderer: WebGLRenderer): number {
  const size = renderer.getSize(drawingSize);
  return size.y > 0 ? size.x / size.y : 1;
}

export class WorldStage {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  private readonly renderer: WebGLRenderer;
  private readonly ambient: AmbientLight;
  private readonly sun: DirectionalLight;
  private readonly pool: ObjectPool;
  private readonly shapes: CollisionShapes;
  private readonly streamer: TileStreamer;
  /** What `ground` gives, once asked for. */
  private world: Ground | undefined;

  /**
   * The stage of the world with the web name `world`, showing the tiles within `radius` of the focus (1: 3 x 3; the
   * ring outside them is loaded too). Rejects when the world's manifest cannot be had. `services` are borrowed, not
   * owned: `dispose` leaves them alone.
   */
  static async open(world: string, services: SceneServices, radius: number): Promise<WorldStage> {
    const manifest = await services.store.manifest(world);
    return new WorldStage(world, manifest, services, radius);
  }

  private constructor(
    world: string,
    readonly manifest: WorldManifest,
    services: SceneServices,
    radius: number,
  ) {
    const { renderer, store, loaders, textures, overlay } = services;
    this.renderer = renderer;
    this.camera = new PerspectiveCamera(FOV_DEGREES, aspectOf(renderer), NEAR, FAR);
    if (manifest.fog.end > NEAR) this.camera.far = manifest.fog.end;
    this.camera.updateProjectionMatrix();

    const sky = new Color().setRGB(...d3dColor(manifest.bgColor), SRGBColorSpace);
    this.scene.background = sky;
    this.scene.fog = new Fog(sky, manifest.fog.start, manifest.fog.end);

    const light = noonLight();
    const lighting = new TerrainLighting();
    lighting.ambient.setScalar(light.ambient);
    lighting.sunColor.setScalar(light.sunColor);
    lighting.sunDirection.set(...light.sunDirection);
    this.ambient = new AmbientLight(grey(light.ambient), Math.PI);
    this.sun = new DirectionalLight(grey(light.sunColor), Math.PI);
    this.sun.position.set(...light.sunDirection);
    this.scene.add(this.ambient, this.sun);

    this.pool = new ObjectPool(store, loaders, textures, overlay);
    this.shapes = new CollisionShapes(store, manifest, overlay);
    this.streamer = new TileStreamer(world, manifest, store, this.scene, {
      textures,
      objects: this.pool,
      shapes: this.shapes,
      overlay,
      lighting,
      radius,
    });
  }

  /** Streams the tiles around `at` (web coordinates): loads what came into range, unloads what left it. Cheap when nothing changed. */
  focus(at: Vec3): void {
    this.streamer.update(at);
  }

  /** The ground height at `at` (web coordinates; see `TileStreamer.heightAt`), or null while its tile has not arrived. */
  heightAt(at: Vec3): number | null {
    return this.streamer.heightAt(at);
  }

  /**
   * The world as the movement rules read it (`Ground`), in D3D x and z: the land of the tiles that are in (flat ground
   * has height 0) and the collision shapes of their objects. A tile's land counts only once its objects' shapes are
   * linked (`CollisionShapes.linked`): a mover on a bridge whose tile has just come in (a SETPOS onto it, or a mover
   * coming into view there) stays where it is, as on land not loaded, instead of falling through the deck (Ruling 45).
   * The first call starts the shapes' downloads: at once for the tiles already in, and with each tile after, which
   * `ready` then waits for too; they go with their tile. The viewer never asks, so it downloads none. The same object at
   * every call; its members are closures.
   */
  ground(): Ground {
    if (this.world === undefined) {
      const { streamer, shapes } = this;
      shapes.activate();
      this.world = {
        ...tileLand(this.manifest, (tx, tz) => (shapes.linked(tx, tz) ? streamer.tileData(tx, tz) : null)),
        objectsNear: (x, z, range) => shapes.objectsNear(x, z, range),
      };
    }
    return this.world;
  }

  /**
   * Resolves once the tiles of the last `focus` are on screen, ground and objects (and, once `ground` was asked for,
   * their collision shapes). Never rejects.
   */
  ready(): Promise<void> {
    return this.streamer.ready();
  }

  /** Looks from `position` at `target` (web coordinates), and picks the objects' level of detail for a camera at `position`. */
  setCamera(position: Vec3, target: Vec3): void {
    this.camera.position.set(...position);
    this.camera.lookAt(...target);
    this.pool.update(position);
  }

  /** Draws the stage with the page's renderer, at the aspect ratio the renderer's canvas has now. */
  render(): void {
    const aspect = aspectOf(this.renderer);
    if (aspect !== this.camera.aspect) {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** The tiles whose ground is on screen, and the models the objects use that are loaded. */
  counts(): { tiles: number; models: number } {
    return { tiles: this.streamer.count(), models: this.pool.modelCount() };
  }

  /** The tiles whose ground is on screen, as `"x_y"`. */
  loadedTiles(): string[] {
    return this.streamer.loaded();
  }

  /** Gives back the tiles, the objects' models and their textures. Whatever was added to `scene` is the caller's to remove. */
  dispose(): void {
    this.streamer.dispose();
    this.shapes.dispose();
    this.pool.dispose();
    this.sun.dispose();
    this.ambient.dispose();
  }
}

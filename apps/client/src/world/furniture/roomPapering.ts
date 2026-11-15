// The room's wallpaper and floor (2026-11-15, side-session-notes housing-research/A-client.md §3.3): `CDeployManager::
// ChangeWallTex` and `ChangeTileTex` (`_Common/Housing.cpp:884-927`), which HOUSING_PAPERINGINFO calls (`OnHousingPaperingInfo`,
// `Neuz/DPClient.cpp:18479-18511`). The wall `obj_miniwall01.o3d` takes the wallpaper's texture, every land texture of the
// world the floor's (`CWorld::ForceTexture`), both from `DIR_MODELTEX` (the item's `szTextFileName`); none puts back the
// defaults, `Obj_MiniWall01.dds` and `Miniroom_floor01.dds`. Shared with the guild house, whose shell is the same wall.
//
// Here the drawn materials are found by the texture they show: the cache hands out one texture per key, so the wall's
// meshes are those whose map is the default wall texture and the land's layers those whose texture is the default floor.
// The scene is looked at again once a second while a paper is on, as the land's tiles may be drawn anew.

import type { Material, Object3D, Texture } from 'three';
import { Mesh, ShaderMaterial } from 'three';

/** The defaults' keys: the wall's model texture and the room's land texture. */
export const DEFAULT_WALL = 'textures/obj_miniwall01.dds.ktx2';
export const DEFAULT_FLOOR = 'textures/terrain/miniroom_floor01.dds.ktx2';

/** A `DIR_MODELTEX` file's key (`Obj_HouPapwal01.dds` -> `textures/obj_houpapwal01.dds.ktx2`). */
export const modelTextureKey = (file: string): string => `textures/${file.toLowerCase()}.ktx2`;

export interface PaperingTextures {
  acquire(key: string | null): Promise<Texture>;
  release(key: string | null): void;
}

type Slot = 'wall' | 'floor';

export class RoomPapering {
  /** The paper on each, by key; null for the default. */
  private readonly wanted: Record<Slot, string | null> = { wall: null, floor: null };
  private readonly held = new Map<string, Texture>();
  private defaults: Record<Slot, Texture | null> = { wall: null, floor: null };
  private lastScan = -Infinity;
  private dead = false;

  constructor(private readonly scene: Object3D, private readonly textures: PaperingTextures) {
    void textures.acquire(DEFAULT_WALL).then((t) => { if (this.dead) textures.release(DEFAULT_WALL); else { this.defaults.wall = t; this.lastScan = -Infinity; } });
    void textures.acquire(DEFAULT_FLOOR).then((t) => { if (this.dead) textures.release(DEFAULT_FLOOR); else { this.defaults.floor = t; this.lastScan = -Infinity; } });
  }

  /** A wallpaper (`wall`) or a floor (`floor`): its texture file, null for the default; `reset` both back. */
  set(change: { wall?: string | null; floor?: string | null; reset?: boolean }): void {
    if (change.reset === true) { this.want('wall', null); this.want('floor', null); }
    if (change.wall !== undefined) this.want('wall', change.wall === null ? null : modelTextureKey(change.wall));
    if (change.floor !== undefined) this.want('floor', change.floor === null ? null : modelTextureKey(change.floor));
    this.lastScan = -Infinity;
  }

  private want(slot: Slot, key: string | null): void {
    const before = this.wanted[slot];
    if (before === key) return;
    this.wanted[slot] = key;
    if (key !== null && !this.held.has(key)) {
      void this.textures.acquire(key).then((t) => {
        if (this.dead) { this.textures.release(key); return; }
        this.held.set(key, t);
        this.lastScan = -Infinity;
      });
    }
  }

  /** Each frame (`seconds`, any clock): the materials put to what is wanted, at most once a second unless something changed. */
  update(seconds: number): void {
    if (seconds - this.lastScan < 1) return;
    this.lastScan = seconds;
    this.apply();
  }

  private texture(slot: Slot): Texture | null {
    const key = this.wanted[slot];
    return key === null ? this.defaults[slot] : this.held.get(key) ?? null;
  }

  private apply(): void {
    const all: Record<Slot, Texture | null> = { wall: this.defaults.wall, floor: this.defaults.floor };
    const now: Record<Slot, Texture | null> = { wall: this.texture('wall'), floor: this.texture('floor') };
    const papers = new Set([...this.held.values()]);
    this.scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material] as Material[]) {
        // the land's layers: their texture uniform
        if (material instanceof ShaderMaterial) {
          const uniform = (material.uniforms as { texture?: { value: Texture | null } }).texture;
          if (uniform === undefined || now.floor === null) continue;
          const original = (material.userData as { paperFloor?: Texture }).paperFloor;
          if (uniform.value === all.floor || (original !== undefined && papers.has(uniform.value!))) {
            (material.userData as { paperFloor?: Texture }).paperFloor = all.floor ?? undefined;
            uniform.value = now.floor;
          }
          continue;
        }
        const withMap = material as Material & { map?: Texture | null };
        if (withMap.map === undefined || withMap.map === null || now.wall === null) continue;
        const original = (material.userData as { paperWall?: Texture }).paperWall;
        if (withMap.map === all.wall || (original !== undefined && papers.has(withMap.map))) {
          (material.userData as { paperWall?: Texture }).paperWall = all.wall ?? undefined;
          if (withMap.map !== now.wall) { withMap.map = now.wall; material.needsUpdate = true; }
        }
      }
    });
  }

  /** The world goes: the defaults back, the papers let go. */
  dispose(): void {
    this.wanted.wall = null;
    this.wanted.floor = null;
    this.apply();
    this.dead = true;
    for (const key of this.held.keys()) this.textures.release(key);
    this.held.clear();
    if (this.defaults.wall !== null) this.textures.release(DEFAULT_WALL);
    if (this.defaults.floor !== null) this.textures.release(DEFAULT_FLOOR);
    this.defaults = { wall: null, floor: null };
  }
}

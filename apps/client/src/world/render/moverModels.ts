// The model of a mover's look, assembled from the page's asset store and texture cache as Neuz assembles it: the
// skeleton with every part re-bound to it, the hair drawn unlit in its colour, or for a model with no skeleton its
// `lod0` as it is. `MoverViews` puts what this gives on screen.

import { applyTextures, assembleCharacter, d3dColor, loadGltf, noonLight, partSlot } from '@flyffweb/scene';
import type { AssembledCharacter, SceneServices } from '@flyffweb/scene';
import type { Material, Object3D, Texture } from 'three';
import { AnimationMixer, Color, Group, Mesh, MeshBasicMaterial, SRGBColorSpace } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { MoverLook } from './looks';

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * How bright the hair is lit: `fblack` of `CModelObject::Render` (`ModelObject.cpp:1158-1167`), the mean of the light's
 * diffuse colour times `g_fHairLight` (1.5, `ModelGlobal.cpp:41`) times 0.6, and at least 0.3 (`__BS_FIX_HAIR_AMBIENT`).
 * The light is the world's at noon (`noonLight`): 0.99.
 */
function hairLight(): number {
  const diffuse = noonLight().sunColor;
  return Math.max(0.3, ((diffuse * 1.5 * 3) / 3) * 0.6);
}

/**
 * Neuz draws the hair part unlit: diffuse 0 and ambient the hair colour times `hairLight`, at most 1
 * (`CModelObject::Render`, `ModelObject.cpp:1147-1175`, after `CMover::Render` put the colour in the hair's
 * `m_fAmbient`, `MoverRender.cpp:348-360`). So its materials become unlit ones of that colour over the same texture.
 */
function tintHair(lod: Object3D, hairColor: number): void {
  const light = hairLight();
  const [r, g, b] = d3dColor(hairColor).map((c) => Math.min(c * light, 1)) as [number, number, number];
  const color = new Color().setRGB(r, g, b, SRGBColorSpace);
  lod.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const tint = (old: Material): Material => {
      const { map } = old as Material & { map?: Texture | null };
      const unlit = new MeshBasicMaterial({
        name: old.name, map: map ?? null, color, transparent: old.transparent, opacity: old.opacity, alphaTest: old.alphaTest,
        side: old.side, depthWrite: old.depthWrite,
      });
      old.dispose(); // its texture is the cache's: the assembled character gives it back
      return unlit;
    };
    object.material = Array.isArray(object.material) ? object.material.map(tint) : tint(object.material);
  });
}

/**
 * The model of a look, from the page's asset store: the skeleton with every part re-bound to it (`assembleCharacter`),
 * the hair tinted as Neuz tints it, or for a model with no skeleton its `lod0` as it is. A part that cannot be had is
 * left out and said to `report` (the views' overlay, which says nothing once they are gone); a skeleton, or every part,
 * that cannot be had rejects.
 */
export function loadMoverModel(
  services: Pick<SceneServices, 'store' | 'loaders' | 'textures'>,
): (look: MoverLook, report: (message: string) => void) => Promise<AssembledCharacter> {
  const { store, loaders, textures } = services;
  const glb = (key: string): Promise<GLTF> => loadGltf(store, loaders.gltf, key);
  return async (look, report) => {
    const skeleton = look.skeleton === null ? null : glb(look.skeleton);
    // awaited below, once the parts are in; until then a failure must not count as unhandled
    skeleton?.catch(() => {});
    const parts = await Promise.all(look.parts.map(async (key) => {
      try {
        return { key, gltf: await glb(key) };
      } catch (error) {
        report(`part ${key}: ${messageOf(error)}`);
        return null;
      }
    }));
    const loaded = parts.flatMap((part) => (part === null ? [] : [part]));
    if (loaded.length === 0) throw new Error(`none of its parts could be loaded (${look.parts.join(', ')})`);
    if (skeleton === null) return plainModel(loaded[0]!.gltf, textures);
    const hair = loaded.find((part) => partSlot(part.key) === 'hair')?.gltf.scene.getObjectByName('lod0');
    const character = await assembleCharacter(await skeleton, loaded.map((part) => part.gltf), textures);
    if (hair !== undefined && look.hairColor !== null) tintHair(hair, look.hairColor);
    return character;
  };
}

/** A model that is not animated: its `lod0` with its textures, and a mixer that has nothing to play. */
async function plainModel(gltf: GLTF, textures: SceneServices['textures']): Promise<AssembledCharacter> {
  const lod = gltf.scene.getObjectByName('lod0');
  if (lod === undefined) throw new Error('the model has no "lod0" node');
  const root = new Group();
  root.add(lod);
  const keys = await applyTextures(lod, textures);
  let released = false;
  return {
    root,
    mixer: new AnimationMixer(root),
    release() {
      if (released) return;
      released = true;
      for (const key of keys) textures.release(key);
      root.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        object.geometry.dispose();
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
      });
    },
  };
}

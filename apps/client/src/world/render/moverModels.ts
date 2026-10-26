// The model of a mover's look, assembled from the page's asset store and texture cache as Neuz assembles it: the
// skeleton with every part re-bound to it, the hair drawn unlit in its colour, or for a model with no skeleton its
// `lod0` as it is; and the models of the items in its hands. `MoverViews` puts what this gives on screen.

import {
  applyTextures,
  assembleCharacter,
  d3dColor,
  loadGltf,
  modelBoxOf,
  noonLight,
  partSlot,
  unionModelBoxes,
} from '@flyffweb/scene';
import type { AssembledCharacter, HeldSlot, SceneServices } from '@flyffweb/scene';
import type { Material, Object3D, Texture } from 'three';
import { AnimationMixer, Color, Group, Mesh, MeshBasicMaterial, SRGBColorSpace } from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GameData } from '../gameData';
import { heldModels } from './looks';
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

/**
 * A model that is not animated: its `lod0` with its textures, a mixer that has nothing to play, its own box and no
 * grips (it has no skeleton).
 */
async function plainModel(gltf: GLTF, textures: SceneServices['textures']): Promise<AssembledCharacter> {
  const lod = gltf.scene.getObjectByName('lod0');
  if (lod === undefined) throw new Error('the model has no "lod0" node');
  const box = modelBoxOf(gltf.scene, 'the model');
  const boxes = box === null ? [] : [box];
  const root = new Group();
  root.add(lod);
  const keys = await applyTextures(lod, textures);
  return {
    root,
    mixer: new AnimationMixer(root),
    grips: null,
    box: () => unionModelBoxes(boxes),
    addBox: (added) => void boxes.push({ min: [...added.min], max: [...added.max] }),
    release: releaser(root, keys, textures),
  };
}

/** Gives `keys` back to the cache and disposes the geometry and materials of the meshes under `root`; once. */
function releaser(root: Object3D, keys: readonly string[], textures: SceneServices['textures']): () => void {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const key of keys) textures.release(key);
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
    });
  };
}

/** An item for a hand, loaded: its model, where it is held (`attachHeld`), and how to let it go. */
export interface HeldItem {
  /** The glb's scene with its `lod0` alone, textured; the scene's userData has the item's box (`ModelBoxExtras`). */
  item: Object3D;
  slot: HeldSlot;
  /** Gives the textures back to the cache and disposes the geometry and materials. Safe to call twice. */
  release(): void;
}

/**
 * The items the hands of a look hold (`heldModels`), each from the page's asset store with its textures; a yoyo's model
 * is loaded once for each hand, as UpdateParts loads it twice (`MoverEquip.cpp:395`). A model that cannot be had leaves
 * its hand empty and is said to `report` once: it is not asked for again. Never rejects.
 */
export function loadHeldItems(
  services: Pick<SceneServices, 'store' | 'loaders' | 'textures'>,
  data: GameData,
): (look: MoverLook, report: (message: string) => void) => Promise<HeldItem[]> {
  const { store, loaders, textures } = services;
  const failed = new Set<string>();
  return async (look, report) => {
    const items = await Promise.all(heldModels(look.held, data).map(async ({ model, slot }): Promise<HeldItem[]> => {
      if (failed.has(model)) return [];
      try {
        const gltf = await loadGltf(store, loaders.gltf, model);
        const lod = gltf.scene.getObjectByName('lod0');
        if (lod === undefined) throw new Error('the model has no "lod0" node');
        // the character view draws lod0 (assemble.ts), and so does the hand
        for (const child of [...gltf.scene.children]) if (child !== lod) child.removeFromParent();
        const keys = await applyTextures(lod, textures);
        return [{ item: gltf.scene, slot, release: releaser(gltf.scene, keys, textures) }];
      } catch (error) {
        if (!failed.has(model)) report(`held item ${model}: ${messageOf(error)}`);
        failed.add(model);
        return [];
      }
    }));
    return items.flat();
  };
}

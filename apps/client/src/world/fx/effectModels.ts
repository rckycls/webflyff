// The models the effects' mesh parts draw (Piece 7 M2): `CSfxPartMesh::Render` (`_Common/sfxbase.cpp:1072-1130`) draws the
// `.o3d` a part names, which the converter writes as `models/<name>.glb`. The wand's flight model, `sfx_FirWand01`, is
// one. Each model comes over the network on first use; until it is in, the part draws nothing, as a texture that is
// still loading does (`effectTextureProvider`). The model's first level of detail (`lod0`) is drawn, still: the effects'
// `.o3d` frames are not played.

import type { Material, Object3D } from 'three';
import { Mesh } from 'three';
import type { EffectModelPart } from '@flyffweb/scene';

export interface EffectModels {
  /** The parts of the model `key`, or null while it loads; none for a model that could not be had. */
  get(key: string): ReadonlyArray<EffectModelPart> | null;
  /** Lets go of every model's geometry. */
  dispose(): void;
}

/** The texture key a converted material names (`userData.texture`, as `applyTextures` reads it), or null. */
function textureOf(material: Material | Material[]): string | null {
  const named: unknown = (Array.isArray(material) ? material[0] : material)?.userData.texture;
  return typeof named === 'string' ? named : null;
}

/**
 * The models by key, `load` giving a model's scene (its glb's). Each mesh of lod0 is one part, its geometry with its
 * place in the model baked in. A model that fails is said once (`report`) and draws nothing from then on.
 */
export function effectModelProvider(load: (key: string) => Promise<Object3D>, report: (message: string) => void): EffectModels {
  const known = new Map<string, EffectModelPart[] | null>();
  let disposed = false;
  return {
    get(key) {
      if (disposed) return null;
      const parts = known.get(key);
      if (parts !== undefined) return parts;
      known.set(key, null);
      load(key).then(
        (scene) => {
          if (disposed) return;
          const lod = scene.getObjectByName('lod0') ?? scene;
          scene.updateMatrixWorld(true);
          const made: EffectModelPart[] = [];
          lod.traverse((object) => {
            if (!(object instanceof Mesh)) return;
            made.push({ geometry: object.geometry.clone().applyMatrix4(object.matrixWorld), texture: textureOf(object.material) });
          });
          known.set(key, made);
        },
        (error: unknown) => {
          if (disposed) return;
          report(`effect model ${key}: ${error instanceof Error ? error.message : String(error)}`);
          known.set(key, []);
        },
      );
      return null;
    },
    dispose() {
      disposed = true;
      for (const parts of known.values()) for (const part of parts ?? []) part.geometry.dispose();
      known.clear();
    },
  };
}

// The models of the effects' mesh parts (Piece 7 M2): the wand's flight model is one (`sfx_FirWand01`).

import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { effectModelProvider } from '../src/world/fx/effectModels';

/** A converted model's scene: lod0 holds one mesh, moved 1 m up, whose material names its texture. */
function glb(): Group {
  const scene = new Group();
  const lod = new Group();
  lod.name = 'lod0';
  const material = new MeshBasicMaterial();
  material.userData.texture = 'textures/sfx_firwand01.dds.ktx2';
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), material);
  mesh.position.y = 1;
  lod.add(mesh);
  const other = new Group();
  other.name = 'lod1';
  other.add(new Mesh(new BoxGeometry(5, 5, 5), new MeshBasicMaterial()));
  scene.add(lod, other);
  return scene;
}

describe('effectModelProvider', () => {
  it("none while the file comes, then lod0's meshes with their placing baked in and their texture keys", async () => {
    const load = vi.fn(async () => glb());
    const models = effectModelProvider(load, () => {});
    expect(models.get('models/sfx_firwand01.glb')).toBeNull();
    expect(models.get('models/sfx_firwand01.glb')).toBeNull();
    await vi.waitFor(() => expect(models.get('models/sfx_firwand01.glb')).not.toBeNull());
    expect(load).toHaveBeenCalledTimes(1);
    const parts = models.get('models/sfx_firwand01.glb')!;
    expect(parts.map((p) => p.texture)).toEqual(['textures/sfx_firwand01.dds.ktx2']);
    parts[0]!.geometry.computeBoundingBox();
    expect(parts[0]!.geometry.boundingBox!.min.y).toBeCloseTo(0.5);
    expect(parts[0]!.geometry.boundingBox!.max.y).toBeCloseTo(1.5);
    models.dispose();
    expect(models.get('models/sfx_firwand01.glb')).toBeNull();
  });

  it('a file that cannot be had is said once and draws nothing', async () => {
    const report = vi.fn();
    const models = effectModelProvider(async () => { throw new Error('404'); }, report);
    expect(models.get('models/x.glb')).toBeNull();
    await vi.waitFor(() => expect(report).toHaveBeenCalledTimes(1));
    expect(models.get('models/x.glb')).toEqual([]);
    expect(report).toHaveBeenCalledTimes(1);
    expect(String(report.mock.calls[0]![0])).toContain('models/x.glb');
  });
});

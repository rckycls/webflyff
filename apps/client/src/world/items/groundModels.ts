import type { GroundItem, Vec3 } from '@flyffweb/protocol';
import { toWebPosition } from '@flyffweb/formats';
import { applyTextures, loadGltf, loopMotion, modelBoxOf } from '@flyffweb/scene';
import type { Ground, SceneServices } from '@flyffweb/scene';
import { AnimationMixer, Group, Mesh, MeshStandardMaterial } from 'three';
import type { Camera, Object3D } from 'three';
import type { GameData } from '../gameData';
import { slideVectorUnder, touchedBy } from '../sim/object3d';

export interface DropModel { root: Object3D; height: number; animate?(seconds: number): void; release(): void }
export type DropLoader = (key: string, reflect?: boolean) => Promise<DropModel>;

export function loadDropModel(services: Pick<SceneServices, 'store' | 'loaders' | 'textures'>): DropLoader {
  return async (key, reflect = false) => {
    const gltf = await loadGltf(services.store, services.loaders.gltf, key);
    const root = gltf.scene;
    const mixer = new AnimationMixer(root);
    let keys: string[] = [];
    const release = (): void => {
      mixer.stopAllAction(); mixer.uncacheRoot(root);
      for (const key of keys) services.textures.release(key);
      keys = [];
      root.traverse(obj => {
        if (!(obj instanceof Mesh)) return;
        obj.geometry.dispose();
        for (const mat of Array.isArray(obj.material) ? obj.material : [obj.material]) mat.dispose();
      });
    };
    try {
      const lod = root.getObjectByName('lod0');
      if (!lod) throw new Error(`${key}: no lod0`);
      // Keep rig nodes and keyed object parents; only the other LOD groups are hidden.
      for (const child of root.children) if (/^lod\d+$/.test(child.name)) child.visible = child === lod;
      keys = await applyTextures(lod, services.textures);
      if (reflect) {
        const key = 'textures/etc_reflect.tga.ktx2';
        const texture = await services.textures.acquire(key); keys.push(key);
        lod.traverse(obj => {
          if (!(obj instanceof Mesh)) return;
          for (const mat of Array.isArray(obj.material) ? obj.material : [obj.material]) {
            if (!(mat instanceof MeshStandardMaterial)) continue;
            // Object3D.cpp: g_mReflect and D3DTOP_ADDSIGNED2X, using camera-space normals.
            mat.onBeforeCompile = shader => {
              shader.uniforms.dropReflect = { value: texture };
              shader.fragmentShader = 'uniform sampler2D dropReflect;\n' + shader.fragmentShader;
              shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>',
                'vec2 reflectUv = vec2(normal.x * 0.5 + 0.5, -normal.y * 0.5 + 0.5);\n' +
                'outgoingLight = clamp((texture2D(dropReflect, reflectUv).rgb + outgoingLight - 0.5) * 2.0, 0.0, 1.0);\n' +
                '#include <opaque_fragment>');
            };
            mat.customProgramCacheKey = () => 'drop-reflect'; mat.needsUpdate = true;
          }
        });
      }
      for (const clip of gltf.animations) mixer.clipAction(loopMotion(clip).clip).play();
      const box = modelBoxOf(root, key);
      return { root, height: box ? Math.abs(box.max[1] - box.min[1]) : 0,
        animate: seconds => mixer.setTime(seconds), release };
    } catch (error) { release(); throw error; }
  };
}

/** WorldIntersect.cpp:GetItemHeight: highest object hit in a three-unit down segment, else terrain. */
export function itemHeight(pos: Vec3, ground: Ground): number | null {
  const from: Vec3 = [pos[0], pos[1] + 1.5, pos[2]], end: Vec3 = [pos[0], pos[1] - 1.5, pos[2]];
  let highest: number | null = null;
  for (const obj of ground.objectsNear(pos[0], pos[2], 0)) {
    const inv = touchedBy(obj, from, end);
    if (inv === null) continue;
    const y = slideVectorUnder([0, 0, 0], obj, inv, from, end);
    if (y !== null && (highest === null || y > highest)) highest = y;
  }
  return highest ?? ground.terrainHeight(pos[0], pos[2]);
}

interface View { drop: GroundItem; root: Group; born: number; model?: DropModel; y: number; floor: number | null; velocity: number; age: number }

/** CItem's visual state stays separate from authoritative packet positions and pickup logic. */
export class GroundModels {
  readonly views = new Map<number, View>();
  private dead = false;
  private failed = new Set<string>();
  /** The model loads not ended yet (`settled`). */
  private readonly pending = new Set<Promise<void>>();
  constructor(private scene: Object3D, private data: GameData, private load: DropLoader,
    private ground: () => Ground | undefined, private report: (message: string) => void = () => {},
    private shine: (pos: Vec3) => void = () => {}, private random: () => number = Math.random) {}

  update(items: ReadonlyMap<number, GroundItem>, camera: Camera, tick: number, mobile: boolean): void {
    for (const [id, view] of this.views) if (items.get(id) !== view.drop) {
      view.root.removeFromParent(); view.model?.release(); this.views.delete(id);
    }
    for (const [id, drop] of items) {
      let view = this.views.get(id);
      if (!view) {
        view = { drop, root: new Group(), born: tick, y: drop.pos[1], floor: null, velocity: .15, age: 0 };
        this.views.set(id, view); this.scene.add(view.root);
        const prop = this.data.itemProps.get(drop.index);
        const key = prop?.dropModel === undefined ? prop?.model ?? 'models/item_genmatsuitbox.glb' : prop.dropModel;
        const pending = view;
        if (key && !this.failed.has(key)) this.track(this.load(key, (this.data.itemProps.get(drop.item.itemId)?.reflect ?? 0) > 0).then(model => {
          if (this.dead || this.views.get(id) !== pending) { model.release(); return; }
          pending.model = model; pending.root.add(model.root);
          const ground = this.ground();
          const h = ground ? itemHeight(drop.pos, ground) : null;
          const floor = h === null ? null : h + model.height / 2 + .12;
          if (floor !== null && Math.abs(floor - drop.pos[1]) < 1) {
            pending.floor = floor; pending.y = drop.pos[1] + 1.5;
          }
        }).catch(error => { if (!this.dead && !this.failed.has(key)) { this.failed.add(key); this.report(`ground item ${key}: ${String(error)}`); } }));
      }
      const age = Math.max(0, tick - view.born);
      view.model?.animate?.(age / 60);
      // The initial throw settles in fewer than 100 ticks. Advance late assets to their current visual age.
      if (view.model) for (; view.age < age; view.age++) {
        if (view.floor === null || view.floor === 0) break;
        if (view.y > view.floor) { view.velocity = Math.fround(view.velocity - .0075); view.y = Math.fround(view.y + view.velocity); }
        else { view.y = view.floor; view.velocity = 0; break; }
      }
      view.root.position.set(...toWebPosition([drop.pos[0], view.y, drop.pos[2]]));
      // Reflecting D3D z reverses its negative-Y rotation into a positive web rotation.
      view.root.rotation.y = (drop.angle + age * .5) * Math.PI / 180;
      view.root.scale.setScalar(drop.scale * (mobile ? .5 : 1));
      view.root.visible = view.root.position.distanceTo(camera.position) < 40;
      if (view.model && view.root.visible && this.random() < 1 / 50) this.shine([drop.pos[0], view.y, drop.pos[2]]);
    }
  }
  /** Resolves once the models asked for so far have loaded or failed (and those asked for meanwhile). Never rejects. */
  async settled(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending]);
  }
  dispose(): void {
    this.dead = true;
    for (const view of this.views.values()) { view.root.removeFromParent(); view.model?.release(); }
    this.views.clear();
  }
  /** Keeps `work` (which never rejects) among the loads `settled` waits for until it ends. */
  private track(work: Promise<void>): void {
    this.pending.add(work);
    void work.finally(() => this.pending.delete(work));
  }
}

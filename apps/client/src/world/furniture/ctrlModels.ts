// The furniture core's world layer (2026-11-15, side-session-notes housing-research/C-flyffweb.md §4.2): the controls
// (`OT_CTRL`) that ADD_OBJ brings at any time, drawn with their models and removed on DEL_OBJ, as Neuz's `CCommonCtrl`s are
// (`CDPClient::OnAddObj`, `Neuz/DPClient.cpp:1053-1320`; `CreateObj( OT_CTRL, index )`). Copied from the ground items'
// loader (items/groundModels.ts). Each drawn control keeps its box in the world (`m_OBB`) for the placement's collision.
//
// Simplified: a personal room's controls do not move (`m_bAniPlay` FALSE); the guild house's looping ones (`IsGuildHousingObj`,
// :1302-1315) come with the guild house. Movers walk through them (sim/collision.ts leaves the housing controls out).

import type { AddedCtrl } from '@flyffweb/protocol';
import { toWebPosition } from '@flyffweb/formats';
import { modelBoxOf } from '@flyffweb/scene';
import { BufferGeometry, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments } from 'three';
import type { Object3D } from 'three';
import type { GameData } from '../gameData';
import type { DropLoader, DropModel } from '../items/groundModels';
import { obbOf, placedMatrix } from './placementRules';
import type { ModelBox, Obb } from './placementRules';

interface View {
  ctrl: AddedCtrl;
  root: Group;
  model?: DropModel;
  box?: ModelBox;
}

/** The rotation a control is drawn with: the D3D z reflected turns RotationY( -angle ) into a positive web turn. */
export const webTurn = (angle: number): number => angle * Math.PI / 180;

/** The model of a control id and its MODELELEM scale (`ResetScale`), or null when it has none converted. */
export function ctrlModelOf(data: Pick<GameData, 'ctrls'>, index: number): { model: string; scale: number } | null {
  const ctrl = data.ctrls.get(index);
  return ctrl === undefined ? null : { model: ctrl.model, scale: ctrl.scale };
}

/** A loaded model's box in its own space (`m_vMin`, `m_vMax`), from the converter's glb extras; null without one. */
export function boxOf(model: DropModel, key: string): ModelBox | null {
  const box = modelBoxOf(model.root, key);
  return box === null ? null : { min: [box.min[0]!, box.min[1]!, box.min[2]!], max: [box.max[0]!, box.max[1]!, box.max[2]!] };
}

/**
 * 2026-11-15 (guild house): where a ray (D3D: a point and a direction) meets a box first, as a multiple of the direction;
 * null when it misses or the box is behind.
 */
export function rayMeetsObb(orig: readonly number[], dir: readonly number[], obb: Obb): number | null {
  let near = -Infinity, far = Infinity;
  for (let i = 0; i < 3; i++) {
    const axis = obb.axes[i]!;
    const d = (obb.center[0] - orig[0]!) * axis[0] + (obb.center[1] - orig[1]!) * axis[1] + (obb.center[2] - orig[2]!) * axis[2];
    const along = dir[0]! * axis[0] + dir[1]! * axis[1] + dir[2]! * axis[2];
    const e = obb.extents[i]!;
    if (Math.abs(along) < 1e-9) { if (Math.abs(d) > e) return null; continue; }
    let t1 = (d - e) / along, t2 = (d + e) / along;
    if (t1 > t2) [t1, t2] = [t2, t1];
    near = Math.max(near, t1); far = Math.min(far, t2);
    if (near > far) return null;
  }
  if (far < 0) return null;
  return near >= 0 ? near : far;
}

export class CtrlModels {
  readonly views = new Map<number, View>();
  /**
   * 2026-11-15 (guild house): the controls whose model loops its animation (`IsGuildHousingObj` with frames, DPClient.cpp:
   * 1302-1315); none by default.
   */
  looping: (index: number) => boolean = () => false;
  private selected: { id: number; box: LineSegments } | null = null;
  private dead = false;
  private readonly failed = new Set<string>();
  private readonly pending = new Set<Promise<void>>();

  constructor(private readonly scene: Object3D, private readonly data: Pick<GameData, 'ctrls'>, private readonly load: DropLoader,
    private readonly report: (message: string) => void = () => {}) {}

  /** Follows the controls in view: new ones are loaded and placed, gone or changed ones removed. */
  update(ctrls: ReadonlyMap<number, AddedCtrl>, seconds = 0): void {
    for (const [id, view] of this.views) if (ctrls.get(id) !== view.ctrl) this.drop(id, view);
    for (const view of this.views.values()) if (view.model !== undefined && this.looping(view.ctrl.index)) view.model.animate?.(seconds);
    for (const [id, ctrl] of ctrls) {
      if (this.views.has(id)) continue;
      const root = new Group();
      root.position.set(...toWebPosition(ctrl.pos));
      root.rotation.y = webTurn(ctrl.angle);
      root.scale.setScalar(ctrl.scale);
      const view: View = { ctrl, root };
      this.views.set(id, view);
      this.scene.add(root);
      const key = ctrlModelOf(this.data, ctrl.index)?.model;
      if (key === undefined || this.failed.has(key)) continue;
      this.track(this.load(key).then((model) => {
        if (this.dead || this.views.get(id) !== view) { model.release(); return; }
        view.model = model;
        view.box = boxOf(model, key) ?? undefined;
        model.animate?.(0);
        root.add(model.root);
      }).catch((error) => {
        if (!this.dead && !this.failed.has(key)) { this.failed.add(key); this.report(`control ${key}: ${String(error)}`); }
      }));
    }
  }

  /** The world boxes of the drawn controls (`m_OBB`), but `except` (the piece being moved). */
  *boxes(except?: number): Iterable<Obb> {
    for (const [id, view] of this.views) {
      if (id === except || view.box === undefined) continue;
      yield obbOf(view.box, placedMatrix(view.ctrl.scale, view.ctrl.angle, view.ctrl.pos));
    }
  }

  /** 2026-11-15 (guild house): the nearest drawn control a ray (D3D) meets, by its box; null for none. */
  pick(orig: readonly number[], dir: readonly number[], accept: (objectId: number) => boolean = () => true): number | null {
    let best: number | null = null, nearest = Infinity;
    for (const [id, view] of this.views) {
      if (view.box === undefined || !accept(id)) continue;
      const t = rayMeetsObb(orig, dir, obbOf(view.box, placedMatrix(view.ctrl.scale, view.ctrl.angle, view.ctrl.pos)));
      if (t !== null && t < nearest) { nearest = t; best = id; }
    }
    return best;
  }

  /** 2026-11-15 (guild house): the red box round the selected piece (`m_dwSelectedObjID`, WndWorld.cpp:3033-3045), or none. */
  select(objectId: number | null): void {
    if (this.selected?.id === objectId) return;
    this.selected?.box.removeFromParent();
    this.selected?.box.geometry.dispose();
    (this.selected?.box.material as LineBasicMaterial | undefined)?.dispose();
    this.selected = null;
    const view = objectId === null ? undefined : this.views.get(objectId);
    if (objectId === null || view === undefined || view.box === undefined) return;
    const { min, max } = view.box;
    const c = [[min[0], min[1], min[2]], [max[0], min[1], min[2]], [max[0], max[1], min[2]], [min[0], max[1], min[2]],
      [min[0], min[1], max[2]], [max[0], min[1], max[2]], [max[0], max[1], max[2]], [min[0], max[1], max[2]]];
    const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    const points: number[] = [];
    // the model's own space is D3D's: z mirrored as the web's (the root's scale and turn do the rest)
    for (const [a, b] of edges) for (const k of [a, b]) points.push(c[k]![0]!, c[k]![1]!, -c[k]![2]!);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
    const box = new LineSegments(geometry, new LineBasicMaterial({ color: 0xff0000 }));
    view.root.add(box);
    this.selected = { id: objectId, box };
  }

  /** Resolves once the models asked for so far have loaded or failed. Never rejects. */
  async settled(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending]);
  }

  dispose(): void {
    this.dead = true;
    for (const [id, view] of this.views) this.drop(id, view);
  }

  private drop(id: number, view: View): void {
    if (this.selected?.id === id) this.select(null);
    view.root.removeFromParent();
    view.model?.release();
    this.views.delete(id);
  }

  private track(work: Promise<void>): void {
    this.pending.add(work);
    void work.finally(() => this.pending.delete(work));
  }
}

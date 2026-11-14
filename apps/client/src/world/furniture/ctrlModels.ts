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
import { Group } from 'three';
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

export class CtrlModels {
  readonly views = new Map<number, View>();
  private dead = false;
  private readonly failed = new Set<string>();
  private readonly pending = new Set<Promise<void>>();

  constructor(private readonly scene: Object3D, private readonly data: Pick<GameData, 'ctrls'>, private readonly load: DropLoader,
    private readonly report: (message: string) => void = () => {}) {}

  /** Follows the controls in view: new ones are loaded and placed, gone or changed ones removed. */
  update(ctrls: ReadonlyMap<number, AddedCtrl>): void {
    for (const [id, view] of this.views) if (ctrls.get(id) !== view.ctrl) this.drop(id, view);
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

  /** Resolves once the models asked for so far have loaded or failed. Never rejects. */
  async settled(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending]);
  }

  dispose(): void {
    this.dead = true;
    for (const [id, view] of this.views) this.drop(id, view);
  }

  private drop(id: number, view: View): void {
    view.root.removeFromParent();
    view.model?.release();
    this.views.delete(id);
  }

  private track(work: Promise<void>): void {
    this.pending.add(work);
    void work.finally(() => this.pending.delete(work));
  }
}

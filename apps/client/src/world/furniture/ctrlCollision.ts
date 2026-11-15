// 2026-11-15 (post-merge): the placed furniture the movers collide with, as Neuz's movers collide with the controls
// (`OT_CTRL`) of the dynamic link map: `CWorld::ProcessCollision` (`Source/_Common/WorldIntersect.cpp:515-556`) slides a
// move off them, and in a housing world `ProcessUnderCollision` (:1249-1281) stands a mover on them (sim/collision.ts,
// `Ground.controlsNear`). Each control in view whose model has a collision mesh (`collision/<stem>.bin`, the same files
// the world's objects use) is a `CollisionObject` at its world matrix (`placedMatrix`: scale, `RotationY( -angle )`, the
// position); a model without one collides with nothing, as `TestIntersectionOBB_Line` with `bNeedCollObject` turns it away.
//
// Simplified: the controls come in the order ADD_OBJ brought them, all of them, not FOR_LINKMAP's cells around the point
// (a room or a guild house holds a few dozen; the box test turns the far ones away). The collision mesh's bounds stand in
// for the model's box, as for the world's objects (sim/object3d.ts).

import type { AddedCtrl } from '@flyffweb/protocol';
import { collisionKey, decodeCollisionBin } from '@flyffweb/formats';
import type { CollisionObject } from '@flyffweb/scene';
import type { GameData } from '../gameData';
import { ctrlModelOf } from './ctrlModels';
import { placedMatrix } from './placementRules';

/** What the shapes are read from (the page's `AssetStore`). */
export interface ShapeStore {
  /** The hashed URL of a logical key, or null for a file the build does not have. */
  url(key: string): string | null;
  bytes(key: string): Promise<Uint8Array>;
}

/** The collision file of a model key: `models/<stem>.glb` has `collision/<stem>.bin`, or null. */
export function ctrlCollisionKey(model: string): string | null {
  const match = /^models\/(.+)\.glb$/.exec(model);
  return match === null ? null : collisionKey(match[1]!);
}

/** A control's collision object, from its ADD_OBJ and its model's triangles. */
export function ctrlCollisionObject(ctrl: AddedCtrl, triangles: Float32Array, model?: string): CollisionObject {
  return { triangles, matrix: placedMatrix(ctrl.scale, ctrl.angle, ctrl.pos), ...(model !== undefined ? { model } : {}) };
}

export class CtrlCollision {
  /** The controls in view and their object, once their shape is in (null: none, or not yet). */
  private readonly placed = new Map<number, { ctrl: AddedCtrl; object: CollisionObject | null }>();
  /** Each model's shape by its collision key: the triangles, null for a shape that failed or has no file. */
  private readonly shapes = new Map<string, Float32Array | null>();
  private readonly loading = new Map<string, Promise<void>>();
  private list: readonly CollisionObject[] = [];
  private dead = false;

  constructor(private readonly data: Pick<GameData, 'ctrls'>, private readonly store: ShapeStore,
    private readonly report: (message: string) => void = () => {}) {}

  /** The collision objects of the controls in view, in the order they came. */
  get objects(): readonly CollisionObject[] {
    return this.list;
  }

  /** Follows the controls in view (`WorldState.ctrls`): new ones get their object once the shape is in, gone or changed ones go. */
  update(ctrls: ReadonlyMap<number, AddedCtrl>): void {
    let changed = false;
    for (const [id, entry] of this.placed) {
      if (ctrls.get(id) === entry.ctrl) continue;
      this.placed.delete(id);
      changed = true;
    }
    for (const [id, ctrl] of ctrls) {
      if (this.placed.has(id)) continue;
      const entry: { ctrl: AddedCtrl; object: CollisionObject | null } = { ctrl, object: null };
      this.placed.set(id, entry);
      changed = true;
      const model = ctrlModelOf(this.data, ctrl.index)?.model;
      const key = model === undefined ? null : ctrlCollisionKey(model);
      if (key === null) continue;
      const shape = this.shapes.get(key);
      if (shape !== undefined) entry.object = shape === null ? null : ctrlCollisionObject(ctrl, shape, model);
      else this.load(key);
    }
    if (changed) this.relist();
  }

  dispose(): void {
    this.dead = true;
    this.placed.clear();
    this.list = [];
  }

  /** Resolves once the shapes asked for so far are in or failed. Never rejects. */
  async settled(): Promise<void> {
    while (this.loading.size > 0) await Promise.all([...this.loading.values()]);
  }

  private load(key: string): void {
    if (this.loading.has(key)) return;
    if (this.store.url(key) === null) { this.shapes.set(key, null); return; } // no collision mesh
    const work = this.store.bytes(key).then((bytes) => decodeCollisionBin(bytes, key)).catch((error: unknown) => {
      this.report(`control shape ${key}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }).then((triangles) => {
      this.loading.delete(key);
      this.shapes.set(key, triangles);
      if (this.dead || triangles === null) return;
      let changed = false;
      for (const entry of this.placed.values()) {
        const model = ctrlModelOf(this.data, entry.ctrl.index)?.model;
        if (entry.object !== null || model === undefined || ctrlCollisionKey(model) !== key) continue;
        entry.object = ctrlCollisionObject(entry.ctrl, triangles, model);
        changed = true;
      }
      if (changed) this.relist();
    });
    this.loading.set(key, work);
  }

  private relist(): void {
    const list: CollisionObject[] = [];
    for (const entry of this.placed.values()) if (entry.object !== null) list.push(entry.object);
    this.list = list;
  }
}

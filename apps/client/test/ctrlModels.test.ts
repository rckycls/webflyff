// 2026-11-15 (housing): the controls that ADD_OBJ brings (WorldState.ctrls) and their world layer (furniture/ctrlModels.ts).
import { describe, expect, it } from 'vitest';
import { Group } from 'three';
import type { AddedCtrl } from '@flyffweb/protocol';
import { ServerClock } from '../src/net/serverClock';
import { WorldState } from '../src/world/WorldState';
import { terrainGround } from '../src/world/sim/collision';
import { CtrlModels, ctrlModelOf } from '../src/world/furniture/ctrlModels';
import { CtrlCollision } from '../src/world/furniture/ctrlCollision';
import type { ShapeStore } from '../src/world/furniture/ctrlCollision';
import { placedMatrix } from '../src/world/furniture/placementRules';
import { encodeCollisionBin } from '@flyffweb/formats';
import type { DropLoader } from '../src/world/items/groundModels';
import { gameDataOf } from './helpers/movers';

const BED: AddedCtrl = { index: 47, scale: 0.7, pos: [253, 100, 241], angle: 90, objectId: 0x7001 };

function world(): WorldState {
  const clock = new ServerClock(() => 0);
  clock.start(0, 0n);
  return new WorldState(gameDataOf(), clock, terrainGround(() => 100));
}

describe('WorldState.ctrls', () => {
  it('keeps an ADD_OBJ control and forgets it on DEL_OBJ', () => {
    const w = world();
    w.apply(BED.objectId, { type: 'addCtrl', ctrl: BED });
    expect(w.ctrls.get(BED.objectId)).toBe(BED);
    expect(w.movers.size).toBe(0);
    w.apply(BED.objectId, { type: 'delObj' });
    expect(w.ctrls.size).toBe(0);
  });

  it('drops one with a point that is not a number', () => {
    const w = world();
    w.apply(1, { type: 'addCtrl', ctrl: { ...BED, objectId: 1, pos: [Number.NaN, 0, 0] } });
    expect(w.ctrls.size).toBe(0);
  });
});

describe('CtrlModels', () => {
  const data = gameDataOf({ ctrls: new Map([[47, { id: 47, model: 'models/ctrl_houfurbedbasic01.glb', scale: 0.7 }]]) });
  const loads: string[] = [];
  const released: string[] = [];
  const load: DropLoader = async (key) => {
    loads.push(key);
    const root = new Group();
    root.userData = { bbMin: [-1, 0, -1], bbMax: [1, 1, 1] };
    return { root, height: 1, release: () => released.push(key) };
  };

  it('names the model and scale of a control id, none for one not converted', () => {
    expect(ctrlModelOf(data, 47)).toEqual({ model: 'models/ctrl_houfurbedbasic01.glb', scale: 0.7 });
    expect(ctrlModelOf(data, 9999)).toBeNull();
  });

  it('places each control at its point, turn and scale, keeps its box, and lets it go when it leaves', async () => {
    const scene = new Group();
    const layer = new CtrlModels(scene, data, load);
    const ctrls = new Map([[BED.objectId, BED]]);
    layer.update(ctrls);
    await layer.settled();
    expect(loads).toEqual(['models/ctrl_houfurbedbasic01.glb']);
    const root = scene.children[0]!;
    expect(root.position.toArray()).toEqual([253, 100, -241]);
    expect(root.rotation.y).toBeCloseTo(Math.PI / 2);
    expect(root.scale.x).toBeCloseTo(0.7);
    const [box] = [...layer.boxes()];
    expect(box!.center[0]).toBeCloseTo(253);
    expect([...layer.boxes(BED.objectId)]).toEqual([]);
    layer.update(new Map());
    expect(scene.children.length).toBe(0);
    expect(released).toEqual(['models/ctrl_houfurbedbasic01.glb']);
  });
});

describe('CtrlCollision (2026-11-15 post-merge: the movers collide with placed furniture)', () => {
  const data = gameDataOf({ ctrls: new Map([
    [47, { id: 47, model: 'models/ctrl_houfurbedbasic01.glb', scale: 0.7 }],
    [48, { id: 48, model: 'models/ctrl_nocollision.glb', scale: 1 }],
  ]) });
  const triangles = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  function store(): ShapeStore & { asked: string[] } {
    const asked: string[] = [];
    return {
      asked,
      url: (key) => (key === 'collision/ctrl_houfurbedbasic01.bin' ? 'hashed' : null),
      bytes: async (key) => { asked.push(key); return encodeCollisionBin(triangles); },
    };
  }

  it('a control with a collision mesh is an object at its matrix once the shape is in; one without has none', async () => {
    const shapes = store();
    const layer = new CtrlCollision(data, shapes);
    const other: AddedCtrl = { ...BED, index: 48, objectId: 0x7002 };
    layer.update(new Map([[BED.objectId, BED], [other.objectId, other]]));
    expect(layer.objects).toEqual([]);
    await layer.settled();
    expect(layer.objects).toHaveLength(1);
    const object = layer.objects[0]!;
    expect(object.triangles).toEqual(triangles);
    expect(object.matrix).toEqual(placedMatrix(BED.scale, BED.angle, BED.pos));
    // a second one of the same model takes the shape it already has
    const twin: AddedCtrl = { ...BED, objectId: 0x7003, pos: [260, 100, 241] };
    layer.update(new Map([[BED.objectId, BED], [other.objectId, other], [twin.objectId, twin]]));
    expect(layer.objects).toHaveLength(2);
    expect(shapes.asked).toEqual(['collision/ctrl_houfurbedbasic01.bin']);
  });

  it('a control gone, or changed (placed again), loses or remakes its object', async () => {
    const layer = new CtrlCollision(data, store());
    layer.update(new Map([[BED.objectId, BED]]));
    await layer.settled();
    const moved: AddedCtrl = { ...BED, angle: 180 };
    layer.update(new Map([[BED.objectId, moved]]));
    expect(layer.objects[0]!.matrix).toEqual(placedMatrix(moved.scale, moved.angle, moved.pos));
    layer.update(new Map());
    expect(layer.objects).toEqual([]);
  });
});

// 2026-11-15 (housing): the controls that ADD_OBJ brings (WorldState.ctrls) and their world layer (furniture/ctrlModels.ts).
import { describe, expect, it } from 'vitest';
import { Group } from 'three';
import type { AddedCtrl } from '@flyffweb/protocol';
import { ServerClock } from '../src/net/serverClock';
import { WorldState } from '../src/world/WorldState';
import { terrainGround } from '../src/world/sim/collision';
import { CtrlModels, ctrlModelOf } from '../src/world/furniture/ctrlModels';
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

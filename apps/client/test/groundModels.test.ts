import { expect, it } from 'vitest';
import { Group, PerspectiveCamera } from 'three';
import type { GroundItem } from '@flyffweb/protocol';
import { GroundModels } from '../src/world/items/groundModels';
import type { DropModel } from '../src/world/items/groundModels';
import { ownGameData, itemProp } from './helpers/ownState';

const drop = (): GroundItem => ({ index: 502, scale: 2, pos: [0, 0, 3], angle: 20,
  item: { objectId: 0, itemId: 502, count: 1 } });
const ground = { terrainHeight: () => 0, landAttr: () => 0, objectsNear: () => [] };

it('renders the ground box, animates without changing packet state, and halves only mobile display scale', async () => {
  const data = ownGameData();
  data.itemProps.set(502, itemProp({ id: 502, model: null, dropModel: 'models/item_box.glb', reflect: 1 }));
  const times: number[] = [], reflected: boolean[] = [];
  const keys: string[] = [], scene = new Group(), camera = new PerspectiveCamera();
  const models = new GroundModels(scene, data, async (key, reflect) => {
    reflected.push(reflect === true);
    keys.push(key); return { root: new Group(), height: .4, animate: seconds => { times.push(seconds); }, release: () => {} };
  }, () => ground);
  const item = drop(), items = new Map([[1, item]]), original = structuredClone(item);
  models.update(items, camera, 100, false); await Promise.resolve();
  models.update(items, camera, 100, false);
  const root = scene.children[0]!;
  expect(keys).toEqual(['models/item_box.glb']);
  expect(reflected).toEqual([true]);
  expect(root.position.toArray()).toEqual([0, 1.5, -3]);
  expect(root.scale.x).toBe(2);
  models.update(items, camera, 101, true);
  expect(root.scale.x).toBe(1);
  expect(root.position.y).toBeGreaterThan(1.5);
  expect(root.rotation.y).toBeCloseTo(20.5 * Math.PI / 180);
  expect(times.at(-1)).toBeCloseTo(1 / 60);
  models.update(items, camera, 200, false);
  expect(root.position.y).toBeCloseTo(.32);
  expect(root.scale.x).toBe(2);
  models.update(items, camera, 300, false);
  expect(root.position.y).toBeCloseTo(.32);
  expect(item).toEqual(original);
  models.dispose();
});

it('keeps a high received position when the native one-unit throw condition fails', async () => {
  const scene = new Group(), item = drop(); item.pos[1] = 5;
  const models = new GroundModels(scene, ownGameData(), async () => ({ root: new Group(), height: .4, release() {} }), () => ground);
  const items = new Map([[1, item]]), camera = new PerspectiveCamera();
  models.update(items, camera, 0, false); await Promise.resolve();
  models.update(items, camera, 100, false);
  expect(scene.children[0]!.position.y).toBe(5);
  models.dispose();
});

it('releases removed models and late downloads after deletion or disposal', async () => {
  const resolvers: Array<(model: DropModel) => void> = [], scene = new Group();
  let released = 0;
  const models = new GroundModels(scene, ownGameData(), () => new Promise(resolve => resolvers.push(resolve)), () => ground);
  const camera = new PerspectiveCamera(), items = new Map([[1, drop()]]);
  models.update(items, camera, 0, false);
  models.update(new Map(), camera, 0, false);
  resolvers[0]!({ root: new Group(), height: 1, release() { released++; } }); await Promise.resolve();
  expect(released).toBe(1); expect(scene.children).toHaveLength(0);
  models.update(items, camera, 0, false);
  models.dispose();
  resolvers[1]!({ root: new Group(), height: 1, release() { released++; } }); await Promise.resolve();
  expect(released).toBe(2); expect(scene.children).toHaveLength(0);
});

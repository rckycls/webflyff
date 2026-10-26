import {
  AnimationClip, AnimationMixer, Bone, BoxGeometry, BufferAttribute, BufferGeometry, Group, Mesh, MeshBasicMaterial,
  NumberKeyframeTrack, Object3D, Scene, Skeleton, SkinnedMesh, Vector3,
} from 'three';
import type { AnimationAction } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { objectLocalMatrix, toWebPosition } from '@flyffweb/formats';
import type { JobProp, MotionEvents, Vec3, WebItemProp } from '@flyffweb/formats';
import { geometryBytes, loopMotion } from '@flyffweb/scene';
import type { AssembledCharacter, HeldSlot, LoopedMotion, ModelBox } from '@flyffweb/scene';
import { MoverViews } from '../src/world/render/MoverViews';
import type { MoverLook } from '../src/world/render/looks';
import { loadHeldItems, loadMoverModel } from '../src/world/render/moverModels';
import type { HeldItem } from '../src/world/render/moverModels';
import { ActMsg, Mti, ObjSta } from '../src/world/sim/constants';
import { transformCoord } from '../src/world/sim/d3dx';
import { FISTS, attackSpeed } from '../src/world/sim/params';
import type { Mover, WorldChanges } from '../src/world/WorldState';
import { addedNpc, addedPlayer, gameDataOf, moverFrom } from './helpers/movers';

/**
 * A model as the loader gives it: a 2 m box standing on its origin, a joint the motions drive, a release to count, and
 * the boxes added to it.
 */
function fakeModel(): AssembledCharacter & { release: Mock<() => void>; added: ModelBox[] } {
  const root = new Group();
  const box = new Mesh(new BoxGeometry(1, 2, 1).translate(0, 1, 0));
  const joint = new Object3D();
  joint.name = 'joint';
  root.add(box, joint);
  const added: ModelBox[] = [];
  return {
    root,
    mixer: new AnimationMixer(root),
    grips: null,
    box: () => ({ min: [-0.5, 0, -0.5], max: [0.5, 2, 0.5] }),
    addBox: (b) => void added.push(b),
    release: vi.fn<() => void>(),
    added,
  };
}

/**
 * `fakeModel` with a skeleton that can hold things: its right hand (bone 2) 1.5 m up, a skinned part bound to the
 * bones in bone order, and grips that hold with no turn or offset (identity matrices).
 */
function armedModel(): ReturnType<typeof fakeModel> {
  const model = fakeModel();
  const bones = ['bone0', 'bone1', 'hand'].map((name) => Object.assign(new Bone(), { name }));
  bones[1]!.position.y = 1;
  bones[2]!.position.y = 0.5;
  bones[0]!.add(bones[1]!);
  bones[1]!.add(bones[2]!);
  // one vertex at the origin, on bone 0: inside the 2 m box
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(3), 3));
  geometry.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(4), 4));
  geometry.setAttribute('skinWeight', new BufferAttribute(new Float32Array([1, 0, 0, 0]), 4));
  const part = new SkinnedMesh(geometry);
  part.bind(new Skeleton(bones));
  model.root.add(bones[0]!, part);
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  return Object.assign(model, {
    grips: { rHand: 2, lHand: 1, rArm: 1, lArm: 1, localRH: identity, localLH: identity, localShield: identity, localKnuckle: identity },
  });
}

/** A held item as the loader gives it: a 3 m pole across its origin, the box of its glb, and a release to count. */
function heldItem(slot: HeldSlot = 'right'): HeldItem & { release: Mock<() => void> } {
  const item = new Group();
  item.add(new Mesh(new BoxGeometry(0.1, 3, 0.1)));
  Object.assign(item.userData, { bbMin: [-0.05, -1.5, -0.05], bbMax: [0.05, 1.5, 0.05] });
  return { item, slot, release: vi.fn<() => void>() };
}

/** A motion of 31 frames at 30 fps, as the converter writes one (frame i at i / 30 s): its last frame is at 1 s. */
function motion(name: string): LoopedMotion {
  const times = Array.from({ length: 31 }, (_, i) => i / 30);
  return loopMotion(new AnimationClip(name, -1, [new NumberKeyframeTrack('joint.position[x]', times, times)]));
}

/** A motion of `frames` frames at 30 fps (0.5 frames a step, as the client's motions are) whose blows land on `hit`. */
function hitMotion(name: string, frames: number, hit: number[]): LoopedMotion {
  const times = Array.from({ length: frames }, (_, i) => i / 30);
  const clip = new AnimationClip(name, -1, [new NumberKeyframeTrack('joint.position[x]', times, times)]);
  const events: MotionEvents = { hit, sound: [], quake: [], frames, perSlerp: 0.5 };
  clip.userData.events = events;
  return loopMotion(clip);
}

/** The Wooden Sword's row of itemProps.json. */
const WOODEN_SWORD: WebItemProp = {
  id: 21, name: 'Wooden Sword', kind1: 1, kind2: 2, kind3: 2, handed: 1, part: 10, abilityMin: 3, abilityMax: 4,
  weaponType: 1, attackSpeed: Math.fround(0.085), attackRange: 1, destParams: [-1, -1, -1], adjParams: [-1, -1, -1],
  sfxHit: 20, model: 'models/item_weaswowooden.glb', icon: 'ui/item/itm_weaswowooden.png',
};

/** Every motion of the look is `m<id>`. */
const look: MoverLook = {
  skeleton: 'skeleton', parts: ['part'], motion: (id) => `m${id}`, hairColor: null, held: { right: null, left: null },
};

interface Rig {
  scene: Scene;
  views: MoverViews;
  load: ReturnType<typeof vi.fn>;
  overlay: { error: ReturnType<typeof vi.fn>; addGpuBytes: ReturnType<typeof vi.fn> };
  movers: Map<number, Mover>;
  /** The motions loaded, by key. */
  motions: Map<string, LoopedMotion>;
  add(mover: Mover): void;
  remove(objectId: number): void;
}

interface RigOptions {
  /** The motion files of these keys, or a load of one to resolve later; any other is `motion(key)`. */
  motions?: Record<string, () => LoopedMotion | Promise<LoopedMotion>>;
  /** The item catalog, for the weapon sets; empty by default. */
  itemProps?: ReadonlyMap<number, WebItemProp>;
}

function rig(
  loadModel: (look: MoverLook, report: (message: string) => void) => Promise<AssembledCharacter | Object3D> =
    async () => fakeModel(),
  lookFor: (mover: Mover) => MoverLook | null = () => look,
  loadHeld: (look: MoverLook, report: (message: string) => void) => Promise<HeldItem[]> = async () => [],
  options: RigOptions = {},
): Rig {
  const scene = new Scene();
  const load = vi.fn(loadModel);
  const overlay = { error: vi.fn(), addGpuBytes: vi.fn() };
  const motions = new Map<string, LoopedMotion>();
  const loadMotion = async (key: string) => {
    const loaded = await (options.motions?.[key]?.() ?? motion(key));
    motions.set(key, loaded);
    return loaded;
  };
  const views = new MoverViews(scene, load, overlay, lookFor, loadMotion, loadHeld, options.itemProps ?? new Map());
  const movers = new Map<number, Mover>();
  const sync = (changes: WorldChanges) => views.sync(changes, movers);
  return {
    scene, views, load, overlay, movers, motions,
    add(mover) {
      movers.set(mover.objectId, mover);
      sync({ added: [mover], removed: [], combat: [], own: [] });
    },
    remove(objectId) {
      movers.delete(objectId);
      sync({ added: [], removed: [objectId], combat: [], own: [] });
    },
  };
}

const inScene = (scene: Scene, object: Object3D): boolean => scene.getObjectById(object.id) === object;

/** A deferred model, to resolve after the test has done something. */
function later(): { promise: Promise<AssembledCharacter>; resolve: (model: AssembledCharacter) => void } {
  let resolve!: (model: AssembledCharacter) => void;
  const promise = new Promise<AssembledCharacter>((r) => (resolve = r));
  return { promise, resolve };
}

describe('MoverViews', () => {
  it('adds a view for an added mover', async () => {
    const model = fakeModel();
    const r = rig(async () => model);
    const aibatt = moverFrom(addedNpc(7, 21, {}, { pos: [6970, 100, 3330], angle: 90, scale: 1.5 }));
    r.add(aibatt);
    await r.views.settled();
    r.views.update(r.movers, 0);

    expect(r.load).toHaveBeenCalledWith(look, expect.any(Function));
    expect(inScene(r.scene, model.root)).toBe(true);
    const holder = model.root.parent!;
    expect(holder.position.toArray()).toEqual(toWebPosition(aibatt.act.body.pos));
    expect(holder.rotation.y).toBeCloseTo((90 * Math.PI) / 180, 6);
    expect(holder.scale.toArray()).toEqual([1.5, 1.5, 1.5]);
    // the name tag goes on the top of the model, scaled with it
    expect(r.views.placeOf(7)).toEqual({ at: toWebPosition(aibatt.act.body.pos), head: [6970, 103, -3330] });
    expect(r.views.count()).toBe(1);
  });

  it('releases a model that resolves after its mover was removed', async () => {
    const pending = later();
    const r = rig(() => pending.promise);
    r.add(moverFrom(addedNpc(7, 21)));
    r.remove(7);
    const model = fakeModel();
    pending.resolve(model);
    await r.views.settled();

    expect(model.release).toHaveBeenCalledTimes(1);
    expect(inScene(r.scene, model.root)).toBe(false);
    expect(r.views.placeOf(7)).toBeNull();
    expect(r.views.count()).toBe(0);
    expect(r.overlay.error).not.toHaveBeenCalled();
  });

  it('a mover without a look gets the placeholder', async () => {
    const r = rig(undefined, () => null);
    r.add(moverFrom(addedNpc(7, 999, {}, { pos: [10, 20, 30] })));
    await r.views.settled();

    expect(r.load).not.toHaveBeenCalled();
    const placeholder = r.scene.getObjectByName('placeholder');
    expect(placeholder).toBeDefined();
    // a figure a little taller than a person, with its name tag on top
    expect(r.views.placeOf(7)).toEqual({ at: [10, 20, -30], head: [10, 21.8, -30] });
  });

  it('a model that cannot be loaded gets the placeholder, and the overlay says why, once', async () => {
    const r = rig(async () => {
      throw new Error('asset "models/mvr_lost.glb" is not in the asset index');
    });
    r.add(moverFrom(addedNpc(7, 21)));
    await r.views.settled();

    expect(r.scene.getObjectByName('placeholder')).toBeDefined();
    expect(r.overlay.error).toHaveBeenCalledTimes(1);
    expect(r.overlay.error.mock.calls[0]![0]).toContain('models/mvr_lost.glb');
    expect(r.load).toHaveBeenCalledTimes(1);
  });

  it('a model that throws as it is put on screen gets the placeholder, and the overlay says why; the rest goes on', async () => {
    const broken = fakeModel();
    broken.mixer.clipAction = () => {
      throw new Error('the motion does not fit the skeleton');
    };
    const good = fakeModel();
    const r = rig(vi.fn().mockResolvedValueOnce(broken).mockResolvedValueOnce(good));
    r.add(moverFrom(addedNpc(7, 21)));
    r.add(moverFrom(addedNpc(8, 21)));
    // settles, so the world screen's loading is not ended by one bad model
    await expect(r.views.settled()).resolves.toBeUndefined();

    expect(r.overlay.error).toHaveBeenCalledTimes(1);
    expect(r.overlay.error.mock.calls[0]![0]).toMatch(/^mover 21.*: the motion does not fit the skeleton$/);
    expect(broken.release).toHaveBeenCalledTimes(1);
    expect(inScene(r.scene, broken.root)).toBe(false);
    expect(r.scene.getObjectByName('mover 7')!.getObjectByName('placeholder')).toBeDefined();
    expect(r.views.placeOf(7)!.head[1]).toBeCloseTo(r.views.placeOf(7)!.at[1] + 1.8, 6);
    // the GPU estimate holds the good model alone (the two are the same box): whatever the broken one added is taken back
    const gpu = r.overlay.addGpuBytes.mock.calls.map(([n]) => n as number);
    expect(gpu.reduce((a, b) => a + b, 0)).toBe(gpu.find((n) => n > 0));
    expect(inScene(r.scene, good.root)).toBe(true);
    expect(r.views.count()).toBe(1);
  });

  it('says nothing on the overlay once disposed: a model that fails after it, or a part error of one still loading', async () => {
    const failing = later();
    const reporting = later();
    let reportPart!: (message: string) => void;
    const r = rig(vi.fn()
      .mockReturnValueOnce(failing.promise.then(() => {
        throw new Error('asset "models/mvr_lost.glb" is not in the asset index');
      }))
      .mockImplementationOnce((_look: MoverLook, report: (message: string) => void) => {
        reportPart = report;
        return reporting.promise;
      }));
    r.add(moverFrom(addedNpc(7, 21)));
    r.add(moverFrom(addedNpc(8, 21)));
    r.views.dispose();
    failing.resolve(fakeModel());
    reportPart('part models/part_lost.glb: not in the asset index');
    reporting.resolve(fakeModel());
    await r.views.settled();

    expect(r.overlay.error).not.toHaveBeenCalled();
  });

  it('removing a mover releases its textures', async () => {
    const model = fakeModel();
    const r = rig(async () => model);
    r.add(moverFrom(addedNpc(7, 21)));
    await r.views.settled();
    const holder = model.root.parent!;
    r.remove(7);

    expect(model.release).toHaveBeenCalledTimes(1);
    expect(inScene(r.scene, holder)).toBe(false);
    // the GPU estimate gets back what the model added
    const added = r.overlay.addGpuBytes.mock.calls.map(([n]) => n as number);
    expect(added.reduce((a, b) => a + b, 0)).toBe(0);
    expect(added.some((n) => n > 0)).toBe(true);
  });

  it('a sitting mover gets up when its motion has played, not after one step', async () => {
    const r = rig();
    const npc = moverFrom(addedNpc(7, 21));
    r.add(npc);
    await r.views.settled();
    npc.act.sendActMsg(ActMsg.SITDOWN);
    expect(npc.act.motion).toBe(Mti.SIT);
    // the step the rules sat down in asks for the SIT motion, which has not played to its end while it loads
    r.views.step(r.movers);
    expect(npc.act.isEndFrame()).toBe(false);
    await r.views.settled();
    // 31 frames at 30 fps: a second of steps, and its last frame is passed on the next
    for (let i = 1; i < 60; i++) {
      r.views.step(r.movers);
      expect(npc.act.isEndFrame()).toBe(false);
    }
    r.views.step(r.movers);
    expect(npc.act.isEndFrame()).toBe(true);
  });

  describe('pickCandidates (what CWorld::PickObject_Fast tests: the box, the matrix, dead and player)', () => {
    /** The `objectLocalMatrix` of a mover, as an oracle: its record's other fields are not read. */
    const matrixOf = (pos: Vec3, angle: number, scale: number): Float32Array => objectLocalMatrix({
      objType: 5, angle, axis: [0, 0, 0], position: pos, scale: [scale, scale, scale], type: 5, index: 0, motion: 0, ai: 0, ai2: 0,
      extraBytes: 0,
    });

    it("gives each mover drawn: its model's box, the matrix it stands in, dead and player; the mover left out is not among them", async () => {
      const r = rig(async () => fakeModel(), (mover) => (mover.isSelf ? null : look));
      r.add(moverFrom(addedNpc(7, 21, {}, { pos: [0, 0, -10], angle: 90, scale: 1.5 })));
      const dead = moverFrom(addedPlayer(8, {}, { pos: [3, 1, 4], angle: 20, state: ObjSta.DEAD }));
      r.add(dead);
      r.add(moverFrom(addedPlayer(9, { self: true }, { pos: [0, 0, -15] })));
      await r.views.settled();
      r.views.update(r.movers, 0);

      expect(r.views.pickCandidates(9).map((c) => c.objectId).sort()).toEqual([7, 8]);
      // the own character has no look in this rig: it is the placeholder, and a candidate unless it is left out
      expect(r.views.pickCandidates(undefined).map((c) => c.objectId).sort()).toEqual([7, 8, 9]);
      const found = r.views.pickCandidates(9);
      const npc = found.find((c) => c.objectId === 7)!;
      expect(npc.box).toEqual({ min: [-0.5, 0, -0.5], max: [0.5, 2, 0.5] });
      expect(npc).toMatchObject({ dead: false, isPlayer: false });
      Array.from(matrixOf([0, 0, -10], 90, 1.5)).forEach((v, i) => expect(npc.world[i]).toBeCloseTo(v, 4));
      const player = found.find((c) => c.objectId === 8)!;
      expect(player).toMatchObject({ dead: true, isPlayer: true });
      // the angle the mover has: `CObj::SetAngle` keeps it in steps of 360 / 65536 degrees
      Array.from(matrixOf([3, 1, 4], dead.act.body.angle, 1)).forEach((v, i) => expect(player.world[i]).toBeCloseTo(v, 4));
    });

    it('stands the box where the model is drawn: a point of the box through the matrix is the drawn point', async () => {
      const r = rig();
      r.add(moverFrom(addedNpc(7, 21, {}, { pos: [6970, 100, 3330], angle: 137, scale: 1.5 })));
      await r.views.settled();
      r.views.update(r.movers, 0);
      r.scene.updateMatrixWorld();
      const npc = r.views.pickCandidates(undefined)[0]!;
      const holder = r.scene.getObjectByName('mover 7')!;
      for (const corner of [[0.5, 2, -0.5], [-0.5, 0, 0.5], [0.5, 0, 0.5]] as Vec3[]) {
        // the model's meshes are in web coordinates (z mirrored), the box and the matrix in D3D
        const drawn = holder.localToWorld(new Vector3(corner[0], corner[1], -corner[2])).toArray();
        const picked = toWebPosition(transformCoord(corner, npc.world));
        picked.forEach((v, i) => expect(v).toBeCloseTo(drawn[i]!, 2));
      }
    });

    it('follows the drawn pose, not the rules position: a mover is drawn an eighth of the way to it a step', async () => {
      const r = rig();
      const npc = moverFrom(addedNpc(7, 21, {}, { pos: [0, 0, -10] }));
      r.add(npc);
      await r.views.settled();
      npc.act.body.pos = [8, 0, -10];
      expect(r.views.pickCandidates(undefined)[0]!.world[12]).toBe(0);
      r.views.step(r.movers);
      expect(r.views.pickCandidates(undefined)[0]!.world[12]).toBeCloseTo(1, 5);
    });

    it('gives a mover that is the placeholder a box of its own, and none that has nothing drawn yet', async () => {
      const pending = later();
      const r = rig(() => pending.promise, (mover) => (mover.objectId === 7 ? null : look));
      r.add(moverFrom(addedNpc(7, 21, {}, { pos: [0, 0, -10] })));
      r.add(moverFrom(addedNpc(8, 21, {}, { pos: [0, 0, -20] })));
      // 7 is the placeholder, a capsule 0.3 m round and 1.8 m high; 8 is loading
      expect(r.views.pickCandidates(undefined)).toEqual([
        expect.objectContaining({ objectId: 7, box: { min: [-0.3, 0, -0.3], max: [0.3, 1.8, 0.3] } }),
      ]);
      pending.resolve(fakeModel());
      await r.views.settled();
      expect(r.views.pickCandidates(undefined).map((c) => c.objectId).sort()).toEqual([7, 8]);
      r.remove(7);
      expect(r.views.pickCandidates(undefined).map((c) => c.objectId)).toEqual([8]);
    });
  });

  it('plays the motion the rules set', async () => {
    const model = fakeModel();
    const r = rig(async () => model);
    const npc = moverFrom(addedNpc(7, 21));
    r.add(npc);
    await r.views.settled();
    npc.act.sendActMsg(ActMsg.FORWARD);
    r.views.step(r.movers);
    r.views.update(r.movers, 1 / 60);
    await r.views.settled();
    r.views.update(r.movers, 1 / 60);

    expect(model.mixer.existingAction(r.motions.get(`m${Mti.RUN}`)!.clip)?.isRunning()).toBe(true);
    // the standing motion blends out over 20 steps
    expect(model.mixer.existingAction(r.motions.get(`m${Mti.STAND}`)!.clip)?.getEffectiveWeight()).toBeLessThan(1);
  });

  it('draws others 1/8 of the way to where the rules put them each step, and the own character where it is', async () => {
    const r = rig();
    const other = moverFrom(addedNpc(7, 21, {}, { pos: [0, 0, 0] }));
    const self = moverFrom(addedPlayer(8, { self: true }, { pos: [0, 0, 0] }));
    r.add(other);
    r.add(self);
    await r.views.settled();
    other.act.body.pos = [8, 0, 0];
    self.act.body.pos = [8, 0, 0];
    r.views.step(r.movers);
    r.views.update(r.movers, 0);

    expect(r.views.placeOf(7)!.at[0]).toBeCloseTo(1, 6);
    expect(r.views.placeOf(8)!.at[0]).toBe(8);
    // SETPOS: InitInterpolation puts the drawn position on the mover at once
    r.views.snap(7);
    r.views.update(r.movers, 0);
    expect(r.views.placeOf(7)!.at[0]).toBe(8);
  });

  it('dispose releases every model, including one still loading', async () => {
    const pending = later();
    const loaded = fakeModel();
    const r = rig(vi.fn().mockResolvedValueOnce(loaded).mockReturnValueOnce(pending.promise));
    r.add(moverFrom(addedNpc(7, 21)));
    await r.views.settled();
    r.add(moverFrom(addedNpc(8, 21)));
    r.views.dispose();
    const late = fakeModel();
    pending.resolve(late);
    await r.views.settled();

    expect(loaded.release).toHaveBeenCalledTimes(1);
    expect(late.release).toHaveBeenCalledTimes(1);
    expect(r.scene.children).toEqual([]);
  });

  describe('the items of the hands', () => {
    it('go in the hand once the body is on screen, into its box, and the name tag stays on top of the body', async () => {
      const model = armedModel();
      const sword = heldItem();
      const loadHeld = vi.fn(async () => [sword]);
      const r = rig(async () => model, undefined, loadHeld);
      r.add(moverFrom(addedPlayer(7, {}, { pos: [0, 0, 0] })));
      await r.views.settled();
      r.views.update(r.movers, 0);
      r.scene.updateMatrixWorld();

      expect(loadHeld).toHaveBeenCalledWith(look, expect.any(Function));
      // it hangs from the right hand, 1.5 m up, and goes up to 3 m
      const hand = model.root.getObjectByName('hand')!;
      expect(sword.item.parent?.parent).toBe(hand);
      expect(new Vector3().setFromMatrixPosition(sword.item.matrixWorld).y).toBeCloseTo(1.5, 6);
      expect(model.added).toEqual([{ min: [-0.05, -1.5, -0.05], max: [0.05, 1.5, 0.05] }]);
      // the top of the body as before: the 2 m box (MoverRender.cpp:1349 projects the model's box, where a weapon
      // adds only its own box, at the model's origin)
      expect(r.views.placeOf(7)!.head[1]).toBeCloseTo(2, 6);
      // the GPU estimate holds the sword too, and gets it all back with the mover
      const sum = (): number => r.overlay.addGpuBytes.mock.calls.reduce((a, [n]) => a + (n as number), 0);
      let drawn = 0;
      model.root.traverse((object) => {
        if (object instanceof Mesh) drawn += geometryBytes(object.geometry);
      });
      expect(sum()).toBe(drawn);
      expect(drawn).toBeGreaterThan(geometryBytes((sword.item.children[0] as Mesh).geometry));
      r.remove(7);
      expect(sword.release).toHaveBeenCalledTimes(1);
      expect(model.release).toHaveBeenCalledTimes(1);
      expect(sum()).toBe(0);
      expect(r.overlay.error).not.toHaveBeenCalled();
    });

    it('are let go when the body never comes: the mover left, or its model cannot be had', async () => {
      const pending = later();
      const gone = heldItem();
      const r = rig(() => pending.promise, undefined, async () => [gone]);
      r.add(moverFrom(addedPlayer(7)));
      r.remove(7);
      pending.resolve(armedModel());
      await r.views.settled();
      expect(gone.release).toHaveBeenCalledTimes(1);

      const lost = heldItem();
      const failing = rig(async () => {
        throw new Error('asset "skeletons/mvr_male.glb" is not in the asset index');
      }, undefined, async () => [lost]);
      failing.add(moverFrom(addedPlayer(8)));
      await failing.views.settled();
      expect(lost.release).toHaveBeenCalledTimes(1);
      expect(failing.overlay.error).toHaveBeenCalledTimes(1); // the model's failure, said once
    });

    it('one that cannot be held is let go and said, and the others still go in their hands', async () => {
      // a skeleton without grips (an older conversion) holds nothing
      const unarmed = fakeModel();
      const sword = heldItem();
      const r = rig(async () => unarmed, undefined, async () => [sword]);
      r.add(moverFrom(addedPlayer(7)));
      await r.views.settled();
      expect(sword.release).toHaveBeenCalledTimes(1);
      expect(r.overlay.error).toHaveBeenCalledTimes(1);
      expect(r.overlay.error.mock.calls[0]![0]).toMatch(/^mover 11.*: the skeleton has no grips/);
      expect(r.views.count()).toBe(1); // the body is drawn all the same

      const model = armedModel();
      const shield = heldItem('shield');
      const broken = heldItem('right');
      broken.item.userData.bbMin = [0, 0];
      const both = rig(async () => model, undefined, async () => [broken, shield]);
      both.add(moverFrom(addedPlayer(8)));
      await both.views.settled();
      expect(broken.release).toHaveBeenCalledTimes(1);
      expect(broken.item.parent).toBeNull();
      expect(shield.item.parent?.parent).toBe(model.root.getObjectByName('bone1'));
      expect(both.overlay.error).toHaveBeenCalledTimes(1);
    });

    it('dispose lets the held items go with their models', async () => {
      const sword = heldItem();
      const r = rig(async () => armedModel(), undefined, async () => [sword]);
      r.add(moverFrom(addedPlayer(7)));
      await r.views.settled();
      r.views.dispose();

      expect(sword.release).toHaveBeenCalledTimes(1);
    });
  });

  describe('attacks, hits and deaths', () => {
    /** `JOB_VAGRANT`'s base of the attack speed (`Resource/propJob.inc:3`); `attackSpeed` reads no other column. */
    const VAGRANT = { attackSpeed: 75 } as JobProp;
    type FakeModel = ReturnType<typeof fakeModel>;

    /** A rig whose models are kept, in the order the movers came. */
    function armedRig(options: RigOptions = {}, lookFor?: (mover: Mover) => MoverLook | null): Rig & { models: FakeModel[] } {
      const models: FakeModel[] = [];
      const r = rig(async () => {
        const model = fakeModel();
        models.push(model);
        return model;
      }, lookFor, undefined, options);
      return Object.assign(r, { models });
    }

    /** A bare-handed Vagrant (object 7) and an Aibatt (object 8) 2 m east of it, in view, each finding the other. */
    function duel(r: Rig): { player: Mover; monster: Mover } {
      const player = moverFrom(addedPlayer(7));
      const monster = moverFrom(addedNpc(8, 21, {}, { pos: [102, 0, 100] }));
      const byId = new Map([[7, player.act], [8, monster.act]]);
      for (const m of [player, monster]) {
        m.act.findMover = (id) => byId.get(id);
        r.add(m);
      }
      return { player, monster };
    }

    /** A rules step of `movers` (`WorldState.step`), then the views' (`WorldScreen.step`), then a frame drawn. */
    function stepAll(r: Rig, ...movers: Mover[]): void {
      for (const m of movers) m.act.step();
      r.views.step(r.movers);
      r.views.update(r.movers, 1 / 60);
    }

    /** The action a model was last told to play. */
    const lastAction = (clipAction: Mock): AnimationAction => clipAction.mock.results.at(-1)!.value as AnimationAction;

    it('a player swings at its attack speed: the hit frame goes by on the 29th frame move and the swing ends on the 39th, on the 44th after a 5-step hit pause', async () => {
      const speed = attackSpeed(VAGRANT, FISTS.attackSpeed, 1, 15).speed;
      expect(speed).toBe(Math.fround(0.8416128754615784));
      for (const pause of [0, 5]) {
        // the bare hand's MTI_ATK1 in combat (+200): Mvr_male_AtkAtk1-01, 17 frames, the blow on frame 12 ([combat §2.5])
        const r = armedRig({ motions: { m223: () => hitMotion('m223', 17, [12]) } });
        const { player, monster } = duel(r);
        await r.views.settled();
        const clipAction = vi.spyOn(r.models[0]!.mixer, 'clipAction') as unknown as Mock;
        player.act.attackSpeed = () => speed;
        let now = 0;
        const hits: number[] = [];
        const ends: number[] = [];
        // OnAttackMelee pauses a player's model (MoverActEvent.cpp:1693-1696)
        player.act.onHit = () => {
          hits.push(now);
          if (pause > 0) player.act.pause(pause);
        };
        player.act.onAttackEnd = () => ends.push(now);
        expect(player.act.sendActMsg(ActMsg.ATK1, 8)).toBe(true);
        let passed = 0;
        let ended = 0;
        const timeScales = new Map<number, number>();
        for (now = 1; now <= 60; now++) {
          stepAll(r, player, monster);
          // the swing's file comes in after the first step asked for it; that step's frame move is made up for
          if (now === 1) await r.views.settled();
          if (passed === 0 && player.act.isAttrHit() === 0) passed = now;
          if (ended === 0 && (player.act.state & ObjSta.ATK_ALL) !== 0 && player.act.isEndFrame()) ended = now;
          if (now >= 2 && now <= 40) timeScales.set(now, lastAction(clipAction).timeScale);
        }
        // Steps count from the one that starts the swing. `_ProcessStateAttack` reads the model before the step moves its
        // frame (`CMover::Process`, Mover.cpp:3819-3862), so the rules see the hit and the end a step after the frame move.
        expect(passed).toBe(29);
        expect(hits).toEqual([30]);
        expect(ended).toBe(39 + pause);
        expect(ends).toEqual([40 + pause]);
        // on screen the swing plays at the attack speed, and holds still while the model is paused; then it stands
        expect(timeScales.get(29)).toBe(speed);
        expect(timeScales.get(30)).toBe(pause > 0 ? 0 : speed);
        expect(timeScales.get(34)).toBe(pause > 0 ? 0 : speed);
        expect(timeScales.get(35)).toBe(speed);
        await r.views.settled();
        r.views.update(r.movers, 1 / 60);
        expect(lastAction(clipAction).getClip().name).toBe('m200');
        expect(lastAction(clipAction).timeScale).toBe(1);
      }
    });

    it('a monster swings at speed 1 whatever its attack speed (ProcessAniSpeed, Mover.cpp:3141-3143)', async () => {
      // Mvr_AiBatt_atk1: 52 frames, the blow on frame 21
      const r = armedRig({ motions: { m23: () => hitMotion('m23', 52, [21]) } });
      const { player, monster } = duel(r);
      await r.views.settled();
      monster.act.attackSpeed = () => 2;
      let now = 0;
      const hits: number[] = [];
      const ends: number[] = [];
      monster.act.onHit = () => hits.push(now);
      monster.act.onAttackEnd = () => ends.push(now);
      expect(monster.act.meleeAttack(ActMsg.ATK1, 7)).toBe(true);
      for (now = 1; now <= 110; now++) {
        stepAll(r, player, monster);
        if (now === 1) await r.views.settled();
        expect(monster.act.aniSpeed).toBe(1);
      }
      // half a frame a step: frame 21 at the 42nd frame move, past the last (51) at the 103rd
      expect(hits).toEqual([43]);
      expect(ends).toEqual([104]);
    });

    it('plays the weapon\'s motion set in combat: +200 bare-handed or with a one-handed sword, +800 two-handed, none for a monster', async () => {
      const BIG_SWORD: WebItemProp = { ...WOODEN_SWORD, id: 22, name: 'Big Sword', handed: 2 };
      const held = new Map<number, number | null>([[7, null], [9, 21], [10, 22]]);
      const r = armedRig(
        { itemProps: new Map([[21, WOODEN_SWORD], [22, BIG_SWORD]]) },
        (m) => ({ ...look, held: { right: held.get(m.objectId) ?? null, left: null } }),
      );
      const { player, monster } = duel(r);
      const one = moverFrom(addedPlayer(9));
      const two = moverFrom(addedPlayer(10));
      r.add(one);
      r.add(two);
      await r.views.settled();
      const asked = r.models.map((model) => vi.spyOn(model.mixer, 'clipAction') as unknown as Mock);
      // out of combat each plays the plain motion
      expect(r.motions.has(`m${Mti.STAND}`)).toBe(true);
      expect(r.motions.has('m200')).toBe(false);
      for (const m of [player, one, two]) {
        m.act.findMover = () => monster.act;
        expect(m.act.sendActMsg(ActMsg.ATK1, 8)).toBe(true);
      }
      monster.act.findMover = () => player.act;
      expect(monster.act.sendActMsg(ActMsg.ATK1, 7)).toBe(true);
      stepAll(r, player, monster, one, two);
      await r.views.settled();
      r.views.update(r.movers, 1 / 60);
      expect(asked.map((spy) => lastAction(spy).getClip().name)).toEqual(['m223', 'm23', 'm223', 'm823']);
    });

    it('a dead mover holds the last frame of MTI_DIE1', async () => {
      const r = armedRig();
      const npc = moverFrom(addedNpc(7, 21));
      r.add(npc);
      await r.views.settled();
      expect(npc.act.sendActMsg(ActMsg.DIE, ActMsg.DAMAGE, 0)).toBe(true);
      stepAll(r, npc);
      await r.views.settled();
      for (let i = 0; i < 90; i++) stepAll(r, npc);
      expect(npc.act.state).toBe(ObjSta.DEAD);
      expect(npc.act.motion).toBe(Mti.DIE1);
      expect(npc.act.isEndFrame()).toBe(true);
      // on screen: played once and stopped on its last frame (frame 30, x = 1), not blended back into its first
      expect(r.models[0]!.root.getObjectByName('joint')!.position.x).toBeCloseTo(1, 6);
    });

    it('a swing set again as the last one ends plays again from its start', async () => {
      const r = armedRig({ motions: { m23: () => hitMotion('m23', 17, [12]) } });
      const { player, monster } = duel(r);
      await r.views.settled();
      let now = 0;
      const hits: number[] = [];
      monster.act.onHit = () => hits.push(now);
      // the second is kept while the first plays (OnMeleeAttack), and starts as the first ends
      monster.act.meleeAttack(ActMsg.ATK1, 7);
      monster.act.meleeAttack(ActMsg.ATK1, 7);
      for (now = 1; now <= 80; now++) {
        stepAll(r, player, monster);
        if (now === 1) await r.views.settled();
      }
      // at speed 1: the hit at the 24th frame move, the end at the 33rd; the second swing starts in step 34
      expect(hits).toEqual([25, 58]);
    });

    it('a swing whose file comes in after its hit frame still hits, once', async () => {
      let resolve!: (motion: LoopedMotion) => void;
      const late = new Promise<LoopedMotion>((done) => (resolve = done));
      const r = armedRig({ motions: { m23: () => late } });
      const { player, monster } = duel(r);
      await r.views.settled();
      let now = 0;
      const hits: number[] = [];
      const ends: number[] = [];
      monster.act.onHit = () => hits.push(now);
      monster.act.onAttackEnd = () => ends.push(now);
      expect(monster.act.meleeAttack(ActMsg.ATK1, 7)).toBe(true);
      // at speed 1 the blow (frame 12) goes by at the 24th frame move, while the swing's file still loads
      for (now = 1; now <= 30; now++) stepAll(r, player, monster);
      expect(hits).toEqual([]);
      resolve(hitMotion('m23', 17, [12]));
      await r.views.settled();
      for (now = 31; now <= 60; now++) stepAll(r, player, monster);
      // Neuz has the file at once and hits in step 25. Here the 30 waiting frame moves are made as it comes in, and the
      // hit one of them passed goes to the next test of the rules; the swing still ends on time, at the 33rd frame move.
      expect(hits).toEqual([31]);
      expect(ends).toEqual([34]);
    });

    it('says once that an attack motion has no hit frame', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        const r = armedRig(); // every motion: 31 frames, and no events (an older conversion)
        const { player, monster } = duel(r);
        await r.views.settled();
        for (let swing = 0; swing < 2; swing++) {
          expect(monster.act.meleeAttack(ActMsg.ATK1, 7)).toBe(true);
          for (let now = 1; now <= 70; now++) {
            stepAll(r, player, monster);
            if (now === 1) await r.views.settled();
          }
          expect(monster.act.state & ObjSta.ATK_ALL).toBe(0);
        }
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0]![0]).toMatch(/^motion m23: /);
      } finally {
        warn.mockRestore();
      }
    });
  });
});

describe('loadHeldItems', () => {
  const YOYO: WebItemProp = { ...WOODEN_SWORD, id: 381, name: 'Itun', kind3: 11, model: 'models/item_weayoyiron.glb' };
  const data = gameDataOf({ itemProps: new Map([[21, WOODEN_SWORD], [381, YOYO]]) });
  const holding = (right: number | null, left: number | null = null): MoverLook => ({ ...look, held: { right, left } });

  /** Services whose glbs are a scene with a textured mesh in its lod0, a lod1, and the box `extras` on the scene. */
  function itemServices(missing: readonly string[] = []) {
    const bytes = vi.fn(async (key: string): Promise<Uint8Array> => {
      if (missing.includes(key)) throw new Error(`${key} is not in the asset index`);
      return new Uint8Array(4);
    });
    const parseAsync = vi.fn(async () => {
      const scene = new Group();
      for (const name of ['lod0', 'lod1']) {
        const material = new MeshBasicMaterial();
        material.userData.texture = `textures/${name}.ktx2`;
        const lod = new Mesh(new BoxGeometry(0.1, 0.8, 0.1), material);
        lod.name = name;
        scene.add(lod);
      }
      Object.assign(scene.userData, { bbMin: [-0.08, -0.03, -0.1], bbMax: [0.74, 0.03, 0.1] });
      return { scene };
    });
    const textures = { acquire: vi.fn(async () => null), release: vi.fn() };
    const services = { store: { bytes }, loaders: { gltf: { parseAsync } }, textures } as unknown as Parameters<typeof loadHeldItems>[0];
    return { services, bytes, textures };
  }

  it('gives each item of the hands, its lod0 with its textures and the box of its glb, in its slot', async () => {
    const { services, bytes, textures } = itemServices();

    const items = await loadHeldItems(services, data)(holding(21), vi.fn());

    expect(items.map((h) => h.slot)).toEqual(['right']);
    expect(bytes).toHaveBeenCalledWith('models/item_weaswowooden.glb');
    const { item } = items[0]!;
    expect(item.children.map((c) => c.name)).toEqual(['lod0']);
    expect(item.userData).toMatchObject({ bbMin: [-0.08, -0.03, -0.1], bbMax: [0.74, 0.03, 0.1] });
    expect(textures.acquire).toHaveBeenCalledWith('textures/lod0.ktx2');
    items[0]!.release();
    expect(textures.release).toHaveBeenCalledWith('textures/lod0.ktx2');
  });

  it('loads a yoyo once for each hand, and gives nothing for empty hands', async () => {
    const { services } = itemServices();
    const yoyos = await loadHeldItems(services, data)(holding(381), vi.fn());
    expect(yoyos.map((h) => h.slot)).toEqual(['right', 'left']);
    expect(yoyos[0]!.item).not.toBe(yoyos[1]!.item);
    expect(await loadHeldItems(services, data)(holding(null), vi.fn())).toEqual([]);
  });

  it('leaves the hand of a model it cannot load empty, says so once, and does not ask for it again', async () => {
    const { services, bytes } = itemServices(['models/item_weayoyiron.glb']);
    const report = vi.fn();
    const load = loadHeldItems(services, data);

    await expect(load(holding(381), report)).resolves.toEqual([]);
    await expect(load(holding(381), report)).resolves.toEqual([]);
    expect(report.mock.calls).toEqual([['held item models/item_weayoyiron.glb: models/item_weayoyiron.glb is not in the asset index']]);
    expect(bytes).toHaveBeenCalledTimes(2); // the two hands of the first yoyo, then never again
    // the other items still come
    expect((await load(holding(21), report)).map((h) => h.slot)).toEqual(['right']);
  });
});

describe('loadMoverModel', () => {
  /** Services whose one glb is a scene holding `lod0`, with `extras` on the scene as GLTFLoader leaves them. */
  function plainServices(extras: Record<string, unknown>): Parameters<typeof loadMoverModel>[0] {
    const scene = new Group();
    const lod = new Group();
    lod.name = 'lod0';
    scene.add(lod);
    Object.assign(scene.userData, extras);
    return {
      store: { bytes: async (): Promise<Uint8Array> => new Uint8Array(4) },
      loaders: { gltf: { parseAsync: async () => ({ scene }) } },
      textures: { acquire: vi.fn(), release: vi.fn() },
    } as unknown as Parameters<typeof loadMoverModel>[0];
  }
  const plain: MoverLook = { ...look, skeleton: null, parts: ['models/mvr_bang.glb'] };

  it('a model with no skeleton has its own box and no grips', async () => {
    const services = plainServices({ bbMin: [-1.975, -0.002, -1.083], bbMax: [2.268, 3.329, 0.622] });

    const model = await loadMoverModel(services)(plain, vi.fn());

    expect(model.box()).toEqual({ min: [-1.975, -0.002, -1.083], max: [2.268, 3.329, 0.622] });
    expect(model.grips).toBeNull();
  });

  it('a model of an older conversion, with no box, has the empty one', async () => {
    const model = await loadMoverModel(plainServices({}))(plain, vi.fn());

    expect(model.box()).toEqual({ min: [0, 0, 0], max: [0, 0, 0] });
  });

  it('says each part it cannot load to the report it is given, and rejects when none loads', async () => {
    const services = {
      store: { bytes: async (key: string): Promise<Uint8Array> => { throw new Error(`${key} is not in the asset index`); } },
      loaders: { gltf: {} },
      textures: {},
    } as unknown as Parameters<typeof loadMoverModel>[0];
    const report = vi.fn();
    const twoParts: MoverLook = { ...look, parts: ['models/part_a.glb', 'models/part_b.glb'] };
    await expect(loadMoverModel(services)(twoParts, report)).rejects.toThrow(/none of its parts could be loaded/);
    expect(report.mock.calls.map(([message]) => message as string).sort()).toEqual([
      'part models/part_a.glb: models/part_a.glb is not in the asset index',
      'part models/part_b.glb: models/part_b.glb is not in the asset index',
    ]);
  });
});

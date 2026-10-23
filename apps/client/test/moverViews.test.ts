import { AnimationClip, AnimationMixer, BoxGeometry, Group, Mesh, NumberKeyframeTrack, Object3D, Scene } from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { toWebPosition } from '@flyffweb/formats';
import { loopMotion } from '@flyffweb/scene';
import type { AssembledCharacter, LoopedMotion } from '@flyffweb/scene';
import { MoverViews } from '../src/world/render/MoverViews';
import type { MoverLook } from '../src/world/render/looks';
import { ActMsg, Mti } from '../src/world/sim/constants';
import type { Mover, WorldChanges } from '../src/world/WorldState';
import { addedNpc, addedPlayer, moverFrom } from './helpers/movers';

/** A model as the loader gives it: a 2 m box standing on its origin, a joint the motions drive, and a release to count. */
function fakeModel(): AssembledCharacter & { release: Mock<() => void> } {
  const root = new Group();
  const box = new Mesh(new BoxGeometry(1, 2, 1).translate(0, 1, 0));
  const joint = new Object3D();
  joint.name = 'joint';
  root.add(box, joint);
  return { root, mixer: new AnimationMixer(root), release: vi.fn<() => void>() };
}

/** A motion of 31 frames at 30 fps, as the converter writes one (frame i at i / 30 s): its last frame is at 1 s. */
function motion(name: string): LoopedMotion {
  const times = Array.from({ length: 31 }, (_, i) => i / 30);
  return loopMotion(new AnimationClip(name, -1, [new NumberKeyframeTrack('joint.position[x]', times, times)]));
}

/** Every motion of the look is `m<id>`. */
const look: MoverLook = { skeleton: 'skeleton', parts: ['part'], motion: (id) => `m${id}`, hairColor: null };

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

function rig(
  loadModel: (look: MoverLook) => Promise<AssembledCharacter | Object3D> = async () => fakeModel(),
  lookFor: (mover: Mover) => MoverLook | null = () => look,
): Rig {
  const scene = new Scene();
  const load = vi.fn(loadModel);
  const overlay = { error: vi.fn(), addGpuBytes: vi.fn() };
  const motions = new Map<string, LoopedMotion>();
  const loadMotion = async (key: string) => {
    const loaded = motion(key);
    motions.set(key, loaded);
    return loaded;
  };
  const views = new MoverViews(scene, load, overlay, lookFor, loadMotion);
  const movers = new Map<number, Mover>();
  const sync = (changes: WorldChanges) => views.sync(changes, movers);
  return {
    scene, views, load, overlay, movers, motions,
    add(mover) {
      movers.set(mover.objectId, mover);
      sync({ added: [mover], removed: [] });
    },
    remove(objectId) {
      movers.delete(objectId);
      sync({ added: [], removed: [objectId] });
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

    expect(r.load).toHaveBeenCalledWith(look);
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
});

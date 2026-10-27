import { describe, expect, it } from 'vitest';
import type { MotionEvents } from '@flyffweb/formats';
import { ServerClock } from '../src/net/serverClock';
import type { MoverLook } from '../src/world/render/looks';
import { terrainGround } from '../src/world/sim/collision';
import { ActMsg, Mti, ObjSta } from '../src/world/sim/constants';
import { WorldState } from '../src/world/WorldState';
import type { CombatEvent } from '../src/world/WorldState';
import type { DiskAssets, GlbJson } from './helpers/diskAssets';
import { headlessModel, headlessMotion, headlessViews } from './helpers/headlessViews';
import { addedNpc, gameDataOf, webMoverOf } from './helpers/movers';

/** `Mvr_AiBatt_atk1` as converted: 52 frames, its blow at frame 21 ([combat §2.5]), half a frame a step. */
const ATK1: MotionEvents = { hit: [21], sound: [], quake: [], frames: 52, perSlerp: 0.5 };
const STAND: MotionEvents = { hit: [], sound: [], quake: [], frames: 40, perSlerp: 0.5 };
const MODEL = 'models/mvr_aibatt.glb';
const SKELETON = 'skeletons/mvr_aibatt.glb';
const ATK1_FILE = 'motions/mvr_aibatt/mvr_aibatt_atk1.glb';
const STAND_FILE = 'motions/mvr_aibatt/mvr_aibatt_stand.glb';

/** The glbs' JSON chunks by key, as `DiskAssets` reads them. */
function store(glbs: Record<string, GlbJson>): DiskAssets {
  return {
    has: (key: string) => Object.hasOwn(glbs, key),
    glb: (key: string) => glbs[key]!,
    sceneExtras: (key: string) => glbs[key]!.scenes?.[0]?.extras ?? {},
  } as unknown as DiskAssets;
}

const FILES: Record<string, GlbJson> = {
  [MODEL]: { scenes: [{ extras: { bbMin: [-0.5, 0.5, -0.2], bbMax: [0.5, 1.2, 0.7] } }] },
  [SKELETON]: { scenes: [{}] },
  [ATK1_FILE]: { animations: [{ name: 'mvr_aibatt_atk1', extras: { events: ATK1 } }] },
  [STAND_FILE]: { animations: [{ name: 'mvr_aibatt_stand', extras: { events: STAND } }] },
};
/** `MI_AIBATT1` with its model, skeleton and two motions. */
const DATA = gameDataOf({
  movers: new Map([[20, webMoverOf({
    index: 20, name: 'Small Aibatt', killable: 1, model: MODEL, skeleton: SKELETON,
    motions: { [Mti.STAND]: STAND_FILE, [Mti.ATK1]: ATK1_FILE },
  })]]),
});
const LOOK: MoverLook = {
  skeleton: SKELETON, parts: [MODEL], motion: () => null, hairColor: null, held: { right: null, left: null },
};

describe('the headless views (MoverViews on the converted files, for the rules)', () => {
  it("loads a model as its box alone, and rejects where loadMoverModel would", async () => {
    const model = await headlessModel(store(FILES), DATA)(LOOK);
    expect(model.box()).toEqual({ min: [-0.5, 0.5, -0.2], max: [0.5, 1.2, 0.7] });
    expect(model.box()).not.toBe(model.box());
    expect(model.grips).toBeNull();
    await expect(headlessModel(store({}), DATA)(LOOK)).rejects.toThrow('none of its parts could be loaded');
  });

  it("loads a motion as its glb's events, looped as the client loops it", async () => {
    const motion = await headlessMotion(store(FILES))(ATK1_FILE);
    expect(motion.events).toEqual(ATK1);
    expect(motion.clip.name).toBe('mvr_aibatt_atk1');
    await expect(headlessMotion(store({ [ATK1_FILE]: { animations: [] } }))(ATK1_FILE)).rejects.toThrow('the file has no animation');
  });

  it("gives a swing its motion's frames: the blow at its hit frame, the end after its last", async () => {
    const world = new WorldState(DATA, new ServerClock(() => 0), terrainGround(() => 0));
    world.apply(1, { type: 'addMover', mover: addedNpc(1, 20, {}, { pos: [0, 0, 0] }) }, true);
    world.apply(2, { type: 'addMover', mover: addedNpc(2, 20, {}, { pos: [1, 0, 0] }) }, true);
    const problems: string[] = [];
    const views = headlessViews(store(FILES), DATA, [], (message) => problems.push(message));
    views.sync(world.takeChanges(), world.movers);
    await views.settled();
    const [a, b] = [world.movers.get(1)!, world.movers.get(2)!];
    expect(views.pickCandidate(2)?.box).toEqual({ min: [-0.5, 0.5, -0.2], max: [0.5, 1.2, 0.7] });

    expect(a.act.sendActMsg(ActMsg.ATK1, b.objectId, 0, 0)).toBeTruthy();
    // a step of the world screen: the world's step, then the views' (`WorldScreen.step`)
    const steps: { blow: boolean; swinging: boolean }[] = [];
    for (let i = 0; i < 120; i++) {
      world.step();
      const events: CombatEvent[] = world.takeChanges().combat;
      steps.push({
        blow: events.some((e) => e.kind === 'spark' && e.moverId === b.objectId), swinging: (a.act.state & ObjSta.ATK_ALL) !== 0,
      });
      views.step(world.movers);
      // the first step asked for the swing's motion: its file comes in before the next, as the live test's steps wait
      if (i === 0) await views.settled();
    }
    // the first step's frame move waited for the file (`ModelFrame.backlog`) and was made with the next; at half a frame
    // a step, frame 21 is passed by the 42nd move, which the 43rd step's rules read; the last frame (51) by the 103rd,
    // which ends the swing at the 104th step
    expect(steps.findIndex((s) => s.blow) + 1).toBe(43);
    expect(steps.filter((s) => s.blow)).toHaveLength(1);
    expect(steps.findIndex((s) => !s.swinging) + 1).toBe(104);
    expect(problems).toEqual([]);
  });
});

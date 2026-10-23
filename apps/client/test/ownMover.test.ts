import { PerspectiveCamera } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { toWebPosition } from '@flyffweb/formats';
import type { MoveReport, Vec3 } from '@flyffweb/protocol';
import { NO_INTENT } from '@flyffweb/scene';
import type { MoveIntent } from '@flyffweb/scene';
import { OwnMover, pickOnStage } from '../src/world/ownMover';
import { HAttr, terrainGround } from '../src/world/sim/collision';
import type { CollisionObject, Ground } from '../src/world/sim/collision';
import { MAX_CORR_SIZE_45, ObjSta, ObjStaF } from '../src/world/sim/constants';
import { stepMover } from '../src/world/sim/moverRules';
import { addedPlayer, moverFrom } from './helpers/movers';

type Sent =
  | { type: 'moved' | 'behavior' | 'corr'; m: MoveReport }
  | { type: 'destPos'; pos: Vec3; forward: boolean };

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

/** The plane x = `x` from height 0 to 10 and z 90 to 110, facing -x. */
function wallAt(x: number): CollisionObject {
  const a: Vec3 = [x, 0, 110];
  const b: Vec3 = [x, 10, 110];
  const c: Vec3 = [x, 0, 90];
  const d: Vec3 = [x, 10, 90];
  return { triangles: new Float32Array([a, b, c, b, d, c].flat()), matrix: IDENTITY };
}

const intent = (forward: number, turn: number, run: boolean): MoveIntent => ({ forward, turn, run });

/**
 * The own character standing at (100, 0, 100) facing +x (angle 90), running 0.1 a step, in walk mode or not as the
 * server gave it; the world screen's driving of it, with what it sends; and a step as the screen takes one.
 */
function rig(walking: boolean, ground: Ground = terrainGround(() => 0)) {
  const own = moverFrom(addedPlayer(1, { self: true }, {
    pos: [100, 0, 100], angle: 90, state: ObjSta.STAND, stateFlag: walking ? ObjStaF.WALK : 0,
  }));
  own.act.body.speed = Math.fround(0.1);
  const sent: Sent[] = [];
  const session = {
    sendMoved: (m: MoveReport) => sent.push({ type: 'moved', m }),
    sendBehavior: (m: MoveReport) => sent.push({ type: 'behavior', m }),
    sendDestPos: (pos: Vec3, forward: boolean) => sent.push({ type: 'destPos', pos, forward }),
    sendCorr: (m: MoveReport) => sent.push({ type: 'corr', m }),
  };
  let now = 1000n;
  const clock = { tick: () => (now += 10n) };
  const shown: Vec3[] = [];
  const driving = new OwnMover(session, clock, { show: (pos) => shown.push(pos) });
  const step = (input: MoveIntent = NO_INTENT, tap: Vec3 | null = null): void => {
    driving.control(own, input, tap);
    stepMover(own, () => undefined, ground);
    driving.corrected(own);
  };
  const steps = (n: number, input: MoveIntent = NO_INTENT): void => {
    for (let i = 0; i < n; i++) step(input);
  };
  const types = (): string[] => sent.map((s) => s.type);
  return { own, sent, types, shown, driving, step, steps, clock: () => now };
}

describe('OwnMover', () => {
  it('the first idle steps send nothing, in whatever mode the server gave the player (Ruling 40)', () => {
    for (const walking of [false, true]) {
      const { own, steps, types } = rig(walking);
      steps(5);
      expect(types()).toEqual([]);
      expect((own.act.stateFlag & ObjStaF.WALK) !== 0).toBe(walking);
    }
  });

  it('a tap sends DESTPOS, forward, shows the mark and walks there with m_nCorr -1, sending nothing else', () => {
    const { own, sent, shown, step, steps } = rig(true);
    step(NO_INTENT, [102, 0, 100]);
    expect(sent).toEqual([{ type: 'destPos', pos: [102, 0, 100], forward: true }]);
    expect(shown).toEqual([[102, 0, 100]]);
    expect(own.nCorr).toBe(-1);
    expect(own.dest?.pos).toEqual([102, 0, 100]);
    steps(200);
    expect(own.dest).toBeNull();
    expect(own.act.state & ObjSta.MOVE_ALL).toBe(ObjSta.STAND);
    expect(own.act.body.pos[0]).toBeGreaterThanOrEqual(102);
    expect(own.act.body.pos[0]).toBeLessThan(102.1);
    expect(sent).toHaveLength(1);
  });

  it('a tap-walk after a run keeps running', () => {
    const { own, types, step, steps } = rig(true);
    // run forward a little, then let go of everything
    steps(5, intent(1, 0, true));
    step();
    expect(types()).toEqual(['moved', 'behavior', 'moved']);
    expect(own.act.stateFlag & ObjStaF.WALK).toBe(0);
    const from = own.act.body.pos[0];
    step(NO_INTENT, [from + 5, 0, 100]);
    steps(10);
    // 11 steps at the run's 0.1, not the walk's 0.025; no change of mode went out
    expect(own.act.body.pos[0] - from).toBeCloseTo(1.1, 4);
    expect(types()).toEqual(['moved', 'behavior', 'moved', 'destPos']);
    expect(own.dest?.pos).toEqual([from + 5, 0, 100]);
  });

  it('releasing the run key, or pressing it, with no key held does not cancel a tap-walk', () => {
    const { own, types, step, steps } = rig(false);
    step(intent(0, 0, true), [105, 0, 100]);
    steps(3, intent(0, 0, true));
    steps(3, intent(0, 0, false));
    steps(3, intent(0, 0, true));
    expect(types()).toEqual(['destPos']);
    expect(own.dest?.pos).toEqual([105, 0, 100]);
    expect(own.act.state & ObjSta.MOVE_ALL).toBe(ObjSta.FMOVE);
  });

  it('each PLAYERMOVED sets m_nCorr to 22, which the next step counts down', () => {
    const { own, types, step } = rig(true);
    step(intent(1, 0, false));
    expect(types()).toEqual(['moved']);
    expect(own.nCorr).toBe(MAX_CORR_SIZE_45 - 1);
  });

  it('a tap-walk into a wall sends one PLAYERCORR, standing, with the clock\'s tick, and no PLAYERMOVED', () => {
    const { own, sent, types, steps, step, clock } = rig(false, { ...terrainGround(() => 0), objectsNear: () => [wallAt(103)] });
    step(NO_INTENT, [110, 0, 100]);
    steps(100);
    expect(types()).toEqual(['destPos', 'corr']);
    const corr = sent[1] as { type: 'corr'; m: MoveReport };
    expect(corr.m.state).toBe(ObjSta.STAND);
    expect(corr.m.pos).toEqual(own.act.body.pos);
    expect(corr.m.tick).toBeGreaterThan(1000n);
    expect(corr.m.tick).toBeLessThanOrEqual(clock());
    expect(own.corrReport).toBeNull();
    expect(own.act.body.pos[0]).toBeLessThan(103);
  });

  it('stop ends a tap-walk and stands the player, in the mode it has; the next idle step sends nothing', () => {
    const { own, sent, types, driving, steps, step } = rig(false);
    step(NO_INTENT, [110, 0, 100]);
    steps(5);
    driving.stop(own);
    expect(own.dest).toBeNull();
    expect(types()).toEqual(['destPos', 'moved']);
    expect((sent[1] as { m: MoveReport }).m.state & ObjSta.MOVE_ALL).toBe(ObjSta.STAND);
    expect(own.act.stateFlag & ObjStaF.WALK).toBe(0);
    steps(3);
    expect(types()).toEqual(['destPos', 'moved']);
  });
});

describe('pickOnStage', () => {
  it("picks with the stage's camera, ground and MPU, the own mover left out of the movers", () => {
    const camera = new PerspectiveCamera(45, 2, 0.5, 1000);
    camera.position.set(...toWebPosition([100, 15, 100]));
    camera.lookAt(...toWebPosition([100, 5, 100.001]));
    camera.updateMatrixWorld();
    const ground: Ground = { terrainHeight: () => 5, landAttr: () => HAttr.NONE, objectsNear: () => [] };
    const nearestHit = vi.fn(() => null);
    const own = moverFrom(addedPlayer(7, { self: true }));
    const point = pickOnStage({ camera, ground: () => ground, manifest: { mpu: 4 } }, { nearestHit }, own, 0, 0);
    expect(point![0]).toBeCloseTo(100, 3);
    expect(point![1]).toBeCloseTo(5, 4);
    expect(nearestHit).toHaveBeenCalledWith(expect.anything(), 7);
  });
});

import { PerspectiveCamera } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { toWebPosition } from '@flyffweb/formats';
import type { MoveReport, Vec3 } from '@flyffweb/protocol';
import { NO_INTENT } from '@flyffweb/scene';
import type { MoveIntent } from '@flyffweb/scene';
import { OwnMover, pickOnStage } from '../src/world/ownMover';
import type { ControlIntent } from '../src/world/controls';
import { moverMatrix } from '../src/world/render/picking';
import type { PickCandidate } from '../src/world/render/picking';
import { HAttr, terrainGround } from '../src/world/sim/collision';
import type { CollisionObject, Ground } from '../src/world/sim/collision';
import { ActMsg, MAX_CORR_SIZE_45, ObjSta, ObjStaF } from '../src/world/sim/constants';
import { stepMover } from '../src/world/sim/moverRules';
import { wrapAngle } from '../src/world/sim/ActionMover';
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
  const step = (input: ControlIntent = NO_INTENT, tap: Vec3 | null = null): void => {
    driving.control(own, input, tap);
    stepMover(own, () => undefined, ground);
    driving.corrected(own);
  };
  const steps = (n: number, input: ControlIntent = NO_INTENT): void => {
    for (let i = 0; i < n; i++) step(input);
  };
  const types = (): string[] => sent.map((s) => s.type);
  return { own, sent, types, shown, driving, step, steps, clock: () => now };
}

describe('OwnMover', () => {
  it.each(['steady', 'noisy'])('coalesces %s ground steering against a wall without delaying local steering or flooding corrections', (mode) => {
    const r = rig(false, { ...terrainGround(() => 0), objectsNear: () => [wallAt(103)] });
    const timestamps: number[] = [];
    for (let frame = 0; frame < 360; frame++) {
      const before = r.sent.length;
      const angle = mode === 'steady' ? 91 : frame % 2 ? 89 : 91;
      r.step({ forward: 1, turn: 0, run: true, angle });
      expect(r.own.act.body.angle).toBe(wrapAngle(angle));
      for (let i = before; i < r.sent.length; i++) timestamps.push(frame);
    }
    const peak = Math.max(...timestamps.map((frame) => timestamps.filter((at) => at > frame - 60 && at <= frame).length));
    expect(peak).toBeLessThanOrEqual(22); // 10 movement + 10 correction reports, with boundary headroom
    expect(r.sent.filter((p) => p.type === 'corr').length).toBeGreaterThan(0);
    expect(r.own.act.body.pos[0]).toBeLessThan(103);
    // Turning away takes effect immediately even while the next network report is coalesced.
    const blockedX = r.own.act.body.pos[0];
    r.steps(12, { forward: 1, turn: 0, run: true, angle: 270 });
    expect(r.own.act.body.pos[0]).toBeLessThan(blockedX - .5);
    const beforeStop = r.sent.length;
    r.step(NO_INTENT);
    expect(r.sent.length).toBe(beforeStop + 1);
    expect(r.own.act.state & ObjSta.MOVE_ALL).toBe(ObjSta.STAND);
    r.steps(12);
    expect(r.sent.length).toBe(beforeStop + 1);
  });

  it('flushes the final coalesced angle even after the joystick stops changing direction', () => {
    const r = rig(false);
    r.step({ forward: 1, turn: 0, run: true, angle: 90 });
    r.step({ forward: 1, turn: 0, run: true, angle: 135 });
    expect(r.sent.length).toBe(1);
    r.steps(6, { forward: 1, turn: 0, run: true, angle: 135 });
    expect(r.sent.length).toBe(2);
    const last = r.sent.at(-1)!;
    expect('m' in last && last.m.angle).toBe(135);
    r.steps(20, { forward: 1, turn: 0, run: true, angle: 135 });
    expect(r.sent.length).toBe(2);
  });

  it('drops a queued ground turn when jumping or explicitly stopping', () => {
    const r = rig(false);
    r.step({ forward: 1, turn: 0, run: true, angle: 90 });
    r.step({ forward: 1, turn: 0, run: true, angle: 91 });
    r.driving.control(r.own, { forward: 1, turn: 0, run: true, angle: 91 }, null, false, true);
    const moved = r.sent.filter((p) => p.type === 'moved').length;
    r.steps(12, { forward: 1, turn: 0, run: true, angle: 91 });
    expect(r.sent.filter((p) => p.type === 'moved').length).toBe(moved);
    r.driving.stop(r.own);
    const stopped = r.sent.length;
    r.steps(12);
    expect(r.sent.length).toBe(stopped);
  });

  it('reports a quick joystick stop and restart immediately despite the steering cooldown', () => {
    const r = rig(false);
    r.step({ forward: 1, turn: 0, run: true, angle: 90 });
    r.step({ forward: 1, turn: 0, run: true, angle: 135 });
    r.driving.stop(r.own);
    expect(r.types()).toEqual(['moved', 'moved']);
    expect((r.sent[1] as { m: MoveReport }).m.state & ObjSta.MOVE_ALL).toBe(ObjSta.STAND);
    r.step({ forward: 1, turn: 0, run: true, angle: 180 });
    expect(r.types()).toEqual(['moved', 'moved', 'moved']);
    expect((r.sent[2] as { m: MoveReport }).m.angle).toBe(180);
  });

  it('a new tap destination discards queued joystick steering instead of sending it over DESTPOS', () => {
    const r = rig(false);
    r.step({ forward: 1, turn: 0, run: true, angle: 90 });
    r.step({ forward: 1, turn: 0, run: true, angle: 135 });
    r.step(NO_INTENT, [110, 0, 100]);
    const before = r.sent.length;
    r.steps(12);
    expect(r.sent.length).toBe(before);
    expect(r.sent.at(-1)?.type).toBe('destPos');
    expect(r.own.dest?.pos).toEqual([110, 0, 100]);
  });

  it('keeps run mode after combat changes the gait outside the controls', () => {
    const r = rig(true);
    r.step({ forward: 1, turn: 0 });
    r.own.act.sendActMsg(ActMsg.MODE_RUN);
    r.step(NO_INTENT);
    expect(r.own.act.stateFlag & ObjStaF.WALK).toBe(0);
  });
  it.each([-1, 1])('turns a desktop jump with A/D (%s) and reports only turn transitions', (turn) => {
    const r = rig(false);
    const forward = { forward: 1, turn: 0, run: true };
    r.driving.control(r.own, forward, null, false, true);
    r.own.act.step(terrainGround(() => 0));
    const before = [...r.own.act.body.pos];
    const reports = r.sent.filter((p) => p.type === 'behavior').length;
    r.steps(5, { ...forward, turn });
    expect(r.own.act.body.angle).toBeCloseTo(90 - turn * 20, 1);
    expect(r.own.act.body.pos[1]).toBeGreaterThan(before[1]!);
    expect(Math.abs(r.own.act.body.pos[2] - before[2]!)).toBeGreaterThan(.02);
    expect(r.sent.filter((p) => p.type === 'behavior').length).toBe(reports + 1);
    r.step(forward);
    const releasedAngle = r.own.act.body.angle;
    r.steps(5, forward);
    expect(r.own.act.body.angle).toBe(releasedAngle);
  });
  it('steers a moving jump without restarting the jump or flooding repeated direction reports', () => {
    const r = rig(false);
    const east = { forward: 1, turn: 0, run: true, angle: 90 };
    const north = { forward: 1, turn: 0, run: true, angle: 0 };
    r.driving.control(r.own, east, null, false, true);
    r.own.act.step(terrainGround(() => 0));
    r.steps(5, east);
    const before = [...r.own.act.body.pos];
    const vertical = r.own.act.delta[1];
    const jumping = r.own.act.state & ObjSta.JUMP_ALL;
    const reports = r.sent.filter((packet) => packet.type === 'behavior').length;
    r.driving.control(r.own, north, null);
    expect(r.own.act.body.angle).toBe(0);
    expect(r.own.act.delta[1]).toBe(vertical);
    expect(r.own.act.state & ObjSta.JUMP_ALL).toBe(jumping);
    const sent = r.sent.at(-1)!;
    expect(sent.type).toBe('behavior');
    if (sent.type === 'behavior') {
      expect(sent.m.pos).toEqual(before); // current position, not a ground-move prediction
      expect(sent.m.delta[1]).toBe(vertical);
    }
    r.steps(5, north);
    expect(r.own.act.body.pos[2]).toBeLessThan(before[2]! - .4);
    expect(r.own.act.body.pos[0]).toBeCloseTo(before[0]!, 3);
    expect(r.sent.filter((packet) => packet.type === 'behavior').length).toBe(reports + 1);
  });

  it('can start moving from a standing jump and release the stick to stop horizontal travel before landing', () => {
    const r = rig(false);
    r.driving.control(r.own, NO_INTENT, null, false, true);
    r.own.act.step(terrainGround(() => 0));
    r.steps(5, { forward: 1, turn: 0, run: true, angle: 90 });
    expect(r.own.act.body.pos[0]).toBeGreaterThan(100.4);
    r.step(NO_INTENT);
    const landingX = r.own.act.body.pos[0];
    expect(r.own.act.body.pos[1]).toBeGreaterThan(0);
    r.steps(120);
    expect(r.own.act.body.pos[0]).toBe(landingX);
    expect(r.own.act.body.pos[1]).toBe(0);
    expect(r.own.act.state & ObjSta.JUMP_ALL).toBe(0);
  });
  it('can redirect the landing spot while descending', () => {
    const r = rig(false);
    const east = { forward: 1, turn: 0, run: true, angle: 90 };
    r.driving.control(r.own, east, null, false, true);
    r.own.act.step(terrainGround(() => 0));
    r.steps(45, east);
    expect(r.own.act.state & ObjSta.JUMP_ALL).toBe(ObjSta.SJUMP3);
    const before = [...r.own.act.body.pos];
    r.steps(5, { ...east, angle: 270 });
    expect(r.own.act.body.pos[0]).toBeLessThan(before[0]! - .4);
    expect(r.own.act.body.pos[1]).toBeLessThan(before[1]!);
    expect(r.own.act.body.pos[1]).toBeGreaterThan(0);
  });

  it('stops joystick air travel on focus loss without cancelling the jump', () => {
    const r = rig(false);
    const east = { forward: 1, turn: 0, run: true, angle: 90 };
    r.driving.control(r.own, east, null, false, true);
    r.own.act.step(terrainGround(() => 0));
    r.steps(5, east);
    const x = r.own.act.body.pos[0];
    const vertical = r.own.act.delta[1];
    r.driving.stop(r.own);
    expect(r.own.act.delta[1]).toBe(vertical);
    expect(r.own.act.state & ObjSta.JUMP_ALL).toBe(ObjSta.SJUMP2);
    r.steps(5);
    expect(r.own.act.body.pos[0]).toBe(x);
    expect(r.own.act.body.pos[1]).toBeGreaterThan(0);
  });

  it('sends one native behavior report for a jump and keeps the existing correction path', () => {
    const r = rig(false);
    r.driving.control(r.own, NO_INTENT, null, false, true);
    expect(r.types()).toEqual(['behavior']);
    const report = r.sent[0]!;
    expect('m' in report && (report.m.state & 0xf000)).toBe(0x5000);
    r.driving.control(r.own, NO_INTENT, null, false, true);
    expect(r.types()).toEqual(['behavior']);
  });
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
  const camera = new PerspectiveCamera(45, 2, 0.5, 1000);
  camera.position.set(...toWebPosition([100, 15, 100]));
  camera.lookAt(...toWebPosition([100, 5, 100.001]));
  camera.updateMatrixWorld();
  const ground: Ground = { terrainHeight: () => 5, landAttr: () => HAttr.NONE, objectsNear: () => [] };
  const stage = { camera, ground: () => ground, manifest: { mpu: 4 } };
  const own = moverFrom(addedPlayer(7, { self: true }));
  /** A mover 1.8 m tall under the camera, a little off the middle of the picture. */
  const under: PickCandidate = {
    objectId: 8, box: { min: [-0.5, 0, -0.5], max: [0.5, 1.8, 0.5] }, world: moverMatrix([100.2, 5, 99.9], 0, 1), dead: false,
    isPlayer: false,
  };

  it("picks with the stage's camera, ground and MPU, the own mover left out of the movers", () => {
    const pickCandidates = vi.fn((_except: number | undefined): PickCandidate[] => []);
    const hit = pickOnStage(stage, { pickCandidates }, own, 0, 0) as { point: Vec3 };
    expect(hit.point[0]).toBeCloseTo(100, 3);
    expect(hit.point[1]).toBeCloseTo(5, 4);
    expect(pickCandidates).toHaveBeenCalledWith(7);
  });

  it('gives the mover the tap lands on, else the point of the land: a mover takes the tap, as in Neuz', () => {
    const views = { pickCandidates: () => [under] };
    expect(pickOnStage(stage, views, own, 0, 0)).toEqual({ mover: 8 });
    const beside = pickOnStage(stage, views, own, 0.5, 0) as { point: Vec3 };
    expect(beside.point[1]).toBeCloseTo(5, 3);
    expect(Math.hypot(beside.point[0] - 100, beside.point[2] - 100)).toBeGreaterThan(3);
  });

  it('gives nothing where there is no land and no mover, and works with no own mover yet', () => {
    const pickCandidates = vi.fn((_except: number | undefined): PickCandidate[] => []);
    const bare = { ...stage, ground: () => ({ ...ground, terrainHeight: () => null }) };
    expect(pickOnStage(bare, { pickCandidates }, undefined, 0, 0)).toBeNull();
    expect(pickCandidates).toHaveBeenCalledWith(undefined);
  });
});

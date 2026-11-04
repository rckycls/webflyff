// The PC's flight controls (Piece 7 M5, [R §2]): CWndWorld::ControlFlying (WndWorldControlPlayer.cpp:666-947) and
// CDPClient::FlushPlayerAngle (DPClient.cpp:14495-14517), against a fake session.

import { describe, expect, it } from 'vitest';
import type { AngleReport, FlightReport } from '@flyffweb/protocol';
import { FlightControl, NO_FLIGHT_INPUT } from '../src/world/flightControl';
import type { FlightInput } from '../src/world/flightControl';
import { ActionMover } from '../src/world/sim/ActionMover';
import { terrainGround } from '../src/world/sim/collision';
import { ObjSta, ObjStaF } from '../src/world/sim/constants';
import { TRAFFIC_BUDGET, busiestSecond } from './helpers/traffic';

const f32 = Math.fround;
const BROOM = { speed: f32(0.0023), turn: f32(0.6), pitch: 1, motion: 31 };
const GROUND = terrainGround(() => 0);

function rig(height = 50) {
  const act = new ActionMover({ pos: [100, height, 100], angle: 0, speed: 0.1, isPlayer: true });
  act.modeFly(5000, BROOM, 1200);
  const own = { act, nCorr: 0 };
  let step = 0;
  const sent: Array<{ type: string; step: number; frames?: number; r: FlightReport | AngleReport }> = [];
  const session = {
    sendMoved2: (r: FlightReport, frames: number) => void sent.push({ type: 'moved2', step, frames, r }),
    sendBehavior2: (r: FlightReport) => void sent.push({ type: 'behavior2', step, r }),
    sendCorr2: (r: FlightReport) => void sent.push({ type: 'corr2', step, r }),
    sendAngle: (r: AngleReport) => void sent.push({ type: 'angle', step, r }),
  };
  const control = new FlightControl(session, { tick: () => BigInt(step) });
  /** One rules step: the controls, the angle's flush, then the flier's step. */
  const tick = (input: Partial<FlightInput> = {}): void => {
    step++;
    control.control(own, { ...NO_FLIGHT_INPUT, ...input }, GROUND);
    control.flushAngle(own);
    act.step(GROUND);
  };
  tick(); // the first step stands the new flier (one PLAYERMOVED2)
  sent.length = 0;
  return { act, own, control, sent, tick };
}

describe('FlightControl', () => {
  it('Space toggles ACC and sends one PLAYERMOVED2 each time', () => {
    const r = rig();
    r.tick({ accelerateToggle: true });
    expect(r.act.stateFlag & ObjStaF.ACC).toBe(ObjStaF.ACC);
    expect(r.sent.map((p) => p.type)).toEqual(['moved2']);
    expect(r.sent[0]!.frames).toBe(37);
    expect(r.own.nCorr).toBe(37);
    for (let i = 0; i < 60; i++) r.tick();
    expect(r.sent).toHaveLength(1);
    r.tick({ accelerateToggle: true });
    r.tick();
    expect(r.act.stateFlag & ObjStaF.ACC).toBe(0);
    expect(r.sent.map((p) => p.type)).toEqual(['moved2', 'moved2']);
    expect(r.act.state & ObjSta.MOVE_ALL).toBe(ObjSta.STAND);
  });

  it('holding D sends one RTURN, not one a step', () => {
    const r = rig();
    for (let i = 0; i < 60; i++) r.tick({ right: true });
    expect(r.sent).toHaveLength(1);
    expect(r.act.state & ObjSta.TURN_ALL).toBe(ObjSta.RTURN);
    expect(r.act.turnAngle).toBe(f32(0.6)); // (int)( fFlightLRAngle * 100 ) / 100
    expect(r.control.roll).toBe(45);
    for (let i = 0; i < 30; i++) r.tick();
    expect(r.sent).toHaveLength(2); // STOP_TURN
    expect(r.control.roll).toBe(0);
  });

  it('W does nothing on the ground, dives above it', () => {
    const low = rig(0);
    low.tick({ dive: true });
    expect(low.act.state & ObjSta.LOOK_ALL).toBe(0);
    expect(low.sent).toHaveLength(0);
    const high = rig(50);
    high.tick({ dive: true });
    expect(high.act.state & ObjSta.LOOK_ALL).toBe(ObjSta.LOOKDOWN);
    expect(high.sent).toHaveLength(1);
    high.tick({ climb: true });
    expect(high.act.state & ObjSta.LOOK_ALL).toBe(ObjSta.LOOKUP);
    expect(high.sent).toHaveLength(2);
  });

  it('mouse steering queues PLAYERANGLE, at most one every 30 steps', () => {
    const r = rig();
    for (let i = 0; i < 120; i++) r.tick({ mouse: { dx: 4, dy: 2 } });
    const angles = r.sent.filter((p) => p.type === 'angle');
    expect(angles).toHaveLength(4);
    expect(r.act.angleX).toBe(45); // dy / 4 a move, held at 45
    expect(r.act.body.angle).not.toBe(0);
  });

  it('W then S at once stays in the budget (Review Focus 1)', () => {
    const r = rig();
    const keys: Array<Partial<FlightInput>> = [{ dive: true }, { climb: true }, { left: true }, { right: true }, { dive: true, left: true }];
    for (let i = 0; i < 600; i++) {
      const held = keys[Math.floor(i / 10) % keys.length]!;
      r.tick({ ...held, accelerateToggle: i % 45 === 0, turboToggle: i % 90 === 0, mouse: { dx: (i % 7) - 3, dy: (i % 5) - 2 } });
    }
    expect(r.sent.length).toBeGreaterThan(20);
    expect(busiestSecond(r.sent.map((p) => p.step))).toBeLessThanOrEqual(TRAFFIC_BUDGET);
  });

  it('a collision within 37 steps sends PLAYERCORR2', () => {
    const r = rig();
    r.own.nCorr = 0; // the rig's first PLAYERMOVED2 has run its 37 steps (the rules count m_nCorr down)
    r.control.collided(r.own);
    expect(r.sent).toHaveLength(0); // no PLAYERMOVED2 yet: m_nCorr is 0
    r.tick({ accelerateToggle: true });
    r.control.collided(r.own);
    expect(r.sent.map((p) => p.type)).toEqual(['moved2', 'corr2']);
    expect(r.own.nCorr).toBe(0);
    r.control.collided(r.own);
    expect(r.sent).toHaveLength(2);
  });

  it('entering flying sends PLAYERBEHAVIOR2 once', () => {
    const r = rig();
    r.control.entered(r.own);
    expect(r.sent.map((p) => p.type)).toEqual(['behavior2']);
    expect((r.sent[0]!.r as FlightReport).stateFlag & ObjStaF.FLY).toBe(ObjStaF.FLY);
  });
});

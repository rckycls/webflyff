import { describe, expect, it } from 'vitest';
import { FixedStepper, MAX_STEPS_PER_FRAME, STEPS_PER_SECOND } from '../../src/world/sim/stepper';

const STEP = 1 / STEPS_PER_SECOND;

describe('FixedStepper', () => {
  it('steps 60 times a second, at most 60 in a frame', () => {
    expect(STEPS_PER_SECOND).toBe(60);
    expect(MAX_STEPS_PER_FRAME).toBe(60);
  });

  it('16.7 ms gives one step and carries the rest', () => {
    const stepper = new FixedStepper();
    expect(stepper.advance(0.0167)).toBe(1);
    // 0.0333 ms is left over: 16.6665 ms alone is short of a step, with the carry it is not
    expect(stepper.advance(0.0166665)).toBe(1);
    // and what is left now is a sliver, far from a step
    expect(stepper.advance(0.000001)).toBe(0);
  });

  it('gives no step for a frame shorter than a step, and the frames add up', () => {
    const stepper = new FixedStepper();
    expect(stepper.advance(0.01)).toBe(0);
    expect(stepper.advance(0.01)).toBe(1);
  });

  it('gives 60 steps for 60 frames of a sixtieth of a second', () => {
    const stepper = new FixedStepper();
    let total = 0;
    for (let i = 0; i < 60; i++) total += stepper.advance(STEP);
    expect(total).toBe(60);
  });

  it('gives several steps for a slow frame', () => {
    const stepper = new FixedStepper();
    expect(stepper.advance(0.05)).toBe(3);
  });

  it('a 10-second pause gives at most 60 steps', () => {
    const stepper = new FixedStepper();
    expect(stepper.advance(10)).toBe(MAX_STEPS_PER_FRAME);
  });

  it('drops the backlog of a long pause instead of paying it off later', () => {
    const stepper = new FixedStepper();
    stepper.advance(10);
    expect(stepper.advance(0)).toBe(0);
    expect(stepper.advance(STEP)).toBe(1);
    expect(stepper.advance(STEP)).toBe(1);
  });

  it('gives nothing for a negative or non-finite frame time, and keeps what it carried', () => {
    const stepper = new FixedStepper();
    expect(stepper.advance(0.01)).toBe(0);
    for (const dt of [-1, -0.001, NaN, Infinity, -Infinity]) expect(stepper.advance(dt)).toBe(0);
    // the 10 ms carried is still there: another 10 ms makes the step
    expect(stepper.advance(0.01)).toBe(1);
  });
});

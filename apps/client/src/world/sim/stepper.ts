/** `FRAME_PER_SEC` (`Source/_Common/timer.h:133`): the rules step 60 times a second, whatever the screen draws. */
export const STEPS_PER_SECOND = 60;
/**
 * The most steps one drawn frame runs. The C++ has no such cap (Neuz skips drawing, not steps, when it falls behind);
 * here a browser tab that was hidden for ten seconds would otherwise stall on 600 steps, so a pause longer than a
 * second of steps loses the rest.
 */
export const MAX_STEPS_PER_FRAME = 60;

/**
 * The clock that says how many rules steps a drawn frame owes. Time is kept in steps, so a frame of 1/60 s is one step
 * exactly and the part of a step a frame does not reach carries over to the next.
 */
export class FixedStepper {
  /** The part of a step still owed: 0 up to (not including) 1. */
  private carry = 0;

  /**
   * The whole steps due after `dtSeconds`, at most `MAX_STEPS_PER_FRAME`. Over the cap the rest of the backlog is
   * dropped, so later frames do not keep paying it off. A negative or non-finite time gives 0 and changes nothing.
   */
  advance(dtSeconds: number): number {
    if (!Number.isFinite(dtSeconds) || dtSeconds < 0) return 0;
    const owed = this.carry + dtSeconds * STEPS_PER_SECOND;
    const whole = Math.floor(owed);
    if (whole > MAX_STEPS_PER_FRAME) {
      this.carry = 0;
      return MAX_STEPS_PER_FRAME;
    }
    this.carry = owed - whole;
    return whole;
  }
}

/**
 * custom (owner 2026-11-15): Auto Play's "ready skills": the client's own cooldown timers for the few skills the bot casts
 * by itself (FlyffWeb leaves skill cooldowns to the server, skillUse.ts). A timer starts when the server confirms the
 * skill, from the skill level's `cooldown` (`dwSkillReady`), and a refusal waits 3 s.
 */

/** After a refusal (CLEAR_USESKILL, TID_GAME_SKILLWAITTIME), this long before the skill is tried again (ms). */
export const SKILL_REFUSED_MS = 3000;

export class SkillTimers {
  private readonly until = new Map<number, number>();

  /** `cooldownMs`: a skill slot's cooldown at its level now (ms). */
  constructor(private readonly cooldownMs: (skillIndex: number) => number) {}

  ok(skillIndex: number, now: number): void {
    this.until.set(skillIndex, now + Math.max(0, this.cooldownMs(skillIndex)));
  }

  refused(skillIndex: number, now: number): void {
    this.until.set(skillIndex, Math.max(this.until.get(skillIndex) ?? 0, now + SKILL_REFUSED_MS));
  }

  ready(skillIndex: number, now: number): boolean {
    return now >= (this.until.get(skillIndex) ?? -Infinity);
  }
}

/** The first skill of `list` that is learned, off its timer and paid for (MP, FP), or null. */
export function pickReadySkill(list: readonly number[], timers: SkillTimers, costOk: (skillIndex: number) => boolean,
  known: (skillIndex: number) => boolean, now: number): number | null {
  for (const skillIndex of list) {
    if (known(skillIndex) && timers.ready(skillIndex, now) && costOk(skillIndex)) return skillIndex;
  }
  return null;
}

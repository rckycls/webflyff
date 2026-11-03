import { describe, expect, it } from 'vitest';
import { ArReader, ArWriter, MessageType, NULL_ID, WORLD_READERS } from '../src';
import { readSetJobSkill, readSetNearJobSkill } from '../src/world/jobs';

/** `n` SKILLs, slot `i` holding skill `i + 1` at level `i % 3`, then a marker the test reads back. */
function skills(w: ArWriter, n: number): ArWriter {
  for (let i = 0; i < n; i++) w.u32(i + 1).u32(i % 3);
  return w;
}

describe('the job change (SET_JOB_SKILL, SET_NEAR_JOB_SKILL)', () => {
  it('SET_JOB_SKILL reads the job, 45 skills and drops 32 job levels', () => {
    const w = new ArWriter().i32(1);
    for (let i = 0; i < 45; i++) {
      if (i === 3) w.u32(7).u32(1);
      else w.u32(i < 3 ? i + 1 : NULL_ID).u32(0);
    }
    for (let i = 0; i < 32; i++) w.u32(0);
    w.u32(0xdeadbeef);
    const r = new ArReader(w.toBytes());
    const message = readSetJobSkill(r);
    expect(message.type).toBe('setJobSkill');
    expect(message.job).toBe(1);
    expect(message.skills).toHaveLength(45);
    expect(message.skills[3]).toEqual({ skill: 7, level: 1 });
    expect(message.skills[0]).toEqual({ skill: 1, level: 0 });
    expect(r.u32()).toBe(0xdeadbeef);
  });

  it('SET_NEAR_JOB_SKILL reads 20 skills for an expert and 21 for a master or hero', () => {
    for (const [job, count] of [[1, 20], [6, 20], [15, 20], [16, 21], [24, 21], [31, 21]] as const) {
      const r = new ArReader(skills(new ArWriter().i32(job), count).u32(0xdeadbeef).toBytes());
      const message = readSetNearJobSkill(r);
      expect(message).toMatchObject({ type: 'setNearJobSkill', job });
      expect(message.skills).toHaveLength(count);
      expect(r.u32()).toBe(0xdeadbeef);
    }
  });

  it('both are registered under their MsgHdr.h numbers', () => {
    expect(MessageType.SET_JOB_SKILL).toBe(0x00a7);
    expect(MessageType.SET_NEAR_JOB_SKILL).toBe(0x00a8);
    expect(WORLD_READERS.get(0x00a7)).toBe(readSetJobSkill);
    expect(WORLD_READERS.get(0x00a8)).toBe(readSetNearJobSkill);
  });
});

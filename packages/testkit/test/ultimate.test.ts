// 2026-11-10: writeUltimate's bytes read back by the protocol's reader.
import { describe, expect, it } from 'vitest';
import { ArReader, UltimateResult, UltimateState, readUltimate } from '@flyffweb/protocol';
import { writeUltimate } from '../src';

describe('writeUltimate', () => {
  it('writes the state, the result, and MAKEGEM\'s count', () => {
    const made = writeUltimate(7, UltimateState.MAKEGEM, UltimateResult.SUCCESS, 3);
    expect(made.objectId).toBe(7);
    expect(readUltimate(new ArReader(made.fields))).toEqual({ type: 'ultimate', state: 3, result: 0, count: 3 });
    const set = writeUltimate(7, UltimateState.SETGEM, UltimateResult.FAILED);
    expect(set.fields.length).toBe(5);
    expect(readUltimate(new ArReader(set.fields))).toEqual({ type: 'ultimate', state: 4, result: 1 });
  });
});

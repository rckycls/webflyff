import { describe, expect, it } from 'vitest';
import { NULL_ID } from '@flyffweb/protocol';
import { OwnShots } from '../src/world/combat/ownShots';

function recording() {
  const sent: unknown[][] = [];
  const session = {
    sendSfxId: (...args: unknown[]) => void sent.push(['id', ...args]),
    sendSfxHit: (...args: unknown[]) => void sent.push(['hit', ...args]),
    sendSfxClear: (...args: unknown[]) => void sent.push(['clear', ...args]),
  };
  return { sent, shots: new OwnShots(session) };
}

describe('OwnShots (m_idSfxHit; SendSfxID, SendSfxHit, SendSfxClear; Piece 7 M2)', () => {
  it("MAGIC_ATTACK carries the id before the shot's own: current is 0, register sends SFX_ID with 1", () => {
    const { sent, shots } = recording();
    expect(shots.current).toBe(0);
    expect(shots.register(9001, 0x8)).toBe(1);
    expect(shots.current).toBe(1);
    expect(shots.register(9001, 0x4001)).toBe(2);
    expect(sent).toEqual([['id', 9001, 1, 0x8, NULL_ID, 1], ['id', 9001, 2, 0x4001, NULL_ID, 1]]);
  });

  it('a skill registers with its type and hit count; the hit and the clear go as given', () => {
    const { sent, shots } = recording();
    shots.register(9001, 0x20, NULL_ID, 3);
    shots.hit(1, 4, 65, 9000);
    shots.clear(1, 9000);
    expect(sent).toEqual([['id', 9001, 1, 0x20, NULL_ID, 3], ['hit', 1, 4, 65, 9000, 0, 0, 0], ['clear', 1, 9000]]);
  });
});

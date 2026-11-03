import { describe, expect, it } from 'vitest';
import type { Mover } from '../src/world/WorldState';
import { dialogueStays } from '../src/world/hud/dialogue/dialogueStays';
import { ObjSta } from '../src/world/sim/constants';

const mover = (state: number, dead = false): Mover => ({ act: { state, isDie: () => dead } }) as unknown as Mover;
const standing = mover(ObjSta.STAND);

describe('dialogueStays (CWndDialog::Process, WndDialog.cpp:58-63; CWndWorld::Process, WndWorld.cpp:8052-8081)', () => {
  it('the dialogue closes when its NPC goes or the player moves', () => {
    expect(dialogueStays(standing, standing)).toBe(true);
    expect(dialogueStays(undefined, standing)).toBe(false);
    expect(dialogueStays(mover(ObjSta.STAND, true), standing)).toBe(false);
    expect(dialogueStays(standing, undefined)).toBe(false);
    expect(dialogueStays(standing, mover(ObjSta.STAND, true))).toBe(false);
    expect(dialogueStays(standing, mover(ObjSta.FMOVE))).toBe(false);
    expect(dialogueStays(standing, mover(ObjSta.BMOVE))).toBe(false);
  });
});

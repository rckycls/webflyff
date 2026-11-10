import { describe, expect, it } from 'vitest';
import { CURSORS, cursorProperties, cursorVar, worldCursor } from '../src/world/hud/cursors';

describe('worldCursor (CWndWorld::OnSetCursor, WndWorld.cpp:2562-2660)', () => {
  it('a monster is CUR_ATTACK, an NPC CUR_NPC, another player CUR_BASE', () => {
    expect(worldCursor({ peaceful: false, player: false }, false)).toBe('attack');
    expect(worldCursor({ peaceful: true, player: false }, false)).toBe('npc');
    expect(worldCursor({ peaceful: true, player: true }, false)).toBe('base');
  });

  it('nothing under the mouse is CUR_BASE, or CUR_NO while the world takes no press', () => {
    expect(worldCursor(null, false)).toBe('base');
    expect(worldCursor(null, true)).toBe('no');
  });

  it('CUR_NO only over nothing: a monster still shows CUR_ATTACK with the shop open', () => {
    expect(worldCursor({ peaceful: false, player: false }, true)).toBe('attack');
  });
});

describe('cursorProperties', () => {
  it('gives each found picture its hotspot and the browser fallback; a missing one is left out', () => {
    const found = cursorProperties((key) => (key === 'ui/curnpc.png' ? '/assets/ui/curnpc.abc.png' : ''));
    expect([...found]).toEqual([['--cur-npc', 'url("/assets/ui/curnpc.abc.png") 15 9, pointer']]);
  });

  it('names its properties in kebab case', () => {
    expect(cursorVar('getItem')).toBe('--cur-get-item');
    expect(cursorVar('resizeHv1')).toBe('--cur-resize-hv1');
  });

  it('has the hotspots of the files (Client/Cursor, ICONDIRENTRY)', () => {
    expect(CURSORS.base.hotspot).toEqual([1, 1]);
    expect(CURSORS.attack.hotspot).toEqual([0, 0]);
    expect(CURSORS.npc.hotspot).toEqual([15, 9]);
    expect(CURSORS.getItem.hotspot).toEqual([2, 9]);
    expect(CURSORS.delay.hotspot).toEqual([8, 15]);
    expect(CURSORS.resizeVert.hotspot).toEqual([15, 14]);
    expect(Object.keys(CURSORS)).toHaveLength(16);
  });
});

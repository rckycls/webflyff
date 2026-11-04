// @vitest-environment jsdom
// The cool-down's sweep over an item's slot (2026-11-05, RenderRadar, WndManager.cpp:143-180).

import { describe, expect, it } from 'vitest';
import { drawCooldown } from '../src/world/hud/cooldown';

describe('drawCooldown', () => {
  it('marks a cooling slot with its share done, and clears it after', () => {
    const slot = document.createElement('button');
    drawCooldown(slot, 0.25);
    expect(slot.hasAttribute('data-cooling')).toBe(true);
    expect(slot.style.getPropertyValue('--cool-done')).toBe('25%');
    drawCooldown(slot, null);
    expect(slot.hasAttribute('data-cooling')).toBe(false);
    expect(slot.style.getPropertyValue('--cool-done')).toBe('');
  });
});

import { describe, expect, it } from 'vitest';
import { STATS_FLAG, debugOverlayShown } from '../src/debugOverlay';

describe('debugOverlayShown (2026-11-12: the corner measurements off the live site)', () => {
  it('shows the overlay in the dev server, whatever the address', () => {
    expect(debugOverlayShown({ DEV: true }, '')).toBe(true);
    expect(debugOverlayShown({ DEV: true }, '?x=1')).toBe(true);
  });

  it('shows it in a build made for the tests (VITE_TEST_HOOKS=1)', () => {
    expect(debugOverlayShown({ DEV: false, VITE_TEST_HOOKS: '1' }, '')).toBe(true);
  });

  it('hides it in a build made for the players', () => {
    expect(debugOverlayShown({ DEV: false }, '')).toBe(false);
    expect(debugOverlayShown({ DEV: false, VITE_TEST_HOOKS: '0' }, '?account=x')).toBe(false);
    expect(debugOverlayShown({}, '?statistics')).toBe(false);
  });

  it('shows it there when the address asks with ?stats (the owner), with or without a value', () => {
    expect(STATS_FLAG).toBe('stats');
    expect(debugOverlayShown({ DEV: false }, '?stats')).toBe(true);
    expect(debugOverlayShown({ DEV: false }, '?stats=1')).toBe(true);
    expect(debugOverlayShown({ DEV: false }, '?a=b&stats')).toBe(true);
  });
});

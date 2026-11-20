// custom (owner 2026-11-20): when the Quick Job Change window pops up by itself (world/jobs/quickJobChange.ts
// `shouldPopUp`): on reaching a tier, at each login while one is due, never again in a session after the player closed it
// (until the tier changes), and never with the test switch `flyffweb.jobPopup` = 'off'.

import { describe, expect, it } from 'vitest';
import { jobPopupOff, shouldPopUp } from '../src/world/jobs/quickJobChange';

describe('shouldPopUp(before, now, login, dismissed, off)', () => {
  it('pops up when a tier becomes due', () => {
    expect(shouldPopUp(null, 'first', false, false, false)).toBe(true);
  });

  it('not again for the same tier, unless at the login', () => {
    expect(shouldPopUp('first', 'first', false, false, false)).toBe(false);
    expect(shouldPopUp('first', 'first', true, false, false)).toBe(true);
  });

  it('not after the player closed it, nor with the switch off, nor with nothing due', () => {
    expect(shouldPopUp(null, 'first', true, true, false)).toBe(false);
    expect(shouldPopUp(null, 'first', true, false, true)).toBe(false);
    expect(shouldPopUp('first', null, true, false, false)).toBe(false);
  });
});

describe('jobPopupOff', () => {
  it('reads the switch, and a storage that throws as on', () => {
    expect(jobPopupOff({ getItem: (key) => (key === 'flyffweb.jobPopup' ? 'off' : null) })).toBe(true);
    expect(jobPopupOff({ getItem: () => null })).toBe(false);
    expect(jobPopupOff({ getItem: () => { throw new Error('blocked'); } })).toBe(false);
    expect(jobPopupOff(undefined)).toBe(false);
  });
});

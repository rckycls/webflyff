// custom (owner 2026-11-20): the Quick Job Change window's job portraits (scripts/renderJobPortraits.ts), shipped with the
// build and found under their UI keys (hud/ownIcons.ts `jobPortraitKey`).

import { describe, expect, it } from 'vitest';
import { OWN_ICONS, jobPortraitKey } from '../src/world/hud/ownIcons';

describe('jobPortraitKey', () => {
  it('names a job\'s picture by its sex; a Master and a Hero use their second job\'s', () => {
    expect(jobPortraitKey(6, 0)).toBe('ui/jobs/job6_m.png');
    expect(jobPortraitKey(16, 0)).toBe('ui/jobs/job6_m.png');
    expect(jobPortraitKey(24, 0)).toBe('ui/jobs/job6_m.png');
    expect(jobPortraitKey(3, 1)).toBe('ui/jobs/job3_f.png');
    expect(jobPortraitKey(31, 1)).toBe('ui/jobs/job13_f.png');
  });

  it('has a picture for every job a change gives, in both sexes', () => {
    for (const job of [1, 2, 3, 4, ...Array.from({ length: 24 }, (_, i) => 6 + (i < 8 ? i : i + 2))]) {
      for (const sex of [0, 1]) expect(OWN_ICONS.get(jobPortraitKey(job, sex)), `${job}/${sex}`).toMatch(/jobs\/job\d+_[mf]\.png$/);
    }
  });
});

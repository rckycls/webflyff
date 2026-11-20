// custom (owner 2026-11-20): the Quick Job Change window's rules (world/jobs/quickJobChange.ts), as the World's patch
// checks them (outer repo, WORLDSERVER/QuickJobChange.h) and V15's NPC scripts change jobs.

import { describe, expect, it } from 'vitest';
import {
  JOB_CHAINS, JOB_NAMES, dueTier, jobDescription, jobSlots, nextChangeLevel,
} from '../src/world/jobs/quickJobChange';

const none = (): boolean => false;
const jobs = (slots: { job: number | null }[]): (number | null)[] => slots.map((slot) => slot.job);
const open = (slots: { job: number | null; open: boolean }[]): (number | null)[] => slots.filter((s) => s.open).map((s) => s.job);

describe('dueTier: the V15 NPC scripts\' level rules', () => {
  it('a Vagrant at 15 is due its first job; at 14 not', () => {
    expect(dueTier(0, 15, 0)).toBe('first');
    expect(dueTier(0, 14, 9999)).toBeNull();
  });

  it('a first job at 60 is due its second job', () => {
    expect(dueTier(1, 60, 0)).toBe('second');
    expect(dueTier(4, 59, 9999)).toBeNull();
  });

  it('a second job at 120 with 99.99% is due its Master; at 99.98% not', () => {
    expect(dueTier(6, 120, 9999)).toBe('master');
    expect(dueTier(6, 120, 9998)).toBeNull();
  });

  it('a Master at 120 with 99.99% is due its Hero; a Hero is due nothing', () => {
    expect(dueTier(16, 120, 9999)).toBe('hero');
    expect(dueTier(24, 121, 9999)).toBeNull();
  });
});

describe('jobSlots: four slots, the open ones by the class lock', () => {
  it('a Vagrant sees Mercenary, Acrobat, Assist and Magician, all open', () => {
    const slots = jobSlots(0, 'first', none);
    expect(jobs(slots)).toEqual([1, 2, 3, 4]);
    expect(open(slots)).toEqual([1, 2, 3, 4]);
  });

  it('a Vagrant who started the Acrobat chain (QUEST_VOCACR_BFTRN 53) sees only Acrobat open', () => {
    expect(open(jobSlots(0, 'first', (q) => q === 53))).toEqual([2]);
  });

  it('a Mercenary sees Knight, Blade and two filler locks', () => {
    const slots = jobSlots(1, 'second', none);
    expect(jobs(slots)).toEqual([6, 7, null, null]);
    expect(open(slots)).toEqual([6, 7]);
  });

  it('an Assist whose Ringmaster chain ended (QUEST_HERORIN_TRN5 182) sees only Ringmaster open', () => {
    const slots = jobSlots(3, 'second', (q) => q === 182);
    expect(jobs(slots)).toEqual([10, 11, null, null]);
    expect(open(slots)).toEqual([10]);
  });

  it('a Knight at 120 sees Knight Master, a Blade Master sees Blade Hero, each with three locks', () => {
    expect(jobs(jobSlots(6, 'master', none))).toEqual([16, null, null, null]);
    expect(open(jobSlots(6, 'master', none))).toEqual([16]);
    expect(jobs(jobSlots(17, 'hero', none))).toEqual([25, null, null, null]);
  });
});

describe('the names, the texts and the chains', () => {
  it('names every job a change can give', () => {
    expect(JOB_NAMES.get(1)).toBe('Mercenary');
    expect(JOB_NAMES.get(12)).toBe('Psykeeper');
    expect(JOB_NAMES.get(16)).toBe('Knight Master');
    expect(JOB_NAMES.get(31)).toBe('Elementor Hero');
    expect([...JOB_NAMES.keys()].length).toBe(4 + 8 + 8 + 8);
  });

  it('describes each job: the Mercenary\'s close combat, the Master\'s level 60, the Hero\'s level 121', () => {
    expect(jobDescription(1)).toContain('close combat');
    expect(jobDescription(16)).toContain('level 60');
    expect(jobDescription(16)).toContain('Knight Master');
    expect(jobDescription(24)).toContain('level 121');
    for (const job of JOB_NAMES.keys()) expect(jobDescription(job).length).toBeGreaterThan(40);
  });

  it('holds the chains of defineQuest.h (the last #define wins)', () => {
    expect(JOB_CHAINS.get(1)).toEqual([151, 152, 153, 154]);
    expect(JOB_CHAINS.get(2)).toEqual([53, 54, 55, 56]);
    expect(JOB_CHAINS.get(6)).toEqual([163, 164, 165, 166, 167]);
    expect(JOB_CHAINS.get(8)).toEqual([57, 58, 59, 60, 61]);
    expect(JOB_CHAINS.get(10)).toEqual([178, 179, 180, 181, 182]);
    expect(JOB_CHAINS.get(11)).toEqual([173, 174, 175, 176, 177]);
    expect(JOB_CHAINS.get(16)).toEqual([5022]);
    expect(JOB_CHAINS.get(24)).toEqual([5023]);
  });

  it('gives the next change\'s level', () => {
    expect([0, 1, 6, 16, 24].map(nextChangeLevel)).toEqual([15, 60, 120, 120, null]);
  });
});

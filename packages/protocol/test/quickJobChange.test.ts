// custom (owner 2026-11-20): the Quick Job Change window's packet, as the World's patch reads it (outer repo,
// patches/2026-11-20-quick-job-change.patch: `CDPSrvr::OnQuickJobChange`, one int, the job picked).

import { describe, expect, it } from 'vitest';
import { ArReader } from '../src/ar/ArReader';
import { PacketType, encodeQuickJobChange } from '../src';

const body = (bytes: Uint8Array, type: number): ArReader => {
  const r = new ArReader(bytes);
  expect(r.u32()).toBe(0xffffffff); // DPID_UNKNOWN
  expect(r.u32()).toBe(type);
  return r;
};

describe('QUICK_JOB_CHANGE 0x8fff0130 (custom, owner 2026-11-20)', () => {
  it('is 0x8fff0130, after the Teleport window\'s 0x8fff0120', () => {
    expect(PacketType.QUICK_JOB_CHANGE).toBe(0x8fff0130);
  });

  it('encodes the picked job after DPID_UNKNOWN and the type', () => {
    const r = body(encodeQuickJobChange(2), 0x8fff0130);
    expect(r.i32()).toBe(2);
    r.expectEnd();
    const hero = body(encodeQuickJobChange(31), 0x8fff0130);
    expect(hero.i32()).toBe(31);
    hero.expectEnd();
  });

  it('refuses a number that is no job a change can give (Vagrant, Puppeteer, Gatekeeper, Doppler, out of range)', () => {
    for (const job of [0, 5, 14, 15, 32, -1, 1.5]) expect(() => encodeQuickJobChange(job)).toThrow(RangeError);
  });
});

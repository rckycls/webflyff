// custom (owner 2026-11-19): the Teleport window's packet, as the World's patch reads it (outer repo,
// patches/2026-11-19-teleport-window.patch: `CDPSrvr::OnTeleportWindow`, one int, the place number).

import { describe, expect, it } from 'vitest';
import { ArReader } from '../src/ar/ArReader';
import { PacketType, TELEPORT_PLACE_COUNT, encodeTeleportWindow } from '../src';

const body = (bytes: Uint8Array, type: number): ArReader => {
  const r = new ArReader(bytes);
  expect(r.u32()).toBe(0xffffffff); // DPID_UNKNOWN
  expect(r.u32()).toBe(type);
  return r;
};

describe('TELEPORT_WINDOW 0x8fff0120 (custom, owner 2026-11-19)', () => {
  it('is 0x8fff0120, free on every branch (0x0100-0x0103 and 0x0110 are taken)', () => {
    expect(PacketType.TELEPORT_WINDOW).toBe(0x8fff0120);
    expect(TELEPORT_PLACE_COUNT).toBe(14);
  });

  it('writes the type, then the place number as an int', () => {
    const r = body(encodeTeleportWindow(5), 0x8fff0120);
    expect(r.i32()).toBe(5);
    r.expectEnd();
    const last = body(encodeTeleportWindow(13), 0x8fff0120);
    expect(last.i32()).toBe(13);
    last.expectEnd();
  });

  it('refuses a number that is no place', () => {
    for (const place of [-1, 14, 1.5, Number.NaN]) expect(() => encodeTeleportWindow(place)).toThrow(RangeError);
  });
});

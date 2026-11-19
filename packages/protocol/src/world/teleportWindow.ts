// custom (owner 2026-11-19): the Teleport window's packet (docs/superpowers/specs/2026-11-19-teleport-window-design.md).
//
//   packet   PACKETTYPE_TELEPORT_WINDOW 0x8FFF0120, web client -> World (`CDPSrvr::OnTeleportWindow`, the outer repo's
//            patches/2026-11-19-teleport-window.patch): one int, the place number. The World holds the places, the VIP
//            rule, the price and the wait (WORLDSERVER/TeleportWindow.h); a World without the patch ignores it.

import { clientPacket } from './packet';
import { PacketType } from '../constants';

/** The places of the window and of the World's table (`TELEPORT_WINDOW_PLACES`), numbered 0 to 13. */
export const TELEPORT_PLACE_COUNT = 14;

/** The Teleport window's Apply: the place's number. */
export function encodeTeleportWindow(place: number): Uint8Array {
  if (!Number.isInteger(place) || place < 0 || place >= TELEPORT_PLACE_COUNT) throw new RangeError(`Invalid teleport place ${place}`);
  return clientPacket(PacketType.TELEPORT_WINDOW).i32(place).toBytes();
}

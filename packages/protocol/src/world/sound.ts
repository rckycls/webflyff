// The server's music and sound orders (Piece 6 M2). The browser plays them by id from its audio catalog; it never plays a
// file the server names.

import type { ArReader } from '../ar/ArReader';
import type { MessageOf } from './types';

/** PLAYMUSIC: `CDPClient::OnPlayMusic` (`Neuz/DPClient.cpp:11736-11742`): `ar >> idmusic;` (`u_long`), played once. */
export function readPlayMusic(r: ArReader): MessageOf<'playMusic'> {
  return { type: 'playMusic', music: r.u32() };
}

/**
 * PLAYSOUND: `CDPClient::OnPlaySound` (`Neuz/DPClient.cpp:11744-11767`): `ar >> nType;` (`BYTE`), then for type 0
 * `ar >> idsound;` (`u_long`) and for type 1 `ar.ReadString( szSound, MAX_PATH )`, a file name Neuz plays only with its
 * voice option on. A type-1 name is read and dropped (`sound: null`); another type reads nothing more, as in the C++.
 */
export function readPlaySound(r: ArReader): MessageOf<'playSound'> {
  const kind = r.u8();
  if (kind === 0) return { type: 'playSound', sound: r.u32() };
  if (kind === 1) r.string(260); // MAX_PATH
  return { type: 'playSound', sound: null };
}

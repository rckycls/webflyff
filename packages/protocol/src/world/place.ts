import type { ArReader } from '../ar/ArReader';
import type { MessageOf } from './types';

/** SETPOS: `CDPClient::OnSetPos` (`Neuz/DPClient.cpp:2215`): `ar >> vPos`. */
export function readSetPos(r: ArReader): MessageOf<'setPos'> {
  return { type: 'setPos', pos: r.vec3() };
}

/** SETPOSANGLE: `CDPClient::OnSetPosAngle` (`Neuz/DPClient.cpp:2275`): `ar >> vPos >> fAngle`. */
export function readSetPosAngle(r: ArReader): MessageOf<'setPosAngle'> {
  const pos = r.vec3();
  const angle = r.f32();
  return { type: 'setPosAngle', pos, angle };
}

/** DEL_OBJ: `CDPClient::OnRemoveObj` (`Neuz/DPClient.cpp:1643`) takes only the object ID, so there are no fields. */
export function readDelObj(): MessageOf<'delObj'> {
  return { type: 'delObj' };
}

/** WORLD_READINFO: `CDPClient::OnWorldReadInfo` (`Neuz/DPClient.cpp:18781`): `ar >> dwWorldId >> vPos`. */
export function readWorldReadInfo(r: ArReader): MessageOf<'worldReadInfo'> {
  const worldId = r.u32();
  const pos = r.vec3();
  return { type: 'worldReadInfo', worldId, pos };
}

/**
 * REPLACE (the message inside a bundle, not the packet): `CDPClient::OnReplace` (`Neuz/DPClient.cpp:2297`): `ar >>
 * dwWorldID; ar >> vPos`. The rest of the function loads the map and reads nothing more.
 */
export function readReplace(r: ArReader): MessageOf<'replace'> {
  const worldId = r.u32();
  const pos = r.vec3();
  return { type: 'replace', worldId, pos };
}

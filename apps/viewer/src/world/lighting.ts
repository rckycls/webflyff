// The world's light, fixed at noon (Piece 1 has no day and night). Copies the outdoor branch of CWorld::SetLight
// (Source/_Common/World3D.cpp:1778-2010), which is the one Madrigal takes: its .wld says `indoor 0`, and none of the
// continents around the start (WdMadrigal.wld.cnt) has `C_useEnvir 1`, so the __BS_CHANGING_ENVIR branch (:1793-1834)
// is skipped. The .wld's own `ambient`, `diffuse` and `lightDir` are read only by the indoor branch (:1837-1893).
//
//   :1903-1917  the colours come from the 24-hour table m_k24Light, which is gs_kLight (WorldEnvironment.cpp:15-42)
//               unless the .wld says `use24light` (Madrigal's does not, so InitWorldEnvir copies the default, :173).
//               nHour is the game hour minus one (:1907), so at 12:00 the entry is [10]: diffuse 1.0, ambient 0.5.
//   :1937-1939  bloom is off (HwOption.cpp:747 forces m_nBloom = 0), so nothing is scaled down there.
//   :1960-1972  (no __YENV, VersionCommon.h:272) diffuse *= 1.1, ambient *= 0.9: 1.1 and 0.45.
//   :1982-1988  the sun: (0, 0, 1) turned about x by m_fSunAngle + 180 degrees, where m_fSunAngle is
//               -(minutes from noon)^2 / 2500 + 45 (SkyBox.cpp:590-591), 45 at noon: the light points along
//               (0, sin 45, -cos 45) in D3D, i.e. up and toward -z.
//   :1997-2004  D3DRS_AMBIENT = (DWORD)(ambient * 255) = 114 as a colour.
//
// Fixed-function D3D lights a vertex with `material.ambient * (D3DRS_AMBIENT + light.ambient) + material.diffuse *
// light.diffuse * max(N . L, 0)`, with L pointing at the light (minus the light's direction). The terrain and the
// static models have material ambient and diffuse 1 (World3D.cpp:2050-2058, Material.cpp:151-156), so their ambient is
// 114/255 + 0.45 and their sun 1.1. (The skinning shader of animated models uses ambient + 0.4 instead,
// World3D.cpp:779 and the IDR_DATA1 vertex shader: 0.85, which the viewer does not tell apart.) At noon the sun is
// below the horizon for the lighting (L points down), so flat ground gets the ambient alone, as in the client.

import type { Vec3 } from '@flyffweb/formats';

export interface WorldLight {
  /** The light every surface gets whatever its normal, a grey level as D3D stores it (0 to 1, no colour management). */
  ambient: number;
  /** The sun's colour, the same way. */
  sunColor: number;
  /** Unit vector from the surface toward the sun, in the web frame. */
  sunDirection: Vec3;
}

/** gs_kLight[10] (WorldEnvironment.cpp:26): the entry CWorld::SetLight reads at 12:00. */
const NOON_DIFFUSE = 1.0;
const NOON_AMBIENT = 0.5;
/** World3D.cpp:1960-1972. */
const DIFFUSE_SCALE = 1.1;
const AMBIENT_SCALE = 0.9;
/** SkyBox.cpp:591 at noon. */
const NOON_SUN_ANGLE_DEGREES = 45;

export function noonLight(): WorldLight {
  const ambient = NOON_AMBIENT * AMBIENT_SCALE;
  // D3DRS_AMBIENT is a D3DCOLOR: the float is truncated to a byte (World3D.cpp:1997-2000)
  const globalAmbient = Math.trunc(ambient * 255) / 255;

  // D3DXMatrixRotationX(a) turns the row vector (0, 0, 1) into (0, -sin a, cos a)
  const a = ((NOON_SUN_ANGLE_DEGREES + 180) * Math.PI) / 180;
  const lightDirection: Vec3 = [0, -Math.sin(a), Math.cos(a)];
  // toward the light is minus the direction it shines in; the web frame negates z
  const towardSun: Vec3 = [0 - lightDirection[0], 0 - lightDirection[1], lightDirection[2]];

  return { ambient: globalAmbient + ambient, sunColor: NOON_DIFFUSE * DIFFUSE_SCALE, sunDirection: towardSun };
}

/** The red, green and blue of a D3DCOLOR (0xAARRGGBB) as 0 to 1; alpha is ignored. */
export function d3dColor(argb: number): [number, number, number] {
  return [((argb >>> 16) & 0xff) / 255, ((argb >>> 8) & 0xff) / 255, (argb & 0xff) / 255];
}

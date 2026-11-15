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

import type { Vec3, WorldManifest } from '@flyffweb/formats';

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

/** A light in colour: red, green and blue of each part, as D3D stores them (0 to 1). */
export interface WorldLightRgb {
  ambient: [number, number, number];
  sunColor: [number, number, number];
  /** Unit vector from the surface toward the light, in the web frame. */
  sunDirection: Vec3;
}

const f32 = Math.fround;

/** A grey `WorldLight` as a `WorldLightRgb`. */
export function rgbLight(light: WorldLight): WorldLightRgb {
  return { ambient: [light.ambient, light.ambient, light.ambient], sunColor: [light.sunColor, light.sunColor, light.sunColor], sunDirection: light.sunDirection };
}

/**
 * 2026-11-15 (post-merge): the indoor branch of `CWorld::SetLight` (World3D.cpp:1837-1893), from the .wld's `ambient` and
 * `diffuse` (D3DCOLORs) and `lightDir` (D3D), in floats as the C++ keeps them:
 *
 *   :1841-1850  the diffuse and the ambient are the colours' bytes over 255.f; bloom is off (see the top), and
 *               `HookUpdateLight` does nothing where no continent uses its environment.
 *   :1870-1880  diffuse += 0.1f, ambient *= 0.9f.
 *   :1884       the light shines along `lightDir`; :1887-1891 D3DRS_AMBIENT = (DWORD)(ambient * 255).
 *
 * D3D clamps each vertex's light at 1 before it meets the texture (three.js does not): a channel whose ambient (the global
 * one plus the light's) is 1 or more is lit fully everywhere, so it is 1 there and the light adds nothing. A `lightDir` of
 * no length is a directional light D3D refuses (`SetLight` fails, `Light.cpp:28-31`), so the light set before stays:
 * `outdoor`'s colour and direction (the outdoor world the player came from, at noon here). (Its own ambient part stays
 * too; the indoor one stands in for it: 0.45 against 0.4518 in the small guild house.)
 */
export function indoorLight(ambient: number, diffuse: number, lightDir: Vec3, outdoor: WorldLight = noonLight()): WorldLightRgb {
  const ambients: [number, number, number] = [0, 0, 0];
  const suns: [number, number, number] = [0, 0, 0];
  const aimed = lightDir[0] !== 0 || lightDir[1] !== 0 || lightDir[2] !== 0;
  for (let i = 0; i < 3; i++) {
    const shift = 16 - i * 8;
    const light = f32(f32(((ambient >>> shift) & 0xff) / 255) * f32(0.9));
    const sun = aimed ? f32(f32(((diffuse >>> shift) & 0xff) / 255) + f32(0.1)) : outdoor.sunColor;
    const total = Math.trunc(f32(light * 255)) / 255 + light;
    ambients[i] = Math.min(total, 1);
    suns[i] = total >= 1 ? 0 : sun;
  }
  let sunDirection = outdoor.sunDirection;
  if (aimed) {
    // toward the light is minus the direction it shines in; the web frame negates z
    const length = Math.hypot(lightDir[0], lightDir[1], lightDir[2]);
    sunDirection = [0 - lightDir[0] / length, 0 - lightDir[1] / length, lightDir[2] / length + 0];
  }
  return { ambient: ambients, sunColor: suns, sunDirection };
}

/**
 * 2026-11-15 (post-merge): the stage's light: a world's own indoor light (`indoorLight`) when `indoor` asks for it and its
 * manifest is an indoor one that carries it, else the noon light.
 */
export function stageLight(manifest: Pick<WorldManifest, 'indoor' | 'ambient' | 'diffuse' | 'lightDir'>, indoor: boolean): WorldLightRgb {
  if (indoor && manifest.indoor === true && manifest.diffuse !== undefined && manifest.lightDir !== undefined) {
    return indoorLight(manifest.ambient, manifest.diffuse, manifest.lightDir);
  }
  return rgbLight(noonLight());
}

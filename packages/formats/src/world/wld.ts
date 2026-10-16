// World header (`Client/World/<World>/<World>.wld`), copying CWorld::OpenWorld
// (Source/_Common/WorldFile.cpp:32), whose token loop is at :56-213.
//
// OpenWorld reads the file with `do { GetToken; if (Token == "size") ... else if ... } while (tok != FINISHED)`:
// a token that matches no keyword is skipped on its own, so the numbers after an unknown keyword are skipped one
// by one too, and a keyword found among them is still honoured. `readWld` loops the same way.
//
// Defaults come from CWorld::CWorld (Source/_Common/World.cpp:75, the client part at :114-152) and from
// OpenWorld itself (`g_MPU = OLD_MPU` when there is no MPU line, :215).

import type { Vec3 } from '../binary/BinaryReader';
import { TokenStream, tokenize } from '../script/scanner';

export interface WorldInfo {
  /** Landscape tiles across and down (`size`): m_nLandWidth, m_nLandHeight. */
  size: [number, number];
  /** `MPU`, "meter per unit" (landscape.h:16): g_MPU, or 4 (OLD_MPU) when the file has no MPU line. */
  mpu: number;
  /** `indoor`: no sky box and no weather. */
  indoor: boolean;
  /** `fly`: flying allowed. Defaults to true. */
  fly: boolean;
  /** `ambient`, D3DCOLOR 0xAARRGGBB as written (`0x808080` stays `0x808080`). */
  ambient: number;
  /** `bgColor`, D3DCOLOR 0xAARRGGBB. Not read by the C++ (see below). */
  bgColor: number;
  /** `diffuse`, D3DCOLOR 0xAARRGGBB. */
  diffuse: number;
  /** `lightDir`. */
  lightDir: Vec3;
  /** `fogSetting`: start and end distance, and density. */
  fog: { start: number; end: number; density: number };
  /** `camera`: the editor's saved view. Not read by the C++ (see below). */
  camera: { position: Vec3; angle: number; angleX: number };
  /** `bgm`: music id. */
  bgm: number;
  /** `pkmode`: PK rule flags (the RA_* bits). */
  pkMode: number;
}

/**
 * Reads the text of a `.wld` file (see `decodeScript`). `file` only labels errors.
 *
 * `bgColor` and `camera` are in every shipped file but have no branch in OpenWorld (the client skips them one
 * token at a time); the world editor writes them. They are read here because the viewer wants them. A file
 * without them gets the values the shipped files all share for bgColor (0xffe0e0ff) and an origin camera.
 *
 * OpenWorld also reads `revival`, `sky`, `cloud`, `sun`, `moon`, `use24light` and `seacloud`. Their values are
 * not in `WorldInfo`; they are consumed with the same arguments the C++ takes, so a keyword-like word among
 * those arguments is not mistaken for a keyword.
 *
 * Values are the numbers as written, not rounded to float32 as the C++ stores them. A keyword whose value is
 * missing or malformed throws a FormatError (the C++ reads 0 and carries on).
 */
export function readWld(text: string, file = '<wld>'): WorldInfo {
  const ts = new TokenStream(tokenize(text, file), undefined, file);

  const info: WorldInfo = {
    size: [0, 0],
    mpu: 4,
    indoor: false,
    fly: true,
    ambient: 0xff808080,
    bgColor: 0xffe0e0ff,
    diffuse: 0,
    lightDir: [0, 0, 0],
    fog: { start: 70, end: 400, density: 0 },
    camera: { position: [0, 0, 0], angle: 0, angleX: 0 },
    bgm: 0,
    pkMode: 0,
  };

  const vec3 = (): Vec3 => [ts.number(), ts.number(), ts.number()];

  while (!ts.done()) {
    // Line numbers in the comments below are WorldFile.cpp's.
    // Matched on the token's text whatever its kind, like `script.Token == _T("size")`.
    switch (ts.word()) {
      case 'size': {
        const width = ts.number();
        ts.word(); // the comma: OpenWorld calls GetToken here and does not look at what it got
        info.size = [width, ts.number()];
        break;
      }
      case 'ambient':
        info.ambient = ts.hex();
        break;
      case 'revival':
        ts.number(); // m_dwIdWorldRevival
        ts.word(); // m_szKeyRevival
        break;
      case 'indoor':
        info.indoor = ts.number() !== 0;
        break;
      case 'fly':
        info.fly = ts.number() !== 0;
        break;
      case 'bgm':
        info.bgm = ts.number();
        break;
      case 'pkmode':
        info.pkMode = ts.number();
        break;
      case 'diffuse':
        info.diffuse = ts.hex();
        break;
      case 'lightDir':
        info.lightDir = vec3();
        break;
      case 'fogSetting':
        info.fog = { start: ts.number(), end: ts.number(), density: ts.number() };
        break;
      case 'MPU':
        info.mpu = ts.number();
        break;
      case 'sky': // :148, three file names
      case 'cloud': // :162, three file names
        ts.word();
        ts.word();
        ts.word();
        break;
      case 'sun': // :175, one file name
      case 'moon': // :185, one file name
      case 'seacloud': // :201, one file name
        ts.word();
        break;
      case 'use24light': // :195
        ts.number();
        break;
      case 'bgColor': // not in OpenWorld
        info.bgColor = ts.hex();
        break;
      case 'camera': {
        // not in OpenWorld
        const position = vec3();
        info.camera = { position, angle: ts.number(), angleX: ts.number() };
        break;
      }
    }
  }

  return info;
}

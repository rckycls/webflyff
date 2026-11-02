// The monster icons of a continent's world map (`Theme/Default/texMapMonster_<continent>.inc`), copying
// CMonsterInfoPack::LoadScript (Source/Neuz/WorldMap.cpp:1513-1651). Read with CScript, so the mover and item names
// are replaced by their #define values:
//
//   number 11                                       the frames there are room for (m_ap2DTexture)
//   texture "TexMapMonster_Flaris.bmp" 0xffff00ff   the sheet and its colour key
//   serialize 3 40 40 0 0 0 0                       nFrame width height startX startY centerX centerY: frames cut
//                                                   left to right, row by row, from (startX, startY) of the sheet;
//   4 MI_AIBATT1 MI_AIBATT2 MI_AIBATT3 MI_AIBATT4 436 760 II_GEN_GEM_GEM_TWINKLESTONE
//                                                   then nFrame rows: the movers' count and ids, the icon's left and
//                                                   top in the 1280x960 picture, and the drop the tooltip names
//
// Row k goes with frame k: both counters run in step across the serialize statements. `MULTI_LANGUAGE` changes
// nothing here (both branches load `MakePath( DIR_THEME, file )`, :1546-1563).

import { ScriptReader } from '../script/cscript';
import { parseHexToken } from '../script/scanner';

/** A rectangle of the sheet, in pixels. */
export interface MapFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One icon (`__MONSTER_INFO`, WorldMap.h:13-19). */
export interface MapMonsterRow {
  /** The movers the tooltip lists (`m_dwMonsterId`, at most 5), as their MoverProp ids. */
  movers: number[];
  /** The icon's left and top in the 1280x960 picture, as authored (the C++ scales them to the screen as it reads). */
  x: number;
  y: number;
  /** The item the tooltip names after "Booty" (`m_dwDropItemId`); 0 for none. */
  drop: number;
}

export interface MapMonsterPack {
  /** The sheet's file name, as the `texture` statement writes it. */
  texture: string;
  /** The colour key (ARGB, unsigned). */
  colorKey: number;
  frames: MapFrame[];
  rows: MapMonsterRow[];
}

const READER = 'readMapMonsterPack';
const CPP_REF = 'Source/Neuz/WorldMap.cpp:1513-1651 CMonsterInfoPack::LoadScript';
/** The size of `m_dwMonsterId` (WorldMap.h:13-19). */
const MAX_MOVERS = 5;

/**
 * Reads the text of a world map monster script. `textureSize` is the sheet's (`m_size`), which bounds the frames a
 * `serialize` cuts. More frames than `number` (the C++ `Error` and FALSE), more than 5 movers in a row (an overrun of
 * `m_dwMonsterId`) and a row cut short throw a FormatError.
 */
export function readMapMonsterPack(
  text: string, defines: ReadonlyMap<string, number>, file: string, textureSize: { width: number; height: number },
): MapMonsterPack {
  const r = new ScriptReader(text, defines, new Map(), { file, reader: READER, cppRef: CPP_REF });
  const pack: MapMonsterPack = { texture: '', colorKey: 0, frames: [], rows: [] };
  let number = 0;
  for (let tok = r.tokenOrEnd(); tok !== undefined; tok = r.tokenOrEnd()) {
    if (tok.text === 'number') {
      number = r.number('number');
    } else if (tok.text === 'texture') {
      pack.texture = r.token('the texture file').text;
      const key = r.token('the colour key');
      const value = parseHexToken(key.text);
      if (value === undefined) r.fail(`expected a hex colour key, found "${key.text}"`, key);
      pack.colorKey = value >>> 0;
    } else if (tok.text === 'serialize') {
      if (pack.frames.length >= number) tooMany(r, number);
      const nFrame = r.number('nFrame');
      const w = r.number('width');
      const h = r.number('height');
      const startX = r.number('startX');
      const startY = r.number('startY');
      r.number('centerX');
      r.number('centerY');
      let cut = 0;
      for (let y = startY; y < textureSize.height; y += h) {
        for (let x = startX; x < textureSize.width; x += w, cut++) {
          if (cut >= nFrame) continue;
          if (pack.frames.length >= number) tooMany(r, number);
          pack.frames.push({ x, y, w, h });
        }
      }
      for (let i = 0; i < nFrame; i++) {
        const count = r.number('the movers\' count');
        if (count > MAX_MOVERS) r.fail(`a row of ${count} movers, more than ${MAX_MOVERS} (m_dwMonsterId)`);
        const movers = Array.from({ length: Math.max(0, count) }, () => r.number('a mover id'));
        const x = r.number('left');
        const y = r.number('top');
        const drop = r.number('the drop item');
        pack.rows.push({ movers, x, y, drop });
      }
    }
  }
  return pack;
}

function tooMany(r: ScriptReader, number: number): never {
  return r.fail(`more frames than its number ${number}`);
}


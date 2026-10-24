// Texture-pack scripts (`SFX/DmgEffect.inc`, `Icon/icon_target.inc` ...), copying CTexturePack::LoadScript
// (Source/_Common/2DRender.cpp:1559). A sheet of pictures is cut into frames by a script of statements, read with the
// plain scanner (CScanner: no #defines, no string table):
//
//   number 28                                  the number of frames (the size of the array)
//   texture "sfx\DmgEffect.dds" 0x00000000     the picture and its colour key (ARGB; the key is made transparent)
//   serialize 10 50 50 0 0 0 0                 nFrame width height startX startY centerX centerY: a run of tiles
//   pos 200 50 0 50 n                          width height x y flip: one rectangle (flip: n, h, v or hv)
//
// A frame is a rectangle of the picture in pixels (x to the right, y down). The C++ turns each into the four
// texture coordinates of a quad (pixel / picture size); `h` and `v` mirror the quad across and down, and `hv` both.
// `data` and `datauv`, the statements that give the corners themselves, are not read (see readTexturePack).

import { FormatError } from '../errors';
import { TokenStream, tokenize } from '../script/scanner';
import type { Token } from '../script/scanner';

export interface PackFrame {
  /** Left edge of the rectangle in the picture, in pixels. */
  x: number;
  /** Top edge, in pixels. */
  y: number;
  /** Width (`m_size.cx`, which is also the width the frame is drawn at). */
  w: number;
  /** Height (`m_size.cy`). */
  h: number;
  /**
   * The mirroring of a `pos` statement: `h` flips the quad across (left to right), `v` down (top to bottom), `hv`
   * both. Not set for `n` or any other word, and for `serialize` frames, which are never mirrored.
   */
  flip?: 'h' | 'v' | 'hv';
}

export interface TexturePack {
  /** The picture's file name as the `texture` statement writes it (`sfx\DmgEffect.dds`). '' when there is none. */
  texture: string;
  /** The colour key of the `texture` statement (`GetHex`: ARGB, unsigned): the colour made transparent. */
  colorKey: number;
  /** The frames in the order they are read: the index is the number the game draws them by. */
  frames: PackFrame[];
}

const READER = 'readTexturePack';
const CPP_REF = 'Source/_Common/2DRender.cpp:1559 CTexturePack::LoadScript';

/**
 * Reads the text of a texture-pack script (see `decodeScript`), as LoadScript does: a loop that takes one word at
 * a time and runs the statement it names. A word that names none is skipped, so the numbers of an unknown
 * statement are skipped one by one and `MULTI_LANGUAGE` (a flag that moves the picture to the theme folder) is
 * ignored. Comments, block and line, are skipped by the scanner.
 *
 * `serialize` cuts the picture into tiles left to right, then down, as many as it says, and so needs the size of the
 * picture the `texture` statement loads (`m_size`); pass it as `textureSize` for a file whose runs wrap (the
 * C++ reads it from the loaded picture). Without it the picture is taken wide and tall enough for every run, so a
 * run is one row.
 *
 * Differences from the C++:
 * - A frame past `number` throws a FormatError (the C++ writes past the array for `pos`, and logs an error and
 *   gives up for `serialize`), as does a frame before `number`.
 * - `data` and `datauv` throw: they put the corners of the quad in directly, which a rectangle cannot say, and no
 *   file this reader is meant for uses them.
 * - A `serialize` whose tile has no width or height throws (the C++ never leaves its loop).
 * - A statement that stops early or holds a word where a number goes throws (the C++ reads 0).
 * Like the C++, the word after a `pos` statement is taken for its flip whatever it is and is not put back, so a
 * `pos` without a flip swallows the next word.
 */
export function readTexturePack(
  text: string,
  file = 'texturePack.inc',
  textureSize?: { width: number; height: number },
): TexturePack {
  const ts = new TokenStream(tokenize(text, file), undefined, file);
  const fail = (message: string, at: Token): never => {
    throw new FormatError(message, { file, offset: at.offset, unit: 'char', line: at.line, reader: READER, cppRef: CPP_REF });
  };

  let allotted: number | undefined; // m_dwNumber: undefined until `number` allocates the array
  let texture = '';
  let colorKey = 0;
  const frames: PackFrame[] = [];

  /** Fails unless the array has room for one more frame (`dwCount >= m_dwNumber`). */
  const needRoom = (at: Token): void => {
    const room = allotted;
    if (room === undefined) fail(`${at.text} comes before a number statement, so there is no array for its frame`, at);
    else if (frames.length >= room) fail(`${at.text} has no room: the number statement allots ${room} frames`, at);
  };
  const add = (frame: PackFrame, at: Token): void => {
    needRoom(at);
    frames.push(frame);
  };

  while (!ts.done()) {
    const word = ts.next()!;
    switch (word.text) {
      case 'number':
        allotted = ts.number();
        break;
      case 'texture':
        texture = ts.word();
        colorKey = ts.hex();
        break;
      case 'pos': {
        const w = ts.number();
        const h = ts.number();
        const x = ts.number();
        const y = ts.number();
        const flip = ts.next()?.text; // GetToken after y, not put back
        add(flip === 'h' || flip === 'v' || flip === 'hv' ? { x, y, w, h, flip } : { x, y, w, h }, word);
        break;
      }
      case 'serialize': {
        needRoom(word); // the C++ checks once before it reads the numbers, and again for each frame
        const nFrame = ts.number();
        const w = ts.number();
        const h = ts.number();
        const startX = ts.number();
        const startY = ts.number();
        ts.number(); // the center of the frames (center.x, center.y): not a rectangle's
        ts.number();
        if (w <= 0 || h <= 0) fail(`serialize tiles of ${w} x ${h} have no size`, word);
        const width = textureSize?.width ?? Infinity;
        const height = textureSize?.height ?? Infinity;
        let made = 0; // nCnt
        for (let y = startY; y < height && made < nFrame; y += h) {
          for (let x = startX; x < width && made < nFrame; x += w, made++) add({ x, y, w, h }, word);
        }
        break;
      }
      case 'data':
      case 'datauv':
        return fail(`the ${word.text} statement is not read: it gives the corners of the quad, not a rectangle`, word);
      default:
        break; // a word LoadScript does not know: skipped
    }
  }

  return { texture, colorKey, frames };
}

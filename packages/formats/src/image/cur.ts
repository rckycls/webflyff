// A Windows cursor (`.cur`, 2026-11-05: the upgrade mode's hammer, `Client/Cursor/anvil.cur`, which Neuz loads with
// `LoadCursorFromFile`, Neuz/Neuz.cpp:298). Microsoft's icon layout, the cursor variant:
//
//   ICONDIR, 6 bytes:        u16 reserved (0), u16 type (2 for a cursor), u16 count
//   ICONDIRENTRY, 16 bytes:  u8 width, u8 height, u8 colours, u8 reserved, u16 hotspot x, u16 hotspot y,
//                            u32 bytes, u32 offset of the image
//   the image:               a BITMAPINFOHEADER (its height twice the picture's: the colours, then the mask), the
//                            colours bottom row first (24 or 32 bits, rows padded to 4 bytes), then the AND mask, one
//                            bit a pixel, rows padded to 4 bytes: a set bit is a see-through pixel.
//
// The first image is read. A 32-bit image whose alpha is not all 0 keeps its alpha; otherwise the mask gives it.

import { FormatError } from '../errors';
import type { RgbaImage } from './types';

/** A cursor's picture and its hotspot. */
export interface CursorImage {
  image: RgbaImage;
  hotspot: { x: number; y: number };
}

const fail = (file: string, offset: number, message: string): never => {
  throw new FormatError(message, { file, offset, reader: 'readCur', cppRef: 'Neuz/Neuz.cpp:298 LoadCursorFromFile' });
};

/** Reads the first image of a `.cur` file. */
export function readCur(bytes: Uint8Array, file: string): CursorImage {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 22) fail(file, 0, 'too short for a cursor header');
  if (view.getUint16(0, true) !== 0 || view.getUint16(2, true) !== 2) fail(file, 0, 'not a cursor (ICONDIR type 2)');
  if (view.getUint16(4, true) < 1) fail(file, 4, 'a cursor with no image');
  const hotspot = { x: view.getUint16(10, true), y: view.getUint16(12, true) };
  const offset = view.getUint32(18, true);
  if (offset + 40 > bytes.length) fail(file, 18, 'the image lies past the end');
  const width = view.getInt32(offset + 4, true);
  const height = view.getInt32(offset + 8, true) / 2;
  const bits = view.getUint16(offset + 14, true);
  if (bits !== 24 && bits !== 32) fail(file, offset + 14, `${bits}-bit cursors are not read (24 or 32)`);
  if (view.getUint32(offset + 16, true) !== 0) fail(file, offset + 16, 'a compressed cursor');
  const headerSize = view.getUint32(offset, true);
  const colours = offset + headerSize;
  const colourRow = Math.ceil((width * bits) / 32) * 4;
  const mask = colours + colourRow * height;
  const maskRow = Math.ceil(width / 32) * 4;
  if (mask + maskRow * height > bytes.length) fail(file, mask, 'the mask lies past the end');
  const data = new Uint8Array(width * height * 4);
  const step = bits / 8;
  let alpha = false;
  if (bits === 32) {
    for (let y = 0; y < height && !alpha; y++) {
      for (let x = 0; x < width; x++) if (bytes[colours + y * colourRow + x * 4 + 3]! !== 0) { alpha = true; break; }
    }
  }
  for (let y = 0; y < height; y++) {
    const source = colours + (height - 1 - y) * colourRow;
    const maskLine = mask + (height - 1 - y) * maskRow;
    for (let x = 0; x < width; x++) {
      const at = source + x * step, out = (y * width + x) * 4;
      const clear = ((bytes[maskLine + (x >> 3)]! >> (7 - (x & 7))) & 1) === 1;
      data[out] = bytes[at + 2]!;
      data[out + 1] = bytes[at + 1]!;
      data[out + 2] = bytes[at]!;
      data[out + 3] = alpha ? bytes[at + 3]! : clear ? 0 : 255;
      if (data[out + 3] === 0) data[out] = data[out + 1] = data[out + 2] = 0;
    }
  }
  return { image: { width, height, data }, hotspot };
}

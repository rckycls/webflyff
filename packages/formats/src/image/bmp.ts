// Windows bitmap (`.bmp`), following Microsoft's bitmap storage documentation (BITMAPFILEHEADER and
// BITMAPINFOHEADER). Neuz reads these through D3DX (LoadTextureFromRes, Source/_Common/vutil.cpp:192), which has no
// source here, so this follows the public layout:
//
//   BITMAPFILEHEADER, 14 bytes:  "BM", u32 fileSize, u16 reserved1, u16 reserved2, u32 pixelArrayOffset
//   BITMAPINFOHEADER, 40 bytes:  u32 size (40), i32 width, i32 height, u16 planes, u16 bitCount, u32 compression,
//                                u32 sizeImage, i32 xPixelsPerMeter, i32 yPixelsPerMeter, u32 colorsUsed,
//                                u32 colorsImportant
//   (anything between the headers and the pixel array is skipped)
//   pixel array                  |height| rows of ceil(width * bitCount / 32) * 4 bytes (rows padded to 4 bytes).
//                                A positive height means the bottom row comes first; a negative one, the top row.
//
// Pixels are B, G, R (and one unused byte for a bitCount of 32, so the image is opaque). Only uncompressed
// (BI_RGB) 24 and 32-bit bitmaps with the 40-byte header are read; the file size and sizeImage fields are not
// used. The pixel array has to end with the file: bytes after the last row are a FormatError.

import { BinaryReader } from '../binary/BinaryReader';
import type { RgbaImage } from './types';

const READER = 'readBmp';
const SPEC = 'Microsoft BMP (BITMAPFILEHEADER, BITMAPINFOHEADER)';

const SIGNATURE = 0x4d42; // "BM"
const FILE_HEADER_SIZE = 14;
const INFO_HEADER_SIZE = 40;
const BI_RGB = 0;

/** Reads a `.bmp` file; see the top of this file for what is decoded and what is checked. */
export function readBmp(bytes: Uint8Array, file: string): RgbaImage {
  const r = new BinaryReader(bytes, { file, reader: READER, cppRef: SPEC });
  const failAt = (offset: number, message: string): never => {
    r.offset = offset;
    return r.fail(message);
  };

  if (r.u16() !== SIGNATURE) failAt(0, 'not a BMP file: it does not start with "BM"');
  r.skip(8); // file size, reserved1, reserved2
  const pixelArrayOffset = r.u32();
  const infoSize = r.u32();
  if (infoSize !== INFO_HEADER_SIZE) {
    failAt(14, `unsupported ${infoSize}-byte info header (only the ${INFO_HEADER_SIZE}-byte BITMAPINFOHEADER is read)`);
  }
  const width = r.i32();
  const signedHeight = r.i32();
  r.skip(2); // planes
  const bitCount = r.u16();
  const compression = r.u32();
  r.skip(20); // sizeImage, pixels per meter, colour counts

  if (width <= 0) failAt(18, `width is ${width}`);
  if (signedHeight === 0) failAt(22, 'height is 0');
  if (bitCount !== 24 && bitCount !== 32) failAt(28, `${bitCount}-bit bitmaps are not supported (24 or 32 expected)`);
  if (compression !== BI_RGB) failAt(30, `unsupported compression ${compression} (only uncompressed BI_RGB, 0)`);

  if (pixelArrayOffset < FILE_HEADER_SIZE + INFO_HEADER_SIZE) {
    failAt(10, `the pixel array starts at ${pixelArrayOffset}, inside the headers`);
  }
  r.skip(pixelArrayOffset - r.offset);

  const height = Math.abs(signedHeight);
  const bottomUp = signedHeight > 0;
  const bytesPerPixel = bitCount / 8;
  const rowBytes = Math.floor((width * bitCount + 31) / 32) * 4;
  const start = r.offset;
  r.skip(rowBytes * height);
  r.expectEnd();

  const data = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row++) {
    let from = start + row * rowBytes;
    let to = (bottomUp ? height - 1 - row : row) * width * 4;
    for (let x = 0; x < width; x++, from += bytesPerPixel, to += 4) {
      data[to] = bytes[from + 2];
      data[to + 1] = bytes[from + 1];
      data[to + 2] = bytes[from];
      data[to + 3] = 255;
    }
  }
  return { width, height, data };
}

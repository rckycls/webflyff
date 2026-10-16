// Truevision TGA image (`.tga`), following the "Truevision TGA File Format Specification, Version 2.0" (1991).
// Neuz reads these through D3DX (LoadTextureFromRes, Source/_Common/vutil.cpp:192), which has no source here, so
// this follows the public layout:
//
//   header, 18 bytes:  u8 idLength, u8 colorMapType, u8 imageType,
//                      colour map spec: u16 firstEntry, u16 length, u8 entryBits,
//                      u16 xOrigin, u16 yOrigin, u16 width, u16 height, u8 pixelDepth, u8 descriptor
//   image ID           idLength bytes
//   colour map         length * ceil(entryBits / 8) bytes when colorMapType is 1 (skipped: true-colour images
//                      do not use it)
//   pixel data         imageType 2: width * height pixels; imageType 10: the same, run-length encoded
//   footer (2.0)       u32 extensionOffset, u32 developerOffset, "TRUEVISION-XFILE.\0" (26 bytes), optional
//
// Pixels are B, G, R (and A for a depth of 32). The descriptor says where the first stored pixel goes: bit 5 set
// = top row first, clear = bottom row first; bit 4 set = right-to-left, clear = left-to-right. Its low four bits
// are the number of attribute (alpha) bits; a 32-bit image that declares none is read as opaque.
//
// Run-length packets are one header byte (bit 7 = run, low 7 bits = count - 1) then one pixel (run) or `count`
// pixels (raw). Packets are read as one stream of width * height pixels, so a packet may cross a row boundary.
//
// Everything is consumed to the last byte: the footer is recognised and skipped, but a footer that points at an
// extension or developer area is a FormatError (none is shipped), as are bytes after the pixel data. Colour-mapped
// and grayscale images and depths other than 24 and 32 are refused.

import { BinaryReader } from '../binary/BinaryReader';
import type { RgbaImage } from './types';

const READER = 'readTga';
const SPEC = 'Truevision TGA File Format Specification 2.0';

const HEADER_SIZE = 18;
const FOOTER_SIGNATURE = 'TRUEVISION-XFILE.\0';
/** u32 extensionOffset, u32 developerOffset, then the signature. */
const FOOTER_SIZE = 8 + FOOTER_SIGNATURE.length;

const TYPE_TRUE_COLOR = 2;
const TYPE_TRUE_COLOR_RLE = 10;

const IMAGE_TYPE_NAMES: Record<number, string> = {
  0: 'no image data',
  1: 'colour-mapped',
  3: 'grayscale',
  9: 'colour-mapped, run-length encoded',
  11: 'grayscale, run-length encoded',
};

/** Where the footer starts, or `bytes.length` when the file has none. */
function footerStart(bytes: Uint8Array): number {
  if (bytes.length < HEADER_SIZE + FOOTER_SIZE) return bytes.length;
  const signatureAt = bytes.length - FOOTER_SIGNATURE.length;
  for (let i = 0; i < FOOTER_SIGNATURE.length; i++) {
    if (bytes[signatureAt + i] !== FOOTER_SIGNATURE.charCodeAt(i)) return bytes.length;
  }
  return bytes.length - FOOTER_SIZE;
}

/** Turns stored B, G, R[, A] pixels at `src[from]` into the RGBA pixel at `dst[to]`. */
function putPixel(src: Uint8Array, from: number, dst: Uint8Array, to: number, alpha: boolean): void {
  dst[to] = src[from + 2];
  dst[to + 1] = src[from + 1];
  dst[to + 2] = src[from];
  dst[to + 3] = alpha ? src[from + 3] : 255;
}

/** Reverses the order of the rows, in place. */
function flipRows(data: Uint8Array, width: number, height: number): void {
  const rowBytes = width * 4;
  const swap = new Uint8Array(rowBytes);
  for (let top = 0, bottom = height - 1; top < bottom; top++, bottom--) {
    swap.set(data.subarray(top * rowBytes, (top + 1) * rowBytes));
    data.copyWithin(top * rowBytes, bottom * rowBytes, (bottom + 1) * rowBytes);
    data.set(swap, bottom * rowBytes);
  }
}

/** Reverses the order of the pixels in every row, in place. */
function mirrorRows(data: Uint8Array, width: number, height: number): void {
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let left = 0, right = width - 1; left < right; left++, right--) {
      for (let c = 0; c < 4; c++) {
        const a = row + left * 4 + c;
        const b = row + right * 4 + c;
        const t = data[a];
        data[a] = data[b];
        data[b] = t;
      }
    }
  }
}

/** Reads a `.tga` file; see the top of this file for what is decoded and what is checked. */
export function readTga(bytes: Uint8Array, file: string): RgbaImage {
  const footerAt = footerStart(bytes);
  // The reader stops where the pixel data has to end, so a short pixel stream cannot read into the footer.
  const r = new BinaryReader(bytes.subarray(0, footerAt), { file, reader: READER, cppRef: SPEC });
  const failAt = (offset: number, message: string): never => {
    r.offset = offset;
    return r.fail(message);
  };

  if (footerAt < bytes.length) {
    const footer = new DataView(bytes.buffer, bytes.byteOffset + footerAt, 8);
    if (footer.getUint32(0, true) !== 0) failAt(footerAt, 'the file has an extension area, which is not read');
    if (footer.getUint32(4, true) !== 0) failAt(footerAt + 4, 'the file has a developer area, which is not read');
  }

  const idLength = r.u8();
  const colorMapType = r.u8();
  const imageType = r.u8();
  if (imageType !== TYPE_TRUE_COLOR && imageType !== TYPE_TRUE_COLOR_RLE) {
    const name = IMAGE_TYPE_NAMES[imageType];
    failAt(2, `unsupported image type ${imageType}${name === undefined ? '' : ` (${name})`}`);
  }
  if (colorMapType > 1) failAt(1, `unsupported colour map type ${colorMapType}`);
  r.skip(2); // colour map: first entry
  const colorMapLength = r.u16();
  const colorMapEntryBits = r.u8();
  r.skip(4); // xOrigin, yOrigin
  const width = r.u16();
  const height = r.u16();
  const depth = r.u8();
  const descriptor = r.u8();

  if (width === 0) failAt(12, 'width is 0');
  if (height === 0) failAt(14, 'height is 0');
  if (depth !== 24 && depth !== 32) failAt(16, `${depth}-bit pixels are not supported (24 or 32 expected)`);

  r.skip(idLength);
  if (colorMapType === 1) r.skip(colorMapLength * Math.ceil(colorMapEntryBits / 8));

  const bytesPerPixel = depth / 8;
  const hasAlpha = depth === 32 && (descriptor & 0x0f) !== 0;
  const pixelCount = width * height;
  let data: Uint8Array;

  if (imageType === TYPE_TRUE_COLOR) {
    const start = r.offset;
    r.skip(pixelCount * bytesPerPixel);
    data = new Uint8Array(pixelCount * 4);
    for (let i = 0, from = start, to = 0; i < pixelCount; i++, from += bytesPerPixel, to += 4) {
      putPixel(bytes, from, data, to, hasAlpha);
    }
  } else {
    // A packet holds at most 128 pixels in at least 1 + bytesPerPixel bytes: refuse sizes the file cannot fill
    // before allocating for them.
    const fewestBytes = Math.ceil(pixelCount / 128) * (1 + bytesPerPixel);
    if (fewestBytes > r.remaining()) {
      r.fail(
        `the run-length data is too short: ${r.remaining()} bytes cannot fill ${width}x${height} pixels (at least ${fewestBytes} needed)`,
      );
    }
    data = new Uint8Array(pixelCount * 4);
    for (let done = 0, to = 0; done < pixelCount; ) {
      const packetAt = r.offset;
      const header = r.u8();
      const count = (header & 0x7f) + 1;
      if (count > pixelCount - done) {
        failAt(packetAt, `a packet of ${count} pixels runs past the end of the image (${pixelCount - done} pixels left)`);
      }
      const from = r.offset;
      if (header & 0x80) {
        r.skip(bytesPerPixel);
        for (let i = 0; i < count; i++, to += 4) putPixel(bytes, from, data, to, hasAlpha);
      } else {
        r.skip(count * bytesPerPixel);
        for (let i = 0; i < count; i++, to += 4) putPixel(bytes, from + i * bytesPerPixel, data, to, hasAlpha);
      }
      done += count;
    }
  }
  r.expectEnd();

  if ((descriptor & 0x20) === 0) flipRows(data, width, height);
  if (descriptor & 0x10) mirrorRows(data, width, height);
  return { width, height, data };
}

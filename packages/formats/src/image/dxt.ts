// S3TC block decoders for DXT1, DXT3 and DXT5 (Direct3D's BC1, BC2 and BC3), following Microsoft's "Block
// Compression" documentation for Direct3D 10/11 (the formats D3D9 calls D3DFMT_DXT1, DXT3 and DXT5). Neuz hands
// these to D3DX, which has no source here, so the layouts below are the public ones:
//
//   colour block (8 bytes)   u16 color0, u16 color1 (RGB565), then 16 two-bit indices, pixel 0 in the low bits,
//                            four pixels (one byte) per row, top row first.
//   DXT1 = colour block. color0 > color1: four colours, the endpoints and the thirds between them
//          (2*c0+c1)/3 and (c0+2*c1)/3. Otherwise (including equal): three colours, the endpoints and their
//          midpoint (c0+c1)/2, and index 3 is transparent black.
//   DXT3 = 8 bytes of explicit alpha (16 nibbles, pixel 0 in the low nibble of byte 0) + colour block. The colour
//          block always uses the four-colour mode, whatever the order of its endpoints.
//   DXT5 = u8 alpha0, u8 alpha1, 16 three-bit alpha indices (48 bits, pixel 0 in the low bits) + colour block.
//          alpha0 > alpha1: eight alphas, the endpoints and six steps ((7-k)*a0 + k*a1)/7. Otherwise: the
//          endpoints, four steps ((5-k)*a0 + k*a1)/5, then 0 and 255.
//
// Interpolation is on the 8-bit channels (RGB565 expanded by bit replication first) and rounds down.

import type { RgbaImage } from './types';

export type DxtKind = 'DXT1' | 'DXT3' | 'DXT5';

/** Bytes per 4x4 block of each format. */
export const DXT_BLOCK_BYTES: Record<DxtKind, number> = { DXT1: 8, DXT3: 16, DXT5: 16 };

/** Writes a decoded 4x4 block as RGBA pixels at `dst[dstAt + y * rowStride + x * 4]`. */
type BlockWriter = (src: Uint8Array, at: number, dst: Uint8Array, dstAt: number, rowStride: number) => void;

/** The four colours of the current colour block, RGBA each. One shared scratch: decoding is synchronous. */
const palette = new Uint8Array(16);
/** The eight alphas of the current DXT5 block. */
const alphas = new Uint8Array(8);

/** Expands RGB565 into palette[at..at+3] (alpha 255). Channels widen by bit replication, so 31 -> 255 and 63 -> 255. */
function setEndpoint(color: number, at: number): void {
  const r = color >> 11;
  const g = (color >> 5) & 63;
  const b = color & 31;
  palette[at] = (r << 3) | (r >> 2);
  palette[at + 1] = (g << 2) | (g >> 4);
  palette[at + 2] = (b << 3) | (b >> 2);
  palette[at + 3] = 255;
}

/** Fills `palette` from the two endpoints at src[at], src[at + 2]; `oneBitAlpha` is DXT1's three-colour mode switch. */
function fillPalette(src: Uint8Array, at: number, oneBitAlpha: boolean): void {
  const color0 = src[at] | (src[at + 1] << 8);
  const color1 = src[at + 2] | (src[at + 3] << 8);
  setEndpoint(color0, 0);
  setEndpoint(color1, 4);
  if (oneBitAlpha && color0 <= color1) {
    for (let c = 0; c < 3; c++) {
      palette[8 + c] = (palette[c] + palette[4 + c]) >> 1;
    }
    palette[11] = 255;
    palette[12] = palette[13] = palette[14] = palette[15] = 0;
  } else {
    for (let c = 0; c < 3; c++) {
      palette[8 + c] = ((2 * palette[c] + palette[4 + c]) / 3) | 0;
      palette[12 + c] = ((palette[c] + 2 * palette[4 + c]) / 3) | 0;
    }
    palette[11] = palette[15] = 255;
  }
}

/** Writes the colour of a block's 16 pixels from `palette`, using the indices at src[at + 4 .. at + 7]. */
function writeColors(src: Uint8Array, at: number, dst: Uint8Array, dstAt: number, rowStride: number, withAlpha: boolean): void {
  for (let y = 0; y < 4; y++) {
    const indices = src[at + 4 + y];
    let o = dstAt + y * rowStride;
    for (let x = 0; x < 4; x++, o += 4) {
      const p = ((indices >> (2 * x)) & 3) * 4;
      dst[o] = palette[p];
      dst[o + 1] = palette[p + 1];
      dst[o + 2] = palette[p + 2];
      if (withAlpha) dst[o + 3] = palette[p + 3];
    }
  }
}

const writeDxt1: BlockWriter = (src, at, dst, dstAt, rowStride) => {
  fillPalette(src, at, true);
  writeColors(src, at, dst, dstAt, rowStride, true);
};

const writeDxt3: BlockWriter = (src, at, dst, dstAt, rowStride) => {
  fillPalette(src, at + 8, false);
  writeColors(src, at + 8, dst, dstAt, rowStride, false);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const byte = src[at + y * 2 + (x >> 1)];
      dst[dstAt + y * rowStride + x * 4 + 3] = (x & 1 ? byte >> 4 : byte & 15) * 17;
    }
  }
};

const writeDxt5: BlockWriter = (src, at, dst, dstAt, rowStride) => {
  fillPalette(src, at + 8, false);
  writeColors(src, at + 8, dst, dstAt, rowStride, false);

  const alpha0 = src[at];
  const alpha1 = src[at + 1];
  alphas[0] = alpha0;
  alphas[1] = alpha1;
  if (alpha0 > alpha1) {
    for (let k = 1; k <= 6; k++) alphas[1 + k] = (((7 - k) * alpha0 + k * alpha1) / 7) | 0;
  } else {
    for (let k = 1; k <= 4; k++) alphas[1 + k] = (((5 - k) * alpha0 + k * alpha1) / 5) | 0;
    alphas[6] = 0;
    alphas[7] = 255;
  }
  // 48 bits of indices as two 24-bit halves: pixels 0-7, then pixels 8-15.
  const low = src[at + 2] | (src[at + 3] << 8) | (src[at + 4] << 16);
  const high = src[at + 5] | (src[at + 6] << 8) | (src[at + 7] << 16);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const i = y * 4 + x;
      const index = i < 8 ? (low >> (3 * i)) & 7 : (high >> (3 * (i - 8))) & 7;
      dst[dstAt + y * rowStride + x * 4 + 3] = alphas[index];
    }
  }
};

const WRITERS: Record<DxtKind, BlockWriter> = { DXT1: writeDxt1, DXT3: writeDxt3, DXT5: writeDxt5 };

function decodeBlock(kind: DxtKind, block: Uint8Array): Uint8Array {
  if (block.length !== DXT_BLOCK_BYTES[kind]) {
    throw new RangeError(`a ${kind} block is ${DXT_BLOCK_BYTES[kind]} bytes, got ${block.length}`);
  }
  const out = new Uint8Array(64);
  WRITERS[kind](block, 0, out, 0, 16);
  return out;
}

/** Decodes one 8-byte DXT1 block into 16 RGBA pixels (64 bytes, row by row). */
export const decodeDxt1 = (block: Uint8Array): Uint8Array => decodeBlock('DXT1', block);
/** Decodes one 16-byte DXT3 block into 16 RGBA pixels (64 bytes, row by row). */
export const decodeDxt3 = (block: Uint8Array): Uint8Array => decodeBlock('DXT3', block);
/** Decodes one 16-byte DXT5 block into 16 RGBA pixels (64 bytes, row by row). */
export const decodeDxt5 = (block: Uint8Array): Uint8Array => decodeBlock('DXT5', block);

/**
 * Decodes one mip level of `width` x `height` pixels stored as rows of 4x4 blocks from `src[offset]` on. A level
 * whose size is not a multiple of 4 has partial blocks at the right and bottom edges; their hidden pixels are
 * dropped. The caller has checked that `src` holds the whole level.
 */
export function decodeDxtLevel(kind: DxtKind, src: Uint8Array, offset: number, width: number, height: number): RgbaImage {
  const write = WRITERS[kind];
  const blockBytes = DXT_BLOCK_BYTES[kind];
  const data = new Uint8Array(width * height * 4);
  const rowStride = width * 4;
  const blocksX = Math.ceil(width / 4);
  const blocksY = Math.ceil(height / 4);
  const edge = new Uint8Array(64);

  let at = offset;
  for (let by = 0; by < blocksY; by++) {
    const y0 = by * 4;
    for (let bx = 0; bx < blocksX; bx++, at += blockBytes) {
      const x0 = bx * 4;
      if (x0 + 4 <= width && y0 + 4 <= height) {
        write(src, at, data, y0 * rowStride + x0 * 4, rowStride);
        continue;
      }
      write(src, at, edge, 0, 16);
      const visibleX = Math.min(4, width - x0);
      const visibleY = Math.min(4, height - y0);
      for (let y = 0; y < visibleY; y++) {
        const from = y * 16;
        data.set(edge.subarray(from, from + visibleX * 4), (y0 + y) * rowStride + x0 * 4);
      }
    }
  }
  return { width, height, data };
}

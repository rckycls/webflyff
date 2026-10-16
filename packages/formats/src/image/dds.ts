// DirectDraw Surface texture (`.dds`), following Microsoft's "Programming Guide for DDS" (the DDS_HEADER and
// DDS_PIXELFORMAT structures). Neuz reads these through D3DX (LoadTextureFromRes, Source/_Common/vutil.cpp:192,
// which calls D3DXCreateTextureFromFileInMemoryEx), and D3DX has no source here, so this follows the public layout:
//
//   u32 magic "DDS " (0x20534444)
//   DDS_HEADER, 124 bytes:
//     u32 size (124), u32 flags, u32 height, u32 width, u32 pitchOrLinearSize, u32 depth, u32 mipMapCount,
//     u32 reserved1[11],
//     DDS_PIXELFORMAT, 32 bytes: u32 size (32), u32 flags, char fourCC[4], u32 rgbBitCount,
//                                u32 rMask, u32 gMask, u32 bMask, u32 aMask
//     u32 caps, u32 caps2, u32 caps3, u32 caps4, u32 reserved2
//   pixel data: one block per face (a cube map stores the faces its caps2 flags, in the order +X -X +Y -Y +Z -Z),
//     and in it each mip level, largest first. DXT levels are rows of 4x4 blocks (at least one block per level);
//     uncompressed levels are tightly packed rows with no padding.
//
// Only the top mip level of the first face is decoded. The rest of the chain is accounted for, though: the declared
// mip count (header flag DDSD_MIPMAPCOUNT, else one level) and the faces have to add up to exactly the bytes after
// the header, so a truncated file or one with unknown trailing bytes is a FormatError. Every shipped file fits that
// to the byte. Volume textures are refused (none are shipped).
//
// Uncompressed formats are recognised by their bit count and channel masks, not by their flags (shipped files agree
// on both), and only the layouts listed in RAW_FORMATS are decoded.

import { BinaryReader } from '../binary/BinaryReader';
import { DXT_BLOCK_BYTES, decodeDxtLevel } from './dxt';
import type { DxtKind } from './dxt';
import type { RgbaImage } from './types';

const READER = 'readDds';
const SPEC = 'Microsoft Programming Guide for DDS (DDS_HEADER, DDS_PIXELFORMAT)';

const MAGIC = 0x20534444; // "DDS "
const HEADER_SIZE = 124;
const PIXEL_FORMAT_SIZE = 32;
/** Where DDS_PIXELFORMAT starts, counting the magic. */
const PIXEL_FORMAT_OFFSET = 76;

const DDSD_MIPMAPCOUNT = 0x20000;
const DDPF_FOURCC = 0x4;
const DDPF_RGB = 0x40;
const DDSCAPS2_CUBEMAP = 0x200;
/** DDSCAPS2_CUBEMAP_POSITIVEX .. NEGATIVEZ: one flag per stored face. */
const DDSCAPS2_CUBEMAP_FACES = 0xfc00;
const DDSCAPS2_VOLUME = 0x200000;

type Masks = readonly [r: number, g: number, b: number, a: number];

interface RawFormat {
  name: string;
  bits: number;
  masks: Masks;
  /** Writes the RGBA pixel stored at `src[from]` to `dst[to]`. */
  convert(src: Uint8Array, from: number, dst: Uint8Array, to: number): void;
}

const RAW_FORMATS: readonly RawFormat[] = [
  {
    name: 'A8R8G8B8',
    bits: 32,
    masks: [0x00ff0000, 0x0000ff00, 0x000000ff, 0xff000000],
    convert(src, from, dst, to) {
      dst[to] = src[from + 2];
      dst[to + 1] = src[from + 1];
      dst[to + 2] = src[from];
      dst[to + 3] = src[from + 3];
    },
  },
  {
    name: 'X8R8G8B8',
    bits: 32,
    masks: [0x00ff0000, 0x0000ff00, 0x000000ff, 0],
    convert(src, from, dst, to) {
      dst[to] = src[from + 2];
      dst[to + 1] = src[from + 1];
      dst[to + 2] = src[from];
      dst[to + 3] = 255;
    },
  },
  {
    name: 'R8G8B8',
    bits: 24,
    masks: [0x00ff0000, 0x0000ff00, 0x000000ff, 0],
    convert(src, from, dst, to) {
      dst[to] = src[from + 2];
      dst[to + 1] = src[from + 1];
      dst[to + 2] = src[from];
      dst[to + 3] = 255;
    },
  },
  {
    name: 'R5G6B5',
    bits: 16,
    masks: [0xf800, 0x07e0, 0x001f, 0],
    convert(src, from, dst, to) {
      const v = src[from] | (src[from + 1] << 8);
      const r = v >> 11;
      const g = (v >> 5) & 63;
      const b = v & 31;
      dst[to] = (r << 3) | (r >> 2);
      dst[to + 1] = (g << 2) | (g >> 4);
      dst[to + 2] = (b << 3) | (b >> 2);
      dst[to + 3] = 255;
    },
  },
  {
    name: 'A1R5G5B5',
    bits: 16,
    masks: [0x7c00, 0x03e0, 0x001f, 0x8000],
    convert(src, from, dst, to) {
      const v = src[from] | (src[from + 1] << 8);
      const r = (v >> 10) & 31;
      const g = (v >> 5) & 31;
      const b = v & 31;
      dst[to] = (r << 3) | (r >> 2);
      dst[to + 1] = (g << 3) | (g >> 2);
      dst[to + 2] = (b << 3) | (b >> 2);
      dst[to + 3] = v & 0x8000 ? 255 : 0;
    },
  },
  {
    name: 'A4R4G4B4',
    bits: 16,
    masks: [0x0f00, 0x00f0, 0x000f, 0xf000],
    convert(src, from, dst, to) {
      const v = src[from] | (src[from + 1] << 8);
      dst[to] = ((v >> 8) & 15) * 17;
      dst[to + 1] = ((v >> 4) & 15) * 17;
      dst[to + 2] = (v & 15) * 17;
      dst[to + 3] = (v >> 12) * 17;
    },
  },
];

/** How the levels of a file are stored: DXT blocks or plain pixels. */
type Layout = { kind: 'dxt'; name: DxtKind } | { kind: 'raw'; format: RawFormat };

export interface DdsImage {
  /** `DXT1`, `DXT3`, `DXT5`, or the name of the uncompressed layout (`A8R8G8B8`, `R5G6B5`, ...). */
  format: string;
  /** Mip levels the header declares (1 when it declares none). */
  mipCount: number;
  /** The top level (of the first face, for a cube map). */
  image: RgbaImage;
}

const hex32 = (v: number): string => `0x${v.toString(16).padStart(8, '0')}`;

const describeMasks = (bits: number, [r, g, b, a]: Masks): string =>
  `${bits}-bit, masks R ${hex32(r)} G ${hex32(g)} B ${hex32(b)} A ${hex32(a)}`;

/** A FourCC as text when it is printable ASCII, else as hex. */
function fourCCText(code: number): string {
  const chars = [code & 255, (code >>> 8) & 255, (code >>> 16) & 255, code >>> 24];
  return chars.every((c) => c >= 0x20 && c < 0x7f) ? String.fromCharCode(...chars) : hex32(code);
}

const countBits = (v: number): number => {
  let n = 0;
  for (let rest = v; rest !== 0; rest &= rest - 1) n++;
  return n;
};

/** How many levels a width x height texture can have (down to 1x1). */
function maxMipLevels(width: number, height: number): number {
  let levels = 1;
  for (let size = Math.max(width, height); size > 1; size = Math.floor(size / 2)) levels++;
  return levels;
}

function levelBytes(layout: Layout, width: number, height: number): number {
  return layout.kind === 'dxt'
    ? Math.ceil(width / 4) * Math.ceil(height / 4) * DXT_BLOCK_BYTES[layout.name]
    : width * height * (layout.format.bits / 8);
}

/** Bytes of `levels` levels, the largest being width x height. */
function chainBytes(layout: Layout, width: number, height: number, levels: number): number {
  let total = 0;
  for (let level = 0, w = width, h = height; level < levels; level++) {
    total += levelBytes(layout, w, h);
    w = Math.max(1, Math.floor(w / 2));
    h = Math.max(1, Math.floor(h / 2));
  }
  return total;
}

function decodeRawLevel(format: RawFormat, src: Uint8Array, offset: number, width: number, height: number): RgbaImage {
  const data = new Uint8Array(width * height * 4);
  const step = format.bits / 8;
  for (let from = offset, to = 0; to < data.length; from += step, to += 4) {
    format.convert(src, from, data, to);
  }
  return { width, height, data };
}

/** Reads a `.dds` file; see the top of this file for what is decoded and what is checked. */
export function readDds(bytes: Uint8Array, file: string): DdsImage {
  const r = new BinaryReader(bytes, { file, reader: READER, cppRef: SPEC });
  const failAt = (offset: number, message: string): never => {
    r.offset = offset;
    return r.fail(message);
  };

  if (r.u32() !== MAGIC) failAt(0, 'not a DDS file: it does not start with "DDS "');
  const headerSize = r.u32();
  if (headerSize !== HEADER_SIZE) failAt(4, `DDS_HEADER size is ${headerSize}, expected ${HEADER_SIZE}`);
  const flags = r.u32();
  const height = r.u32();
  const width = r.u32();
  r.skip(8); // pitchOrLinearSize, depth: the layout follows from the format and size
  const declaredMips = r.u32();
  r.skip(44); // reserved1[11]
  const pixelFormatSize = r.u32();
  if (pixelFormatSize !== PIXEL_FORMAT_SIZE) {
    failAt(PIXEL_FORMAT_OFFSET, `DDS_PIXELFORMAT size is ${pixelFormatSize}, expected ${PIXEL_FORMAT_SIZE}`);
  }
  const pixelFormatFlags = r.u32();
  const fourCC = r.u32();
  const bits = r.u32();
  const masks: Masks = [r.u32(), r.u32(), r.u32(), r.u32()];
  r.skip(4); // caps
  const caps2 = r.u32();
  r.skip(12); // caps3, caps4, reserved2

  if (width === 0) failAt(16, 'width is 0');
  if (height === 0) failAt(12, 'height is 0');
  if (caps2 & DDSCAPS2_VOLUME) failAt(112, 'volume textures are not supported');

  let layout: Layout;
  if (pixelFormatFlags & DDPF_FOURCC) {
    const name = fourCCText(fourCC);
    if (name !== 'DXT1' && name !== 'DXT3' && name !== 'DXT5') {
      return failAt(PIXEL_FORMAT_OFFSET + 8, `unsupported FourCC "${name}"${name === 'DX10' ? ' (DX10 extended header)' : ''}`);
    }
    layout = { kind: 'dxt', name };
  } else {
    const format =
      pixelFormatFlags & DDPF_RGB
        ? RAW_FORMATS.find((f) => f.bits === bits && f.masks.every((mask, i) => mask === masks[i]))
        : undefined;
    if (format === undefined) {
      return failAt(
        PIXEL_FORMAT_OFFSET + 4,
        `unsupported pixel format (flags ${hex32(pixelFormatFlags)}, ${describeMasks(bits, masks)})`,
      );
    }
    layout = { kind: 'raw', format };
  }
  const formatName = layout.kind === 'dxt' ? layout.name : layout.format.name;

  const levels = flags & DDSD_MIPMAPCOUNT ? Math.max(1, declaredMips) : 1;
  const possibleLevels = maxMipLevels(width, height);
  if (levels > possibleLevels) {
    failAt(28, `${levels} mip levels declared, but a ${width}x${height} texture has at most ${possibleLevels}`);
  }

  let faces = 1;
  if (caps2 & DDSCAPS2_CUBEMAP) {
    faces = countBits(caps2 & DDSCAPS2_CUBEMAP_FACES);
    if (faces === 0) failAt(112, 'cube map without any face');
  }

  const total = faces * chainBytes(layout, width, height, levels);
  if (total > r.remaining()) {
    const what = `${faces > 1 ? `${faces} cube map faces of ` : ''}${levels} mip ${levels === 1 ? 'level' : 'levels'}`;
    r.fail(`the ${what} of a ${width}x${height} ${formatName} texture needs ${total} bytes but only ${r.remaining()} remain`);
  }

  const image =
    layout.kind === 'dxt'
      ? decodeDxtLevel(layout.name, bytes, r.offset, width, height)
      : decodeRawLevel(layout.format, bytes, r.offset, width, height);
  r.skip(total);
  r.expectEnd();
  return { format: formatName, mipCount: levels, image };
}

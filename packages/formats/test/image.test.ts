import { describe, expect, it } from 'vitest';
import {
  FormatError,
  decodeDxt1,
  decodeDxt3,
  decodeDxt5,
  decodeImage,
  readBmp,
  readDds,
  readTga,
} from '../src/index';
import { Bytes } from './helpers/bytes';
import { thrown } from './helpers/thrown';

type Rgba = [number, number, number, number];

/** The four bytes of pixel `i` (row-major) of a decoded block or image. */
const pixel = (data: Uint8Array, i: number): Rgba =>
  [data[i * 4], data[i * 4 + 1], data[i * 4 + 2], data[i * 4 + 3]];

const allPixels = (data: Uint8Array): Rgba[] => Array.from({ length: data.length / 4 }, (_, i) => pixel(data, i));

const RED: Rgba = [255, 0, 0, 255];
const GREEN: Rgba = [0, 255, 0, 255];
const BLUE: Rgba = [0, 0, 255, 255];
const WHITE: Rgba = [255, 255, 255, 255];

// ---- DXT blocks -------------------------------------------------------------------------------------------------

const RGB565_RED = 0xf800;
const RGB565_BLUE = 0x001f;

/** An 8-byte BC1 colour block: two RGB565 endpoints, then 16 two-bit indices (pixel 0 in the low bits). */
function colorBlock(color0: number, color1: number, indices: number[] | number): Uint8Array {
  const list = typeof indices === 'number' ? new Array<number>(16).fill(indices) : indices;
  let bits = 0;
  list.forEach((index, i) => {
    bits |= index << (2 * i);
  });
  return new Bytes().u16(color0).u16(color1).u32(bits >>> 0).build();
}

/** Packs 8 three-bit indices into 3 bytes, pixel 0 in the low bits. */
const packIndices3 = (indices: number[]): number[] => {
  const bits = indices.reduce((acc, index, i) => acc | (index << (3 * i)), 0);
  return [bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff];
};

describe('DXT1 (BC1) blocks', () => {
  it('DXT1 solid block', () => {
    const out = decodeDxt1(colorBlock(RGB565_RED, RGB565_BLUE, 0));
    expect(out).toHaveLength(64);
    expect(allPixels(out)).toEqual(new Array(16).fill(RED));
  });

  it('DXT1 4-colour mode (color0 > color1) interpolates the two thirds between the endpoints', () => {
    const out = decodeDxt1(colorBlock(RGB565_RED, RGB565_BLUE, [0, 1, 2, 3, ...new Array<number>(12).fill(0)]));
    expect(pixel(out, 0)).toEqual(RED);
    expect(pixel(out, 1)).toEqual(BLUE);
    expect(pixel(out, 2)).toEqual([170, 0, 85, 255]);
    expect(pixel(out, 3)).toEqual([85, 0, 170, 255]);
  });

  it('DXT1 1-bit alpha', () => {
    // color0 <= color1 selects 3-colour mode, where index 3 is transparent black.
    const out = decodeDxt1(colorBlock(RGB565_BLUE, RGB565_RED, 3));
    expect(allPixels(out)).toEqual(new Array(16).fill([0, 0, 0, 0]));
  });

  it('DXT1 3-colour mode puts the midpoint at index 2', () => {
    const out = decodeDxt1(colorBlock(RGB565_BLUE, RGB565_RED, [0, 1, 2, 3, ...new Array<number>(12).fill(0)]));
    expect(pixel(out, 0)).toEqual(BLUE);
    expect(pixel(out, 1)).toEqual(RED);
    expect(pixel(out, 2)).toEqual([127, 0, 127, 255]);
    expect(pixel(out, 3)).toEqual([0, 0, 0, 0]);
  });

  it('DXT1 equal endpoints also select 3-colour mode', () => {
    expect(pixel(decodeDxt1(colorBlock(RGB565_RED, RGB565_RED, 3)), 0)).toEqual([0, 0, 0, 0]);
  });

  it('DXT1 expands 5- and 6-bit channels by bit replication', () => {
    // r = 16 (5 bits), g = 32 (6 bits), b = 16 (5 bits): (16 << 3) | (16 >> 2) = 132 and (32 << 2) | (32 >> 4) = 130.
    expect(pixel(decodeDxt1(colorBlock(0x8410, 0x0000, 0)), 0)).toEqual([132, 130, 132, 255]);
    expect(pixel(decodeDxt1(colorBlock(0xffff, 0x0000, 0)), 0)).toEqual(WHITE);
  });

  it('DXT1 reads each pixel from its own two bits, row by row', () => {
    const indices = Array.from({ length: 16 }, (_, i) => (i % 2 === 0 ? 0 : 1));
    const out = decodeDxt1(colorBlock(RGB565_RED, RGB565_BLUE, indices));
    expect(allPixels(out)).toEqual(indices.map((i) => (i === 0 ? RED : BLUE)));
  });
});

describe('DXT3 (BC2) blocks', () => {
  /** A 16-byte BC2 block: 16 four-bit alphas (pixel 0 in the low nibble of byte 0), then a colour block. */
  const dxt3 = (alphas: number[], color: Uint8Array): Uint8Array => {
    const bytes = new Uint8Array(16);
    alphas.forEach((a, i) => {
      bytes[i >> 1] |= a << ((i & 1) * 4);
    });
    bytes.set(color, 8);
    return bytes;
  };

  it('DXT3 stores explicit 4-bit alpha, scaled to 8 bits', () => {
    const alphas = Array.from({ length: 16 }, (_, i) => i);
    const out = decodeDxt3(dxt3(alphas, colorBlock(RGB565_RED, RGB565_BLUE, 0)));
    expect(out).toHaveLength(64);
    expect(alphas.map((_, i) => out[i * 4 + 3])).toEqual(alphas.map((a) => a * 17));
    expect(pixel(out, 7).slice(0, 3)).toEqual([255, 0, 0]);
  });

  it('DXT3 always uses the 4-colour mode, whatever the endpoint order', () => {
    const out = decodeDxt3(dxt3(new Array<number>(16).fill(15), colorBlock(RGB565_BLUE, RGB565_RED, 3)));
    expect(pixel(out, 0)).toEqual([170, 0, 85, 255]);
  });
});

describe('DXT5 (BC3) blocks', () => {
  /** A 16-byte BC3 block: two alpha endpoints, 16 three-bit indices, then a colour block. */
  const dxt5 = (alpha0: number, alpha1: number, indices: number[], color: Uint8Array): Uint8Array => {
    const bytes = new Uint8Array(16);
    bytes[0] = alpha0;
    bytes[1] = alpha1;
    bytes.set([...packIndices3(indices.slice(0, 8)), ...packIndices3(indices.slice(8))], 2);
    bytes.set(color, 8);
    return bytes;
  };
  const eight = [0, 1, 2, 3, 4, 5, 6, 7];
  const solid = colorBlock(RGB565_RED, RGB565_BLUE, 0);

  it('DXT5 with alpha0 > alpha1 interpolates six alphas between them', () => {
    const out = decodeDxt5(dxt5(255, 0, [...eight, ...eight.toReversed()], solid));
    expect(out).toHaveLength(64);
    const expected = [255, 0, 218, 182, 145, 109, 72, 36];
    expect(eight.map((i) => out[i * 4 + 3])).toEqual(expected);
    expect(eight.map((i) => out[(8 + i) * 4 + 3])).toEqual(expected.toReversed());
    expect(pixel(out, 0).slice(0, 3)).toEqual([255, 0, 0]);
  });

  it('DXT5 with alpha0 <= alpha1 interpolates four alphas and adds 0 and 255', () => {
    const out = decodeDxt5(dxt5(10, 200, [...eight, ...eight], solid));
    expect(eight.map((i) => out[i * 4 + 3])).toEqual([10, 200, 48, 86, 124, 162, 0, 255]);
  });

  it('DXT5 alpha0 == alpha1 takes the 4-alpha branch too', () => {
    const out = decodeDxt5(dxt5(77, 77, [...eight, ...eight], solid));
    expect(eight.map((i) => out[i * 4 + 3])).toEqual([77, 77, 77, 77, 77, 77, 0, 255]);
  });
});

describe('DXT block decoders reject a block of the wrong size', () => {
  it.each([
    ['decodeDxt1', decodeDxt1, 8],
    ['decodeDxt3', decodeDxt3, 16],
    ['decodeDxt5', decodeDxt5, 16],
  ] as const)('%s needs %i bytes', (_name, decode, size) => {
    expect(() => decode(new Uint8Array(size - 1))).toThrow(RangeError);
    expect(() => decode(new Uint8Array(size))).not.toThrow();
  });
});

// ---- DDS --------------------------------------------------------------------------------------------------------

const DDSD_BASE = 0x1007; // CAPS | HEIGHT | WIDTH | PIXELFORMAT
const DDSD_MIPMAPCOUNT = 0x20000;
const DDPF_ALPHAPIXELS = 0x1;
const DDPF_FOURCC = 0x4;
const DDPF_RGB = 0x40;
const CUBEMAP_ALL_FACES = 0x200 | 0xfc00;

interface DdsSpec {
  width: number;
  height: number;
  /** Header dwMipMapCount; the DDSD_MIPMAPCOUNT flag is set when this is given. */
  mips?: number;
  fourCC?: string;
  pfFlags?: number;
  bitCount?: number;
  masks?: [r: number, g: number, b: number, a: number];
  caps2?: number;
  /** Everything after the 128-byte header. */
  pixels: Uint8Array;
}

function ddsBytes(s: DdsSpec): Uint8Array {
  const fourCC = s.fourCC ?? '';
  const [r, g, b, a] = s.masks ?? [0, 0, 0, 0];
  const b4 = new Bytes();
  b4.u32(0x20534444) // "DDS "
    .u32(124)
    .u32(DDSD_BASE | (s.mips === undefined ? 0 : DDSD_MIPMAPCOUNT))
    .u32(s.height)
    .u32(s.width)
    .u32(0) // pitch or linear size: ignored
    .u32(0) // depth
    .u32(s.mips ?? 0)
    .zeros(44) // dwReserved1[11]
    .u32(32) // DDS_PIXELFORMAT.dwSize
    .u32(s.pfFlags ?? (fourCC ? DDPF_FOURCC : DDPF_RGB));
  for (let i = 0; i < 4; i++) b4.u8(i < fourCC.length ? fourCC.charCodeAt(i) : 0);
  b4.u32(s.bitCount ?? 0).u32(r).u32(g).u32(b).u32(a);
  b4.u32(0x1000) // dwCaps: DDSCAPS_TEXTURE
    .u32(s.caps2 ?? 0)
    .zeros(12) // caps3, caps4, reserved2
    .raw(s.pixels);
  return b4.build();
}

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

const solidDxt1 = (c0: number): Uint8Array => colorBlock(c0, 0, 0);

describe('readDds compressed formats', () => {
  it('decodes a 4x4 DXT1 texture and reports its format', () => {
    const dds = readDds(ddsBytes({ width: 4, height: 4, fourCC: 'DXT1', pixels: solidDxt1(RGB565_RED) }), 'a.dds');
    expect(dds.format).toBe('DXT1');
    expect(dds.mipCount).toBe(1);
    expect(dds.image.width).toBe(4);
    expect(dds.image.height).toBe(4);
    expect(allPixels(dds.image.data)).toEqual(new Array(16).fill(RED));
  });

  it('puts each block at its own place in the image', () => {
    const blocks = concat(solidDxt1(RGB565_RED), solidDxt1(0x07e0), solidDxt1(RGB565_BLUE), solidDxt1(0xffff));
    const { image } = readDds(ddsBytes({ width: 8, height: 8, fourCC: 'DXT1', pixels: blocks }), 'a.dds');
    const at = (x: number, y: number): Rgba => pixel(image.data, y * 8 + x);
    expect(at(0, 0)).toEqual(RED);
    expect(at(3, 3)).toEqual(RED);
    expect(at(4, 0)).toEqual(GREEN);
    expect(at(7, 3)).toEqual(GREEN);
    expect(at(0, 4)).toEqual(BLUE);
    expect(at(3, 7)).toEqual(BLUE);
    expect(at(4, 4)).toEqual(WHITE);
    expect(at(7, 7)).toEqual(WHITE);
  });

  it('clips edge blocks when the size is not a multiple of 4', () => {
    const { image } = readDds(
      ddsBytes({ width: 5, height: 3, fourCC: 'DXT1', pixels: concat(solidDxt1(RGB565_RED), solidDxt1(0x07e0)) }),
      'a.dds',
    );
    expect(image.width).toBe(5);
    expect(image.height).toBe(3);
    expect(image.data).toHaveLength(5 * 3 * 4);
    expect(allPixels(image.data)).toEqual([
      ...[RED, RED, RED, RED, GREEN],
      ...[RED, RED, RED, RED, GREEN],
      ...[RED, RED, RED, RED, GREEN],
    ]);
  });

  it('decodes a 1x1 texture from its single block', () => {
    const { image } = readDds(ddsBytes({ width: 1, height: 1, fourCC: 'DXT1', pixels: solidDxt1(RGB565_BLUE) }), 'a.dds');
    expect(image.data).toEqual(new Uint8Array(BLUE));
  });

  it('decodes DXT3 and DXT5 textures', () => {
    const block3 = new Uint8Array(16);
    block3.fill(0x88, 0, 8); // every alpha nibble 8 -> 136
    block3.set(solidDxt1(RGB565_RED), 8);
    const dxt3 = readDds(ddsBytes({ width: 4, height: 4, fourCC: 'DXT3', pixels: block3 }), 'a.dds');
    expect(dxt3.format).toBe('DXT3');
    expect(pixel(dxt3.image.data, 5)).toEqual([255, 0, 0, 136]);

    const block5 = new Uint8Array(16);
    block5[0] = 90;
    block5[1] = 90; // both alphas 90, every index 0
    block5.set(solidDxt1(RGB565_BLUE), 8);
    const dxt5 = readDds(ddsBytes({ width: 4, height: 4, fourCC: 'DXT5', pixels: block5 }), 'a.dds');
    expect(dxt5.format).toBe('DXT5');
    expect(pixel(dxt5.image.data, 9)).toEqual([0, 0, 255, 90]);
  });

  it('ignores the bit-count field of a FourCC format (238 shipped DXT3 files hold 256 there)', () => {
    const bytes = ddsBytes({ width: 4, height: 4, fourCC: 'DXT3', bitCount: 256, pixels: new Uint8Array(16) });
    expect(readDds(bytes, 'a.dds').format).toBe('DXT3');
  });
});

describe('readDds mip chains', () => {
  // 8x8 DXT1: levels 8x8 (4 blocks), 4x4, 2x2, 1x1 (1 block each) = 7 blocks.
  const chain = (blocks: number): Uint8Array => new Uint8Array(blocks * 8);

  it('decodes only the top level and reports the declared mip count', () => {
    const top = concat(solidDxt1(RGB565_RED), solidDxt1(RGB565_RED), solidDxt1(RGB565_RED), solidDxt1(RGB565_RED));
    const dds = readDds(ddsBytes({ width: 8, height: 8, mips: 4, fourCC: 'DXT1', pixels: concat(top, chain(3)) }), 'a.dds');
    expect(dds.mipCount).toBe(4);
    expect(dds.image.width).toBe(8);
    expect(allPixels(dds.image.data)).toEqual(new Array(64).fill(RED));
  });

  it('treats a header without the mip-count flag as one level', () => {
    const dds = readDds(ddsBytes({ width: 4, height: 4, fourCC: 'DXT1', pixels: solidDxt1(RGB565_RED) }), 'a.dds');
    expect(dds.mipCount).toBe(1);
  });

  it('treats a mip count of 0 with the flag set as one level', () => {
    const dds = readDds(ddsBytes({ width: 4, height: 4, mips: 0, fourCC: 'DXT1', pixels: solidDxt1(RGB565_RED) }), 'a.dds');
    expect(dds.mipCount).toBe(1);
  });

  it('fails when the file ends before the declared mip chain does', () => {
    // 4 levels declared (7 blocks) but only the 4 blocks of the top level are present.
    const error = thrown(() =>
      readDds(ddsBytes({ width: 8, height: 8, mips: 4, fourCC: 'DXT1', pixels: chain(4) }), 'short.dds'),
    );
    expect(error.file).toBe('short.dds');
    expect(error.message).toMatch(/mip/);
    expect(error.message).toMatch(/56/); // bytes the chain needs
  });

  it('fails when the declared mip count is more than the size allows', () => {
    const error = thrown(() =>
      readDds(ddsBytes({ width: 8, height: 8, mips: 5, fourCC: 'DXT1', pixels: new Uint8Array(8 * 8) }), 'a.dds'),
    );
    expect(error.message).toMatch(/at most 4/);
  });

  it('fails when a huge declared mip count cannot fit in the file', () => {
    const error = thrown(() =>
      readDds(ddsBytes({ width: 8, height: 8, mips: 0xffffffff, fourCC: 'DXT1', pixels: chain(4) }), 'a.dds'),
    );
    expect(error.message).toMatch(/mip/);
  });

  it('fails on bytes after the mip chain', () => {
    const error = thrown(() => readDds(ddsBytes({ width: 4, height: 4, fourCC: 'DXT1', pixels: chain(2) }), 'a.dds'));
    expect(error.message).toMatch(/8 bytes left/);
  });
});

describe('readDds cube maps and volumes', () => {
  const faces = (count: number): Uint8Array =>
    concat(...Array.from({ length: count }, (_, i) => solidDxt1([RGB565_RED, 0x07e0, RGB565_BLUE, 0xffff, 0x8410, 0x0400][i])));

  it('decodes the first face of a cube map and checks all six faces are in the file', () => {
    const dds = readDds(ddsBytes({ width: 4, height: 4, fourCC: 'DXT1', caps2: CUBEMAP_ALL_FACES, pixels: faces(6) }), 'env.dds');
    expect(allPixels(dds.image.data)).toEqual(new Array(16).fill(RED));
  });

  it('gives every face of a cube map its own mip chain', () => {
    // 8x8 with 4 levels = 4 + 1 + 1 + 1 blocks per face.
    const colors = [RGB565_RED, 0x07e0, RGB565_BLUE, 0xffff, 0x8410, 0x0400];
    const top = (c0: number): Uint8Array => concat(solidDxt1(c0), solidDxt1(c0), solidDxt1(c0), solidDxt1(c0));
    const spec = { width: 8, height: 8, mips: 4, fourCC: 'DXT1', caps2: CUBEMAP_ALL_FACES };
    const full = concat(...colors.map((c) => concat(top(c), new Uint8Array(3 * 8))));
    const dds = readDds(ddsBytes({ ...spec, pixels: full }), 'env.dds');
    expect(dds.mipCount).toBe(4);
    expect(allPixels(dds.image.data)).toEqual(new Array(64).fill(RED));

    // Six top levels without the smaller levels of each face is not enough.
    const error = thrown(() => readDds(ddsBytes({ ...spec, pixels: concat(...colors.map(top)) }), 'env.dds'));
    expect(error.message).toMatch(/6 cube map faces of 4 mip levels/);
    expect(error.message).toMatch(/336 bytes/);
  });

  it('rejects a cube map that flags no face', () => {
    const error = thrown(() =>
      readDds(ddsBytes({ width: 4, height: 4, fourCC: 'DXT1', caps2: 0x200, pixels: solidDxt1(RGB565_RED) }), 'env.dds'),
    );
    expect(error.message).toMatch(/face/);
  });

  it('fails when a cube map is missing a face', () => {
    const error = thrown(() =>
      readDds(ddsBytes({ width: 4, height: 4, fourCC: 'DXT1', caps2: CUBEMAP_ALL_FACES, pixels: faces(5) }), 'env.dds'),
    );
    expect(error.message).toMatch(/face/);
  });

  it('accepts a cube map that stores fewer faces than six, as the header declares', () => {
    const caps2 = 0x200 | 0x400 | 0x800; // +X and -X only
    const dds = readDds(ddsBytes({ width: 4, height: 4, fourCC: 'DXT1', caps2, pixels: faces(2) }), 'env.dds');
    expect(pixel(dds.image.data, 0)).toEqual(RED);
  });

  it('rejects volume textures', () => {
    const error = thrown(() =>
      readDds(ddsBytes({ width: 4, height: 4, fourCC: 'DXT1', caps2: 0x200000, pixels: solidDxt1(RGB565_RED) }), 'vol.dds'),
    );
    expect(error.message).toMatch(/volume/i);
  });
});

describe('readDds uncompressed formats', () => {
  const rgb = (bitCount: number, masks: [number, number, number, number], pfFlags = DDPF_RGB) => ({
    bitCount,
    masks,
    pfFlags,
  });
  const u16s = (...values: number[]): Uint8Array => {
    const b = new Bytes();
    for (const v of values) b.u16(v);
    return b.build();
  };

  it('A8R8G8B8: bytes are B, G, R, A', () => {
    const pixels = new Uint8Array([3, 2, 1, 4, 30, 20, 10, 40]);
    const dds = readDds(
      ddsBytes({ width: 2, height: 1, pixels, ...rgb(32, [0xff0000, 0xff00, 0xff, 0xff000000], DDPF_RGB | DDPF_ALPHAPIXELS) }),
      'a.dds',
    );
    expect(dds.format).toBe('A8R8G8B8');
    expect(allPixels(dds.image.data)).toEqual([[1, 2, 3, 4], [10, 20, 30, 40]]);
  });

  it('X8R8G8B8: alpha is opaque whatever the unused byte holds', () => {
    const pixels = new Uint8Array([3, 2, 1, 0, 30, 20, 10, 99]);
    const dds = readDds(ddsBytes({ width: 2, height: 1, pixels, ...rgb(32, [0xff0000, 0xff00, 0xff, 0]) }), 'a.dds');
    expect(dds.format).toBe('X8R8G8B8');
    expect(allPixels(dds.image.data)).toEqual([[1, 2, 3, 255], [10, 20, 30, 255]]);
  });

  it('R8G8B8: three bytes B, G, R with no row padding', () => {
    const pixels = new Uint8Array([3, 2, 1, 30, 20, 10, 6, 5, 4]);
    const dds = readDds(ddsBytes({ width: 3, height: 1, pixels, ...rgb(24, [0xff0000, 0xff00, 0xff, 0]) }), 'a.dds');
    expect(dds.format).toBe('R8G8B8');
    expect(allPixels(dds.image.data)).toEqual([[1, 2, 3, 255], [10, 20, 30, 255], [4, 5, 6, 255]]);
  });

  it('R5G6B5', () => {
    const pixels = u16s(0xf81f, 0x07e0, 0x0000, 0x8410);
    const dds = readDds(ddsBytes({ width: 2, height: 2, pixels, ...rgb(16, [0xf800, 0x07e0, 0x001f, 0]) }), 'a.dds');
    expect(dds.format).toBe('R5G6B5');
    expect(allPixels(dds.image.data)).toEqual([[255, 0, 255, 255], GREEN, [0, 0, 0, 255], [132, 130, 132, 255]]);
  });

  it('A1R5G5B5: the top bit is a 1-bit alpha', () => {
    const pixels = u16s(0xfc00, 0x7c00, 0x83e0, 0x801f);
    const dds = readDds(
      ddsBytes({ width: 4, height: 1, pixels, ...rgb(16, [0x7c00, 0x03e0, 0x001f, 0x8000], DDPF_RGB | DDPF_ALPHAPIXELS) }),
      'a.dds',
    );
    expect(dds.format).toBe('A1R5G5B5');
    expect(allPixels(dds.image.data)).toEqual([RED, [255, 0, 0, 0], GREEN, BLUE]);
  });

  it('A4R4G4B4', () => {
    const pixels = u16s(0x8f00, 0xf0f0, 0x000f);
    const dds = readDds(
      ddsBytes({ width: 3, height: 1, pixels, ...rgb(16, [0x0f00, 0x00f0, 0x000f, 0xf000], DDPF_RGB | DDPF_ALPHAPIXELS) }),
      'a.dds',
    );
    expect(dds.format).toBe('A4R4G4B4');
    expect(allPixels(dds.image.data)).toEqual([[255, 0, 0, 136], GREEN, [0, 0, 255, 0]]);
  });

  it('reads the top level of an uncompressed mip chain and checks the whole chain is there', () => {
    // 2x2 R5G6B5 with 2 levels: 4 + 1 pixels = 10 bytes.
    const top = u16s(0xf800, 0xf800, 0xf800, 0xf800);
    const spec = { width: 2, height: 2, mips: 2, ...rgb(16, [0xf800, 0x07e0, 0x001f, 0]) };
    const dds = readDds(ddsBytes({ ...spec, pixels: concat(top, u16s(0)) }), 'a.dds');
    expect(dds.mipCount).toBe(2);
    expect(allPixels(dds.image.data)).toEqual(new Array(4).fill(RED));
    expect(() => readDds(ddsBytes({ ...spec, pixels: top }), 'a.dds')).toThrow(FormatError);
  });
});

describe('readDds rejects what it cannot decode', () => {
  it('names an unsupported FourCC', () => {
    const error = thrown(() => readDds(ddsBytes({ width: 4, height: 4, fourCC: 'DXT2', pixels: new Uint8Array(16) }), 'x.dds'));
    expect(error.message).toMatch(/DXT2/);
    expect(error.file).toBe('x.dds');
  });

  it('names the DX10 extended header', () => {
    const error = thrown(() => readDds(ddsBytes({ width: 4, height: 4, fourCC: 'DX10', pixels: new Uint8Array(32) }), 'x.dds'));
    expect(error.message).toMatch(/DX10/);
  });

  it('names the bit count and masks of an unsupported uncompressed format', () => {
    // 8-bit luminance: DDPF_LUMINANCE (0x20000), red mask 0xff.
    const error = thrown(() =>
      readDds(ddsBytes({ width: 2, height: 2, pfFlags: 0x20000, bitCount: 8, masks: [0xff, 0, 0, 0], pixels: new Uint8Array(4) }), 'l8.dds'),
    );
    expect(error.message).toMatch(/8-bit/);
    expect(error.message).toMatch(/0x000000ff/);
  });

  it('names masks that are a known bit count in an unknown layout (X1R5G5B5)', () => {
    const error = thrown(() =>
      readDds(ddsBytes({ width: 2, height: 1, bitCount: 16, masks: [0x7c00, 0x03e0, 0x001f, 0], pixels: new Uint8Array(4) }), 'a.dds'),
    );
    expect(error.message).toMatch(/0x00007c00/);
  });

  it('rejects a wrong magic', () => {
    const bytes = ddsBytes({ width: 4, height: 4, fourCC: 'DXT1', pixels: solidDxt1(0) });
    bytes[0] = 0x41;
    const error = thrown(() => readDds(bytes, 'a.dds'));
    expect(error.offset).toBe(0);
    expect(error.message).toMatch(/DDS/);
  });

  it('rejects a header size other than 124', () => {
    const bytes = ddsBytes({ width: 4, height: 4, fourCC: 'DXT1', pixels: solidDxt1(0) });
    bytes[4] = 100;
    expect(thrown(() => readDds(bytes, 'a.dds')).offset).toBe(4);
  });

  it('rejects a zero width or height', () => {
    expect(() => readDds(ddsBytes({ width: 0, height: 4, fourCC: 'DXT1', pixels: new Uint8Array(0) }), 'a.dds')).toThrow(FormatError);
    expect(() => readDds(ddsBytes({ width: 4, height: 0, fourCC: 'DXT1', pixels: new Uint8Array(0) }), 'a.dds')).toThrow(FormatError);
  });

  it('rejects a file shorter than the header', () => {
    expect(() => readDds(ddsBytes({ width: 4, height: 4, fourCC: 'DXT1', pixels: new Uint8Array(0) }).subarray(0, 100), 'a.dds')).toThrow(FormatError);
  });

  it('rejects a huge size without allocating for it', () => {
    const error = thrown(() => readDds(ddsBytes({ width: 0xffffffff, height: 0xffffffff, fourCC: 'DXT1', pixels: new Uint8Array(8) }), 'a.dds'));
    expect(error.message).toMatch(/truncated|need/);
  });
});

// ---- TGA --------------------------------------------------------------------------------------------------------

interface TgaSpec {
  type?: number;
  width: number;
  height: number;
  depth?: number;
  descriptor?: number;
  id?: Uint8Array;
  colorMap?: { entries: number; entryBits: number; data: Uint8Array };
  body: Uint8Array | number[];
  footer?: { extensionOffset?: number; developerOffset?: number };
}

function tgaBytes(s: TgaSpec): Uint8Array {
  const b = new Bytes()
    .u8(s.id?.length ?? 0)
    .u8(s.colorMap ? 1 : 0)
    .u8(s.type ?? 2)
    .u16(0) // colour map first entry
    .u16(s.colorMap?.entries ?? 0)
    .u8(s.colorMap?.entryBits ?? 0)
    .u16(0)
    .u16(0)
    .u16(s.width)
    .u16(s.height)
    .u8(s.depth ?? 24)
    .u8(s.descriptor ?? 0);
  if (s.id) b.raw(s.id);
  if (s.colorMap) b.raw(s.colorMap.data);
  b.raw(Uint8Array.from(s.body));
  if (s.footer) {
    b.u32(s.footer.extensionOffset ?? 0).u32(s.footer.developerOffset ?? 0);
    for (const c of 'TRUEVISION-XFILE.') b.u8(c.charCodeAt(0));
    b.u8(0);
  }
  return b.build();
}

// Pixels are stored B, G, R (and A).
const BGR_RED = [0, 0, 255];
const BGR_GREEN = [0, 255, 0];
const BGR_BLUE = [255, 0, 0];

describe('readTga', () => {
  it('TGA bottom-left origin is flipped', () => {
    // 1x2: the first stored row is the bottom row (red), the second the top row (green).
    const image = readTga(tgaBytes({ width: 1, height: 2, body: [...BGR_RED, ...BGR_GREEN] }), 'a.tga');
    expect(image.width).toBe(1);
    expect(image.height).toBe(2);
    expect(Array.from(image.data.subarray(0, 4))).toEqual(GREEN);
    expect(Array.from(image.data.subarray(4, 8))).toEqual(RED);
  });

  it('keeps row order for a top-left origin (descriptor bit 5)', () => {
    const image = readTga(tgaBytes({ width: 1, height: 2, descriptor: 0x20, body: [...BGR_RED, ...BGR_GREEN] }), 'a.tga');
    expect(allPixels(image.data)).toEqual([RED, GREEN]);
  });

  it('mirrors columns for a right-to-left origin (descriptor bit 4)', () => {
    const image = readTga(tgaBytes({ width: 2, height: 1, descriptor: 0x30, body: [...BGR_RED, ...BGR_GREEN] }), 'a.tga');
    expect(allPixels(image.data)).toEqual([GREEN, RED]);
  });

  it('flips both ways for a bottom-right origin', () => {
    const body = [...BGR_RED, ...BGR_GREEN, ...BGR_BLUE, 255, 255, 255];
    const image = readTga(tgaBytes({ width: 2, height: 2, descriptor: 0x10, body }), 'a.tga');
    expect(allPixels(image.data)).toEqual([WHITE, BLUE, GREEN, RED]);
  });

  it('converts 24-bit BGR to RGBA with full alpha', () => {
    const image = readTga(tgaBytes({ width: 2, height: 1, descriptor: 0x20, body: [3, 2, 1, 6, 5, 4] }), 'a.tga');
    expect(allPixels(image.data)).toEqual([[1, 2, 3, 255], [4, 5, 6, 255]]);
  });

  it('reads the alpha byte of a 32-bit image that declares attribute bits', () => {
    const image = readTga(tgaBytes({ width: 2, height: 1, depth: 32, descriptor: 0x28, body: [3, 2, 1, 40, 6, 5, 4, 0] }), 'a.tga');
    expect(allPixels(image.data)).toEqual([[1, 2, 3, 40], [4, 5, 6, 0]]);
  });

  it('treats a 32-bit image that declares no attribute bits as opaque', () => {
    const image = readTga(tgaBytes({ width: 1, height: 1, depth: 32, descriptor: 0x20, body: [3, 2, 1, 0] }), 'a.tga');
    expect(allPixels(image.data)).toEqual([[1, 2, 3, 255]]);
  });

  it('skips the image ID and an unused colour map', () => {
    const image = readTga(
      tgaBytes({
        width: 1,
        height: 1,
        descriptor: 0x20,
        id: new Uint8Array([9, 9, 9]),
        colorMap: { entries: 2, entryBits: 24, data: new Uint8Array(6).fill(7) },
        body: [3, 2, 1],
      }),
      'a.tga',
    );
    expect(allPixels(image.data)).toEqual([[1, 2, 3, 255]]);
  });

  it('accepts the TGA 2.0 footer', () => {
    const image = readTga(tgaBytes({ width: 1, height: 1, body: BGR_RED, footer: {} }), 'a.tga');
    expect(allPixels(image.data)).toEqual([RED]);
  });

  it('rejects a footer that points at an extension or developer area', () => {
    for (const footer of [{ extensionOffset: 100 }, { developerOffset: 100 }]) {
      const error = thrown(() => readTga(tgaBytes({ width: 1, height: 1, body: BGR_RED, footer }), 'a.tga'));
      expect(error.message).toMatch(/extension|developer/);
    }
  });

  describe('run-length encoding (type 10)', () => {
    it('decodes run and raw packets as one pixel stream, across rows', () => {
      // 3x2, top-left origin. Run of 4 reds (header 0x80 | 3), then a raw packet of 2 pixels (header 1).
      const body = [0x83, ...BGR_RED, 0x01, ...BGR_GREEN, ...BGR_BLUE];
      const image = readTga(tgaBytes({ type: 10, width: 3, height: 2, descriptor: 0x20, body }), 'a.tga');
      expect(allPixels(image.data)).toEqual([RED, RED, RED, RED, GREEN, BLUE]);
    });

    it('flips a bottom-left RLE image', () => {
      const body = [0x00, ...BGR_RED, 0x00, ...BGR_GREEN]; // two single-pixel runs: bottom row red, top row green
      const image = readTga(tgaBytes({ type: 10, width: 1, height: 2, body }), 'a.tga');
      expect(allPixels(image.data)).toEqual([GREEN, RED]);
    });

    it('decodes 32-bit RLE with alpha', () => {
      const body = [0x81, 3, 2, 1, 50];
      const image = readTga(tgaBytes({ type: 10, width: 2, height: 1, depth: 32, descriptor: 0x28, body }), 'a.tga');
      expect(allPixels(image.data)).toEqual([[1, 2, 3, 50], [1, 2, 3, 50]]);
    });

    it('fails when a packet runs past the end of the image', () => {
      const body = [0x83, ...BGR_RED]; // 4 pixels for a 2x1 image
      const error = thrown(() => readTga(tgaBytes({ type: 10, width: 2, height: 1, body }), 'a.tga'));
      expect(error.message).toMatch(/packet/);
    });

    it('fails when the data ends before the image is complete', () => {
      const body = [0x00, ...BGR_RED]; // 1 of 4 pixels
      expect(() => readTga(tgaBytes({ type: 10, width: 2, height: 2, body }), 'a.tga')).toThrow(FormatError);
    });

    it('fails on bytes after the last pixel', () => {
      const body = [0x00, ...BGR_RED, 0x00];
      const error = thrown(() => readTga(tgaBytes({ type: 10, width: 1, height: 1, body }), 'a.tga'));
      expect(error.message).toMatch(/1 byte left/);
    });

    it('fails early on dimensions that no amount of packets in the file could fill', () => {
      const error = thrown(() => readTga(tgaBytes({ type: 10, width: 65535, height: 65535, body: [0x00, ...BGR_RED] }), 'a.tga'));
      expect(error.message).toMatch(/too short/);
    });
  });

  describe('rejects what it cannot decode', () => {
    it('names an unsupported image type', () => {
      for (const [type, name] of [
        [1, /colour-mapped/],
        [3, /grayscale/],
        [0, /no image data/],
        [9, /colour-mapped/],
        [11, /grayscale/],
        [7, /type 7/],
      ] as const) {
        const error = thrown(() => readTga(tgaBytes({ type, width: 1, height: 1, body: BGR_RED }), 'a.tga'));
        expect(error.message).toMatch(name);
        expect(error.offset).toBe(2);
      }
    });

    it('rejects a colour map type other than 0 and 1', () => {
      const bytes = tgaBytes({ width: 1, height: 1, body: BGR_RED });
      bytes[1] = 2;
      expect(thrown(() => readTga(bytes, 'a.tga')).offset).toBe(1);
    });

    it('names an unsupported pixel depth', () => {
      for (const depth of [8, 15, 16]) {
        const error = thrown(() => readTga(tgaBytes({ width: 1, height: 1, depth, body: [0, 0, 0, 0] }), 'a.tga'));
        expect(error.message).toMatch(new RegExp(`${depth}-bit`));
      }
    });

    it('rejects a zero width or height', () => {
      expect(() => readTga(tgaBytes({ width: 0, height: 1, body: [] }), 'a.tga')).toThrow(FormatError);
      expect(() => readTga(tgaBytes({ width: 1, height: 0, body: [] }), 'a.tga')).toThrow(FormatError);
    });

    it('fails on truncated pixel data', () => {
      expect(() => readTga(tgaBytes({ width: 2, height: 2, body: [0, 0, 0, 0, 0, 0] }), 'a.tga')).toThrow(FormatError);
    });

    it('fails on bytes after the pixel data', () => {
      const error = thrown(() => readTga(tgaBytes({ width: 1, height: 1, body: [...BGR_RED, 0, 0] }), 'a.tga'));
      expect(error.message).toMatch(/2 bytes left/);
    });

    it('fails on a file shorter than the header', () => {
      expect(() => readTga(new Uint8Array(10), 'a.tga')).toThrow(FormatError);
    });
  });
});

// ---- BMP --------------------------------------------------------------------------------------------------------

interface BmpSpec {
  width: number;
  /** Negative for a top-down bitmap. */
  height: number;
  bitCount?: number;
  compression?: number;
  headerSize?: number;
  /** Bytes between the info header and the pixel array. */
  gap?: number;
  pixels: Uint8Array | number[];
}

function bmpBytes(s: BmpSpec): Uint8Array {
  const gap = s.gap ?? 0;
  const pixels = Uint8Array.from(s.pixels);
  const offBits = 14 + 40 + gap;
  return new Bytes()
    .u8(0x42)
    .u8(0x4d) // "BM"
    .u32(offBits + pixels.length)
    .u32(0) // reserved
    .u32(offBits)
    .u32(s.headerSize ?? 40)
    .i32(s.width)
    .i32(s.height)
    .u16(1) // planes
    .u16(s.bitCount ?? 24)
    .u32(s.compression ?? 0)
    .u32(pixels.length)
    .i32(0)
    .i32(0)
    .u32(0)
    .u32(0)
    .zeros(gap)
    .raw(pixels)
    .build();
}

describe('readBmp', () => {
  it('flips a bottom-up 24-bit bitmap and skips the row padding', () => {
    // 2x2: a row is 6 bytes, padded to 8. Stored bottom row first.
    const pixels = [...BGR_RED, ...BGR_GREEN, 0, 0, ...BGR_BLUE, 255, 255, 255, 0, 0];
    const image = readBmp(bmpBytes({ width: 2, height: 2, pixels }), 'a.bmp');
    expect(image.width).toBe(2);
    expect(image.height).toBe(2);
    expect(allPixels(image.data)).toEqual([BLUE, WHITE, RED, GREEN]);
  });

  it('keeps row order for a top-down bitmap (negative height)', () => {
    const pixels = [...BGR_RED, ...BGR_GREEN, 0, 0, ...BGR_BLUE, 255, 255, 255, 0, 0];
    const image = readBmp(bmpBytes({ width: 2, height: -2, pixels }), 'a.bmp');
    expect(image.height).toBe(2);
    expect(allPixels(image.data)).toEqual([RED, GREEN, BLUE, WHITE]);
  });

  it('pads a 3-pixel row from 9 to 12 bytes', () => {
    const pixels = [...BGR_RED, ...BGR_GREEN, ...BGR_BLUE, 0, 0, 0];
    const image = readBmp(bmpBytes({ width: 3, height: 1, pixels }), 'a.bmp');
    expect(allPixels(image.data)).toEqual([RED, GREEN, BLUE]);
  });

  it('reads 32-bit pixels as B, G, R plus an unused byte, so alpha is opaque', () => {
    const image = readBmp(bmpBytes({ width: 2, height: 1, bitCount: 32, pixels: [3, 2, 1, 0, 6, 5, 4, 77] }), 'a.bmp');
    expect(allPixels(image.data)).toEqual([[1, 2, 3, 255], [4, 5, 6, 255]]);
  });

  it('starts the pixel array at the offset in the file header', () => {
    const image = readBmp(bmpBytes({ width: 1, height: 1, gap: 8, pixels: [...BGR_RED, 0] }), 'a.bmp');
    expect(allPixels(image.data)).toEqual([RED]);
  });

  describe('rejects what it cannot decode', () => {
    const good = (): Uint8Array => bmpBytes({ width: 1, height: 1, pixels: [...BGR_RED, 0] });

    it('rejects a missing BM signature', () => {
      const bytes = good();
      bytes[0] = 0x58;
      expect(thrown(() => readBmp(bytes, 'a.bmp')).offset).toBe(0);
    });

    it('names an unsupported bit depth', () => {
      const error = thrown(() => readBmp(bmpBytes({ width: 1, height: 1, bitCount: 8, pixels: [0, 0, 0, 0] }), 'a.bmp'));
      expect(error.message).toMatch(/8-bit/);
    });

    it('names an unsupported compression', () => {
      const error = thrown(() => readBmp(bmpBytes({ width: 1, height: 1, bitCount: 32, compression: 3, pixels: [0, 0, 0, 0] }), 'a.bmp'));
      expect(error.message).toMatch(/compression 3/);
    });

    it('names an unsupported info header', () => {
      const error = thrown(() => readBmp(bmpBytes({ width: 1, height: 1, headerSize: 12, pixels: [0, 0, 0, 0] }), 'a.bmp'));
      expect(error.message).toMatch(/12/);
    });

    it('rejects a zero or negative width and a zero height', () => {
      expect(() => readBmp(bmpBytes({ width: 0, height: 1, pixels: [] }), 'a.bmp')).toThrow(FormatError);
      expect(() => readBmp(bmpBytes({ width: -1, height: 1, pixels: [0, 0, 0, 0] }), 'a.bmp')).toThrow(FormatError);
      expect(() => readBmp(bmpBytes({ width: 1, height: 0, pixels: [] }), 'a.bmp')).toThrow(FormatError);
    });

    it('fails on truncated pixel data', () => {
      expect(() => readBmp(bmpBytes({ width: 2, height: 2, pixels: new Uint8Array(10) }), 'a.bmp')).toThrow(FormatError);
    });

    it('fails on bytes after the pixel array', () => {
      const error = thrown(() => readBmp(bmpBytes({ width: 1, height: 1, pixels: [...BGR_RED, 0, 0, 0] }), 'a.bmp'));
      expect(error.message).toMatch(/2 bytes left/);
    });

    it('fails on a pixel array offset inside the headers', () => {
      const bytes = good();
      bytes[10] = 20;
      expect(() => readBmp(bytes, 'a.bmp')).toThrow(FormatError);
    });

    it('fails on a file shorter than the headers', () => {
      expect(() => readBmp(good().subarray(0, 30), 'a.bmp')).toThrow(FormatError);
    });
  });
});

// ---- decodeImage ------------------------------------------------------------------------------------------------

describe('decoders on a view into a larger buffer (as file reads give them)', () => {
  const inside = (bytes: Uint8Array): Uint8Array => {
    const buffer = new Uint8Array(bytes.length + 7);
    buffer.fill(0xee);
    buffer.set(bytes, 3);
    return buffer.subarray(3, 3 + bytes.length);
  };

  it('reads DDS, TGA (with its footer) and BMP from an offset view', () => {
    const dds = ddsBytes({ width: 4, height: 4, fourCC: 'DXT5', pixels: new Uint8Array(16) });
    expect(readDds(inside(dds), 'a.dds')).toEqual(readDds(dds, 'a.dds'));
    const tga = tgaBytes({ width: 2, height: 1, body: [...BGR_RED, ...BGR_GREEN], footer: {} });
    expect(readTga(inside(tga), 'a.tga')).toEqual(readTga(tga, 'a.tga'));
    const rle = tgaBytes({ type: 10, width: 2, height: 1, body: [0x81, ...BGR_BLUE], footer: {} });
    expect(readTga(inside(rle), 'a.tga')).toEqual(readTga(rle, 'a.tga'));
    const bmp = bmpBytes({ width: 1, height: 1, pixels: [...BGR_RED, 0] });
    expect(readBmp(inside(bmp), 'a.bmp')).toEqual(readBmp(bmp, 'a.bmp'));
  });
});

describe('decodeImage', () => {
  const dds = ddsBytes({ width: 4, height: 4, fourCC: 'DXT1', pixels: solidDxt1(RGB565_RED) });
  const tga = tgaBytes({ width: 1, height: 1, body: BGR_RED });
  const bmp = bmpBytes({ width: 1, height: 1, pixels: [...BGR_RED, 0] });

  it('picks the decoder by extension, whatever its case', () => {
    expect(decodeImage(dds, 'Model/TextureMid/a.dds').width).toBe(4);
    expect(decodeImage(dds, 'Model/TextureMid/A.DDS').width).toBe(4);
    expect(decodeImage(tga, 'b.tga').data).toEqual(new Uint8Array(RED));
    expect(decodeImage(tga, 'b.TGA').data).toEqual(new Uint8Array(RED));
    expect(decodeImage(bmp, 'c.bmp').data).toEqual(new Uint8Array(RED));
    expect(decodeImage(bmp, 'c.Bmp').data).toEqual(new Uint8Array(RED));
  });

  it('uses the last extension of a path with dots and backslashes', () => {
    expect(decodeImage(dds, 'C:\\a.b\\tex.v2.dds').width).toBe(4);
  });

  it('passes the file name on to the decoder\'s errors', () => {
    expect(thrown(() => decodeImage(new Uint8Array(4), 'bad.dds')).file).toBe('bad.dds');
  });

  it('rejects an extension it has no decoder for', () => {
    const error = thrown(() => decodeImage(dds, 'a.png'));
    expect(error.file).toBe('a.png');
    expect(error.message).toMatch(/\.png/);
    expect(() => decodeImage(dds, 'noextension')).toThrow(FormatError);
  });
});

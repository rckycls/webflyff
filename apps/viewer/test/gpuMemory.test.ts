import {
  BufferAttribute,
  BufferGeometry,
  CompressedTexture,
  DataTexture,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  RGBAFormat,
  RGBA_ASTC_4x4_Format,
  RGBA_BPTC_Format,
  RGBA_ETC2_EAC_Format,
  RGBA_S3TC_DXT1_Format,
  RGBA_S3TC_DXT5_Format,
  RGB_ETC1_Format,
  RGB_ETC2_Format,
  RGB_S3TC_DXT1_Format,
  UnsignedByteType,
} from 'three';
import { describe, expect, it } from 'vitest';
import { geometryBytes, gpuFormatName, textureBytes, textureGpuBytes } from '../src/overlay/gpuMemory';

describe('textureBytes', () => {
  it('counts a mipmapped rgba8 texture as 4/3 of its base level, floored', () => {
    expect(textureBytes(256, 256, 'rgba8', true)).toBe(349525);
  });

  it('counts bc1 at half a byte per pixel, unmipmapped', () => {
    expect(textureBytes(256, 256, 'bc1', false)).toBe(32768);
  });

  it('uses 4 bytes for rgba8, 0.5 for the rgb block formats and 1 for the rgba ones', () => {
    const bytes = (format: Parameters<typeof textureBytes>[2]): number => textureBytes(64, 64, format, false);
    expect(bytes('rgba8')).toBe(16384);
    for (const format of ['bc1', 'etc1', 'etc2-rgb'] as const) expect(bytes(format)).toBe(2048);
    for (const format of ['bc3', 'bc7', 'etc2-rgba', 'astc4x4'] as const) expect(bytes(format)).toBe(4096);
  });

  it('floors an odd result', () => {
    // 3 x 3 at 0.5 byte per pixel is 4.5; mipmapped it is 6
    expect(textureBytes(3, 3, 'bc1', false)).toBe(4);
    expect(textureBytes(3, 3, 'bc1', true)).toBe(6);
  });
});

describe('gpuFormatName', () => {
  it('names the formats the transcoder can pick', () => {
    expect(gpuFormatName(RGBAFormat)).toBe('rgba8');
    expect(gpuFormatName(RGB_S3TC_DXT1_Format)).toBe('bc1');
    expect(gpuFormatName(RGB_ETC1_Format)).toBe('etc1');
    expect(gpuFormatName(RGB_ETC2_Format)).toBe('etc2-rgb');
    expect(gpuFormatName(RGBA_S3TC_DXT5_Format)).toBe('bc3');
    expect(gpuFormatName(RGBA_BPTC_Format)).toBe('bc7');
    expect(gpuFormatName(RGBA_ETC2_EAC_Format)).toBe('etc2-rgba');
    expect(gpuFormatName(RGBA_ASTC_4x4_Format)).toBe('astc4x4');
  });

  it('names the bc1 variant KTX2Loader actually emits for ETC1S textures', () => {
    expect(gpuFormatName(RGBA_S3TC_DXT1_Format)).toBe('bc1');
  });

  it('takes anything else for the worst case, rgba8', () => {
    expect(gpuFormatName(-1)).toBe('rgba8');
    expect(gpuFormatName(123456)).toBe('rgba8');
  });
});

describe('geometryBytes', () => {
  it('sums the attribute and index arrays', () => {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array(9), 3)); // 36
    g.setAttribute('uv', new BufferAttribute(new Float32Array(6), 2)); // 24
    g.setIndex(new BufferAttribute(new Uint16Array(3), 1)); // 6
    expect(geometryBytes(g)).toBe(66);
  });

  it('counts an interleaved array once however many attributes share it', () => {
    const g = new BufferGeometry();
    const buffer = new InterleavedBuffer(new Float32Array(10), 5); // 40 bytes
    g.setAttribute('position', new InterleavedBufferAttribute(buffer, 3, 0));
    g.setAttribute('uv', new InterleavedBufferAttribute(buffer, 2, 3));
    expect(geometryBytes(g)).toBe(40);
  });

  it('is zero for an empty geometry', () => {
    expect(geometryBytes(new BufferGeometry())).toBe(0);
  });
});

describe('textureGpuBytes', () => {
  it('uses the format the texture was uploaded in', () => {
    const astc = new CompressedTexture([{ data: new Uint8Array(4096), width: 64, height: 64 }], 64, 64, RGBA_ASTC_4x4_Format);
    expect(textureGpuBytes(astc)).toBe(4096);

    const etc2 = new CompressedTexture([{ data: new Uint8Array(2048), width: 64, height: 64 }], 64, 64, RGB_ETC2_Format);
    expect(textureGpuBytes(etc2)).toBe(2048);
  });

  it('adds a third for a texture with a mipmap chain', () => {
    const mips = [64, 32, 16, 8, 4, 2, 1].map((s) => ({ data: new Uint8Array(1), width: s, height: s }));
    const chain = new CompressedTexture(mips, 64, 64, RGBA_BPTC_Format);
    expect(textureGpuBytes(chain)).toBe(Math.floor((64 * 64 * 4) / 3));
  });

  it('counts a data texture as rgba8, mipmapped only when it generates mipmaps', () => {
    const flat = new DataTexture(new Uint8Array(16 * 16 * 4), 16, 16, RGBAFormat, UnsignedByteType);
    expect(textureGpuBytes(flat)).toBe(16 * 16 * 4);
    flat.generateMipmaps = true;
    expect(textureGpuBytes(flat)).toBe(Math.floor((16 * 16 * 4 * 4) / 3));
  });
});

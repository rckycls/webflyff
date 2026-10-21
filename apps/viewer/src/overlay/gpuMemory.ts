// Estimates of what the viewer holds on the GPU. WebGL cannot report it, so the overlay adds up what was uploaded:
// textures by the format the device actually transcoded them to (KTX2Loader picks ASTC, BC, ETC or plain rgba8 per
// device), geometry by its array sizes.

import type { BufferGeometry, Texture } from 'three';
import {
  RGBAFormat,
  RGBA_ASTC_4x4_Format,
  RGBA_BPTC_Format,
  RGBA_ETC2_EAC_Format,
  RGBA_S3TC_DXT1_Format,
  RGBA_S3TC_DXT5_Format,
  RGB_ETC1_Format,
  RGB_ETC2_Format,
  RGB_S3TC_DXT1_Format,
} from 'three';

export type GpuFormat = 'rgba8' | 'bc1' | 'etc1' | 'etc2-rgb' | 'bc3' | 'bc7' | 'etc2-rgba' | 'astc4x4';

const BYTES_PER_PIXEL: Record<GpuFormat, number> = {
  rgba8: 4,
  bc1: 0.5,
  etc1: 0.5,
  'etc2-rgb': 0.5,
  bc3: 1,
  bc7: 1,
  'etc2-rgba': 1,
  astc4x4: 1,
};

/**
 * The size class of a three.js texture format. Anything this does not know counts as `'rgba8'`, the worst case, so the
 * estimate errs high. `RGBA_S3TC_DXT1_Format` is listed with `RGB_S3TC_DXT1_Format` on purpose: it is the bc1 format
 * KTX2Loader hands back for ETC1S textures.
 */
export function gpuFormatName(threeFormat: number): GpuFormat {
  switch (threeFormat) {
    case RGBAFormat:
      return 'rgba8';
    case RGB_S3TC_DXT1_Format:
    case RGBA_S3TC_DXT1_Format:
      return 'bc1';
    case RGB_ETC1_Format:
      return 'etc1';
    case RGB_ETC2_Format:
      return 'etc2-rgb';
    case RGBA_S3TC_DXT5_Format:
      return 'bc3';
    case RGBA_BPTC_Format:
      return 'bc7';
    case RGBA_ETC2_EAC_Format:
      return 'etc2-rgba';
    case RGBA_ASTC_4x4_Format:
      return 'astc4x4';
    default:
      return 'rgba8';
  }
}

/** Bytes of a width x height texture: the format's bytes per pixel, times 4/3 when mipmapped, floored. */
export function textureBytes(width: number, height: number, format: GpuFormat, mipmapped: boolean): number {
  const base = width * height * BYTES_PER_PIXEL[format];
  return Math.floor(mipmapped ? (base * 4) / 3 : base);
}

/** `textureBytes` of an uploaded texture, from its own format, size and mipmaps. */
export function textureGpuBytes(texture: Texture): number {
  const image = texture.image as { width?: number; height?: number } | null | undefined;
  const width = image?.width ?? 0;
  const height = image?.height ?? 0;
  const mipmapped = texture.mipmaps !== undefined && texture.mipmaps.length > 1 ? true : texture.generateMipmaps;
  return textureBytes(width, height, gpuFormatName(texture.format), mipmapped);
}

/** The sum of a geometry's attribute and index array sizes. An array several attributes share is counted once. */
export function geometryBytes(g: BufferGeometry): number {
  const arrays = new Set<ArrayBufferView>();
  for (const attribute of Object.values(g.attributes)) arrays.add(attribute.array as ArrayBufferView);
  if (g.index !== null) arrays.add(g.index.array as ArrayBufferView);
  let total = 0;
  for (const array of arrays) total += array.byteLength;
  return total;
}

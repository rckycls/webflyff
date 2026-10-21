// What the viewer draws in place of a texture that is missing or broken (global constraints: pink checkerboard).

import { DataTexture, RGBAFormat, RepeatWrapping, SRGBColorSpace, UnsignedByteType } from 'three';

const SIZE = 64;
const SQUARE = 8;

let shared: DataTexture | undefined;

/**
 * The shared 64 x 64 checkerboard: magenta (#ff00ff) and black squares of 8 pixels, magenta at the top left. One
 * instance for the whole viewer, so nothing may dispose it (`TextureCache` never does).
 */
export function checkerTexture(): DataTexture {
  if (shared === undefined) {
    const data = new Uint8Array(SIZE * SIZE * 4);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const magenta = (Math.floor(x / SQUARE) + Math.floor(y / SQUARE)) % 2 === 0;
        const at = (y * SIZE + x) * 4;
        data[at] = magenta ? 255 : 0;
        data[at + 2] = magenta ? 255 : 0;
        data[at + 3] = 255;
      }
    }
    const texture = new DataTexture(data, SIZE, SIZE, RGBAFormat, UnsignedByteType);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    shared = texture;
  }
  return shared;
}

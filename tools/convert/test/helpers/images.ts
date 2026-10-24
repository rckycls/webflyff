// Hand-made picture files for the stage tests: tiny DDS, BMP and TGA files with chosen pixels.

/** A DDS file holding one A8R8G8B8 image; `pixels` are [r, g, b, a] in reading order. */
export function dds(width: number, height: number, pixels: number[][]): Uint8Array {
  const out = new Uint8Array(128 + width * height * 4);
  const view = new DataView(out.buffer);
  const u32 = (offset: number, value: number): void => view.setUint32(offset, value, true);
  u32(0, 0x20534444); // "DDS "
  u32(4, 124);
  u32(8, 0x100f); // DDSD_CAPS | HEIGHT | WIDTH | PIXELFORMAT
  u32(12, height);
  u32(16, width);
  u32(20, width * 4);
  u32(76, 32); // DDS_PIXELFORMAT.size
  u32(80, 0x41); // DDPF_RGB | DDPF_ALPHAPIXELS
  u32(88, 32);
  u32(92, 0x00ff0000);
  u32(96, 0x0000ff00);
  u32(100, 0x000000ff);
  u32(104, 0xff000000);
  u32(108, 0x1000); // DDSCAPS_TEXTURE
  pixels.forEach(([r, g, b, a], i) => out.set([b!, g!, r!, a!], 128 + i * 4));
  return out;
}

/** A DDS of one colour. */
export const solidDds = (width: number, height: number, rgba: number[]): Uint8Array =>
  dds(width, height, Array.from({ length: width * height }, () => rgba));

/** A 24-bit BMP; `pixels` are [r, g, b] in reading order (top row first). */
export function bmp24(width: number, height: number, pixels: number[][]): Uint8Array {
  const rowBytes = Math.floor((width * 24 + 31) / 32) * 4;
  const out = new Uint8Array(54 + rowBytes * height);
  const view = new DataView(out.buffer);
  out.set([0x42, 0x4d], 0); // "BM"
  view.setUint32(2, out.length, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true); // positive: the bottom row is stored first
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixels[y * width + x]!;
      out.set([b!, g!, r!], 54 + (height - 1 - y) * rowBytes + x * 3);
    }
  }
  return out;
}

/** A 32-bit TGA, top row first; `pixels` are [r, g, b, a] in reading order. */
export function tga32(width: number, height: number, pixels: number[][]): Uint8Array {
  const out = new Uint8Array(18 + width * height * 4);
  out[2] = 2; // uncompressed true colour
  new DataView(out.buffer).setUint16(12, width, true);
  new DataView(out.buffer).setUint16(14, height, true);
  out[16] = 32;
  out[17] = 0x28; // top row first, 8 attribute bits
  pixels.forEach(([r, g, b, a], i) => out.set([b!, g!, r!, a!], 18 + i * 4));
  return out;
}

export const MAGENTA = [255, 0, 255, 255];

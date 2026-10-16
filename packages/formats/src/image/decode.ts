// Picks the texture decoder for a client file by its extension. Neuz hands every texture to D3DX, which sniffs the
// format from the bytes (LoadTextureFromRes, Source/_Common/vutil.cpp:192); the client's texture folders hold
// `.dds`, `.tga` and `.bmp` files whose names match their contents, so the extension is enough here.

import { FormatError } from '../errors';
import { readBmp } from './bmp';
import { readDds } from './dds';
import { readTga } from './tga';
import type { RgbaImage } from './types';

/** The lower-cased text after the last dot of the file name (not of a folder), or '' when it has none. */
function extensionOf(file: string): string {
  const name = file.slice(Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\')) + 1);
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

/** Decodes a `.dds`, `.tga` or `.bmp` file (any letter case) into RGBA pixels. `file` is used for its extension and in errors. */
export function decodeImage(bytes: Uint8Array, file: string): RgbaImage {
  switch (extensionOf(file)) {
    case 'dds':
      return readDds(bytes, file).image;
    case 'tga':
      return readTga(bytes, file);
    case 'bmp':
      return readBmp(bytes, file);
    default: {
      const ext = extensionOf(file);
      throw new FormatError(
        `no decoder for ${ext === '' ? 'a file without an extension' : `".${ext}" files`} (expected .dds, .tga or .bmp)`,
        {
          file,
          offset: 0,
          reader: 'decodeImage',
          cppRef: 'Source/_Common/vutil.cpp:192 LoadTextureFromRes (D3DXCreateTextureFromFileInMemoryEx)',
        },
      );
    }
  }
}

// The web form of an effect file: what the converter's effects stage writes to `effects/<web name>.json` for each `.sfx`
// the model index names (`readSfx`, sfx/sfx.ts, is the reader), and the browser's effect player reads. It is the
// `SfxFile`'s parts with the three things that name another file made into logical keys of the asset index:
//
//   texture    the part's picture: `textures/sfx/<web name of the file name>.ktx2` (textureKey in the converter), or null
//              for the empty name the C++ draws untextured (CSfxTexture::Tex, sfxbase.cpp:3169, returns NULL for ""), and
//              for a file the converter did not convert (CSfxTexture::AddTex returns NULL for a missing file, :3146-3157)
//   frames     the texture animation: one key per frame, in the order the player picks them by
//   model      a MESH part's `.o3d`: the `models/` key the models stage wrote
//
// The numbers of the keys and of the particle block are the reader's, unchanged. Vectors are in the file's coordinates.

import type { SfxPart } from '../sfx/sfx';

export interface WebEffectPart extends Omit<SfxPart, 'texture'> {
  /**
   * Logical key of the part's texture (`m_strTex`), or of its first frame when it has a texture animation. Null for a
   * part with no texture name, for a MESH part (its `m_strTex` is a model file name: see `model`) and for a texture that
   * was not converted. The player draws a null texture the way Neuz draws an empty one (untextured).
   */
  texture: string | null;
  /**
   * The textures of a texture animation (`texFrame` above 1): the key of `GetTextureName( texture, i )` (sfxbase.cpp:21)
   * for i from 0 to `texFrame - 1`, null for a frame that was not converted. The player picks frame
   * `(texFrame * (frame - firstKey.frame) / texLoop) % texFrame` (CSfxPartBill::Render, sfxbase.cpp:316-322). Empty when
   * there is no animation, and for a part with no texture name or a MESH part.
   */
  frames: (string | null)[];
  /**
   * A MESH part's model (`models/<web name>.glb`, the `.o3d` its `m_strTex` names, which CSfxPartMesh loads through
   * CSfxMeshMng, sfxbase.cpp:3196); null for the other part types and for a model that was not converted.
   */
  model: string | null;
}

export interface WebEffect {
  parts: WebEffectPart[];
}

/** C `atoi` of a short string: optional white space, an optional sign, then digits; 0 when there are none. */
function atoi(text: string): number {
  const match = /^[ \t\n\v\f\r]*([+-]?)(\d*)/.exec(text)!;
  if (match[2] === '') return 0;
  const value = Number(match[2]);
  return match[1] === '-' ? -value : value;
}

/** C `%02d`: at least two characters, zero padded after the sign. */
function format02d(value: number): string {
  const digits = String(Math.abs(value));
  return value < 0 ? `-${digits.padStart(1, '0')}` : digits.padStart(2, '0');
}

/**
 * The file name of frame `index` of a texture animation, copying GetTextureName (Source/_Common/sfxbase.cpp:21-33): the two
 * characters before the (always 4-character) extension are read as a number with `atoi`, `index` is added, and the sum is
 * written back with `%02d` in their place. `GetTextureName("babo03.jpg", 5)` is `babo08.jpg`; `"x-5.dds"` gives `x-1.dds`
 * for 4 and `x00.dds` for 5, since the "-5" is the number -5. Left and Right of a name shorter than the cut are CString's:
 * a count below 0 is 0 and one past the end is the whole string.
 */
export function sfxTextureName(name: string, index: number): string {
  const before = name.slice(0, Math.max(0, name.length - 4)); // strTex.Left( len - 4 )
  const start = atoi(before.slice(Math.max(0, before.length - 2))); // .Right( 2 )
  const prefix = name.slice(0, Math.max(0, name.length - 6)); // strTex.Left( len - 6 )
  const extension = name.slice(Math.max(0, name.length - 4)); // strTex.Right( 4 )
  return prefix + format02d(start + index) + extension;
}

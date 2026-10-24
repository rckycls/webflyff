// The glyph sheets the converter's UI stage describes in `data/uiSheets.json`: two pictures cut into frames by the client's
// texture-pack scripts (CTexturePack::LoadScript, Source/_Common/2DRender.cpp:1559, read by `readTexturePack`). The
// picture of each is a PNG with the script's colour key made transparent, under `ui/`.

import type { PackFrame } from '../inc/texturePack';

export interface WebUiSheet {
  /** Logical key of the picture (`ui/<web name of the file name>.png`). */
  image: string;
  /** The frames in the order the script gives them: the index is the number Neuz draws them by. */
  frames: PackFrame[];
}

export interface WebUiSheets {
  /**
   * `SFX/DmgEffect.inc` (28 frames): glyphs 0-9 the digits on the first row, 10-13 the words MISS! NICE! COMBO! YEAH!, and
   * 14-27 the same on the second row. CDamageNum::Render picks the row with `attribute * 14` (2DRender.cpp:1961).
   */
  damageDigits: WebUiSheet;
  /** `Icon/icon_target.inc` (16 frames): the corner marks around the selected target, each of the four cells in its four flips. */
  targetCorners: WebUiSheet;
}

/** The logical key of the sheets catalog in the asset index. */
export const UI_SHEETS_KEY = 'data/uiSheets.json';

// The UI pictures the HUD draws with: the theme's pieces (Client/Theme/Default) and the icons, which the converter's UI
// stage writes as `ui/*.png` (tools/convert/src/ui/uiStage.ts), found through the asset store; and the colours Neuz gives
// as ARGB, written as CSS.

import { webName } from '@flyffweb/formats';
import type { WebUiSheets } from '@flyffweb/formats';

/** The converted UI pictures, by the logical keys the UI stage writes them under. */
export interface UiArt {
  /** The URL of a picture of the UI stage by its logical key (`ui/<web name>.png`): the asset store's, '' when it lacks it. */
  url(key: string): string;
  /**
   * The glyph sheets of `data/uiSheets.json`; null when they could not be had (the windows draw without them). No window
   * reads them yet: they are kept for the brief's interface (Task 22) until a later task's window does.
   */
  sheets: WebUiSheets | null;
}

/**
 * The logical key of a picture of Client/Theme/Default (`MakePath( DIR_THEME, name )`): `ui/<web name of the file name
 * without its extension>.png`, as the UI stage writes it (`iconKeyOf`, tools/convert/src/output/keys.ts). 2026-11-19: a
 * key that is one already (`ui/...png`, an item's icon) is kept, so an applet can show an item's picture (the Awaken window).
 */
export function themeKey(file: string): string {
  if (/^ui\/[a-z0-9._/-]+\.png$/.test(file)) return file;
  return `ui/${webName(file.replace(/\.[^.]*$/, ''))}.png`;
}

/** A CSS `url()` of a theme picture. */
export function themeUrl(art: UiArt, file: string): string {
  return `url(${JSON.stringify(art.url(themeKey(file)))})`;
}

/** An ARGB colour as CSS, its alpha left out: `rgb(r, g, b)`. */
export function cssRgb(argb: number): string {
  return `rgb(${(argb >>> 16) & 0xff}, ${(argb >>> 8) & 0xff}, ${argb & 0xff})`;
}

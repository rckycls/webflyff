// The theme's tiled pieces of the controls inside a window, laid as Neuz lays them into the window's surface: the nine
// edit tiles of a text or edit control (WndEditTile00 to 08) and the strip of a tab control (WndTabTile00 to 05, its
// chosen tab WndTabTile10 to 15). The Character window draws both; milestone 2's skill window uses them too.
//
//   CWndBase::AdditionalSkinTexture     _Interface/WndBase.cpp:2524-2619     the nine edit tiles, every 8 px
//   CWndTabCtrl::AdditionalSkinTexture  _Interface/WndControl.cpp:4296-4458  the strip of tabs
//   CWndTabCtrl::OnDraw                 WndControl.cpp:4183-4285             the chosen tab over the strip

import { themeUrl } from './art';
import type { UiArt } from './art';

/** `EDIT_HEIGHT` (WndBase.cpp:2575, WndControl.cpp:22): the edit tiles are laid every 8 px both ways. */
export const EDIT = 8;
/** WndEditTile*.tga: 8 x 10, the next row laid over the last 2 px of each but the last. */
const EDIT_TILE_HEIGHT = 10;
/** WndTabTile*.bmp: 8 x 20. */
export const TAB_TILE = 8;
export const TAB_TILE_HEIGHT = 20;

/**
 * A rectangle `columns` by `rows` edit tiles of 8 px filled with the nine pieces of WndEditTile00 to 08, as
 * `CWndBase::AdditionalSkinTexture` lays them (WndBase.cpp:2575-2620): the corners and edges round the middle, each picture
 * 8 x 10 laid every 8 px, so that each row but the last is the top 8 px of its pictures (the next row covers the rest)
 * and the last is all 10. The middle and edge pieces are the same down their height, so a run of them is the picture
 * repeated. Its element goes at the control's top left. `tile` is the control's picture in resdata.inc, whose nine pieces
 * are its name less its last 6 characters, the piece's number in two digits and its extension (`strTile.Left( len - 6 )`,
 * `"%s%02d%s"`, WndBase.cpp:2555-2557): "WndEditTile00.tga" the pieces WndEditTile00 to 08, "WndEditTile200.tga" (the skill
 * window's) WndEditTile200 to 208.
 */
export function editTiles(doc: Document, art: UiArt, columns: number, rows: number, tile = 'WndEditTile00.tga'): HTMLElement {
  const name = (n: number): string => `${tile.slice(0, -6)}${String(n).padStart(2, '0')}${tile.slice(-4)}`;
  const element = doc.createElement('div');
  element.className = 'hud-edit-tiles';
  const xs: Array<[number, number]> = [[0, EDIT], [EDIT, (columns - 2) * EDIT], [(columns - 1) * EDIT, EDIT]];
  const ys: Array<[number, number]> = [[0, EDIT], [EDIT, (rows - 2) * EDIT], [(rows - 1) * EDIT, EDIT_TILE_HEIGHT]];
  ys.forEach(([top, height], row) => {
    xs.forEach(([left, width], column) => {
      if (width <= 0 || height <= 0) return;
      const piece = doc.createElement('div');
      piece.style.left = `${left}px`;
      piece.style.top = `${top}px`;
      piece.style.width = `${width}px`;
      piece.style.height = `${height}px`;
      piece.style.backgroundImage = themeUrl(art, name(row * 3 + column));
      element.append(piece);
    });
  });
  return element;
}

/**
 * The tiles of the strip of tabs, from the left, as `CWndTabCtrl::AdditionalSkinTexture` lays them (:4396-4436): a strip
 * `columns` tiles of 8 px long for `tabs` tabs, each tab `columns / tabs` tiles. The first tab starts with tile 0 and the
 * others with tile 4; a tab's last two tiles are 2 and 3, or 2 and 5 at the end of the strip; the rest are 1.
 */
export function tabStripTiles(columns: number, tabs: number): number[] {
  const size = Math.trunc(columns / Math.max(tabs, 1));
  const tiles: number[] = [];
  let start = 0;
  for (let i = 0; i < columns; i++) {
    if (i === start - 2) {
      tiles[i] = 2;
      i++;
      if (i < columns) tiles[i] = i === columns - 1 ? 5 : 3;
    } else if (i === start) {
      tiles[i] = i === 0 ? 0 : 4;
      start += size;
    } else {
      tiles[i] = 1;
    }
  }
  return tiles;
}

/** A tile of the chosen tab: its WndTabTile number, and where it goes along the strip (its width, 8 px but one). */
export interface TabTile {
  index: number;
  left: number;
  width: number;
}

/**
 * The tiles `CWndTabCtrl::OnDraw` draws the chosen tab with over the strip (:4185-4219), for tab `chosen` of `tabs` on a
 * strip `columns` tiles long: tile 10 (11 for a tab not first), 11 stretched to `nSize - 3` tiles (`RenderTextureEx`'s
 * scale), 12, then 13 and 14, or 15 for the last tab.
 */
export function chosenTabTiles(columns: number, tabs: number, chosen: number): TabTile[] {
  const size = Math.trunc(columns / Math.max(tabs, 1));
  const x = TAB_TILE * size * chosen;
  const tiles: TabTile[] = [
    { index: chosen === 0 ? 10 : 11, left: x, width: TAB_TILE },
    { index: 11, left: x + TAB_TILE, width: TAB_TILE * (size - 3) },
    { index: 12, left: x + TAB_TILE * (size - 2), width: TAB_TILE },
  ];
  if (chosen === tabs - 1) tiles.push({ index: 15, left: x + TAB_TILE * (size - 1), width: TAB_TILE });
  else {
    tiles.push({ index: 13, left: x + TAB_TILE * (size - 1), width: TAB_TILE }, { index: 14, left: x + TAB_TILE * size, width: TAB_TILE });
  }
  return tiles;
}

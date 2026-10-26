// A gauge of Neuz's theme: a bar the width of a number, drawn from a gauge picture cut in three (`GauEmptyNormal.bmp`,
// `GauEmptySmall.bmp`), the picture multiplied by the gauge's colour, alpha included.
//
//   CTheme::MakeGaugeVertex  Source/_Interface/ITheme.cpp:1684-1848  the left third, the middle third stretched, the right
//                                                                    third, in slices of a third of the picture's width;
//                                                                    under two slices nothing is made
//   CTheme::RenderGauge      ITheme.cpp:1850-1906                    texture x diffuse, for the colour and the alpha

import { cssRgb, themeUrl } from './art';
import type { UiArt } from './art';

/** The gauge pictures' sizes: 12 x 12 and 12 x 8 (`Theme/Default`). */
const PICTURES = {
  'GauEmptyNormal.bmp': { width: 12, height: 12 },
  'GauEmptySmall.bmp': { width: 12, height: 8 },
} as const;
export type GaugePicture = keyof typeof PICTURES;

/**
 * The width a gauge of `width` pixels is drawn at (`MakeGaugeVertex`): whole slices of a third of the picture's width
 * (`nWidth = pRect->Width() / nTexWidth`), and none under two slices (`if( nWidth < 2 ) return FALSE`), when the caller
 * draws no gauge (`m_bVBHPGauge`).
 */
export function drawnGaugeWidth(width: number, picture: GaugePicture = 'GauEmptyNormal.bmp'): number {
  const slice = PICTURES[picture].width / 3;
  const slices = Math.trunc(width / slice);
  return slices < 2 ? 0 : slices * slice;
}

/**
 * A gauge: three pieces of the picture (left, middle stretched, right), each the picture multiplied by `color` (ARGB):
 * the picture over the colour with `multiply`, cut out by the picture's own alpha (a mask) and made as transparent as the
 * colour's alpha. `set` gives it the width the caller computed (`data-width`), drawn as `drawnGaugeWidth` says.
 */
export class Gauge {
  readonly element: HTMLElement;
  private readonly pieces: HTMLElement[];
  private readonly slice: number;
  private width = -1;

  constructor(art: UiArt, private readonly picture: GaugePicture, color: number, name: string, doc: Document = document) {
    const { width, height } = PICTURES[picture];
    this.slice = width / 3;
    const element = doc.createElement('div');
    element.className = 'hud-gauge';
    element.dataset.gauge = name;
    element.style.height = `${height}px`;
    element.style.opacity = String(((color >>> 24) & 0xff) / 255);
    const url = themeUrl(art, picture);
    this.pieces = [0, 1, 2].map(() => {
      const piece = doc.createElement('div');
      piece.style.height = `${height}px`;
      piece.style.backgroundColor = cssRgb(color);
      piece.style.backgroundImage = url;
      piece.style.setProperty('background-blend-mode', 'multiply');
      piece.style.setProperty('-webkit-mask-image', url);
      piece.style.setProperty('mask-image', url);
      element.append(piece);
      return piece;
    });
    this.element = element;
    this.set(0);
  }

  /** The gauge's width in pixels, as the caller computed it; hidden when the theme would draw none. */
  set(width: number): void {
    if (width === this.width) return;
    this.width = width;
    this.element.dataset.width = String(width);
    const drawn = drawnGaugeWidth(width, this.picture);
    this.element.hidden = drawn === 0;
    this.element.style.width = `${drawn}px`;
    if (drawn === 0) return;
    const { slice } = this;
    const { height } = PICTURES[this.picture];
    const middle = drawn - 2 * slice;
    // the left third at the left, the middle third stretched over the middle, the right third at the right
    const layout: Array<[number, number, string, string]> = [
      [0, slice, `${3 * slice}px ${height}px`, '0 0'],
      [slice, middle, `${3 * middle}px ${height}px`, `${-middle}px 0`],
      [slice + middle, slice, `${3 * slice}px ${height}px`, `${-2 * slice}px 0`],
    ];
    layout.forEach(([left, width_, size, position], i) => {
      const { style } = this.pieces[i]!;
      style.left = `${left}px`;
      style.width = `${width_}px`;
      for (const prefix of ['background', '-webkit-mask', 'mask']) {
        style.setProperty(`${prefix}-size`, size);
        style.setProperty(`${prefix}-position`, position);
      }
    });
  }
}

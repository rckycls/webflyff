// The status window (spec §3.9, [combat §4.3], [stats §5.1]): `CWndStatus` (APP_STATUS1), top left, with the face of the
// own character, its name and level in the title, and its HP, MP, FP, EXP and rest bars and numbers. T toggles it.
//
//   resdata.inc:3350-3415          Resource/resdata.inc  "WndStatus2.tga", 220 x 112, the bars' and the face's rectangles
//   CWndStatus::CWndStatus         _Interface/WndField.cpp:10267-10292  the numbers start in mode 2
//   CWndStatus::MakeGaugeVertex    WndField.cpp:10299-10384  the bars' widths and colours
//   CWndStatus::PaintFrame         WndField.cpp:10385-10438  the title, TID_GAME_WND_STATUS_PLAYER_INFORMATION
//   CWndStatus::OnDraw             WndField.cpp:10440-10631  the numbers of each mode, and the EXP text
//   CWndStatus::OnLButtonDown      WndField.cpp:11304-11307  a click cycles the numbers 2, 0, 1
//   CMover::GetHitPointPercent     _Common/MoverParam.cpp:2938-2958  MulDiv( value, 100, max ), 0 for a max of 0

import { expNeeded, expPercentText } from '../sim/params';
import type { ExpRow } from '@flyffweb/formats';
import type { Texts } from '../gameData';
import type { OwnState } from '../OwnState';
import { WindowFrame } from './frame';
import type { UiArt } from './frame';
import { Gauge } from './gauge';
import { formatText } from './messages';

const f32 = Math.fround;

/** `APP_STATUS1 "WndStatus2.tga" 0 220 112` (`resdata.inc:3350`): the window's picture, drawn as it is (`bTile` 0). */
const WIDTH = 220;
const HEIGHT = 112;
/** The controls' rectangles in the client area (`WIDC_CUSTOM1` to `WIDC_CUSTOM6`, `resdata.inc:3360-3405`). */
const BAR_LEFT = 96;
const BAR_RIGHT = 204;
const BAR_WIDTH = BAR_RIGHT - BAR_LEFT; // 108, `lpHP->rect.Width()`
const ROWS = { hp: 4, mp: 20, fp: 34, exp: 50, rest: 66 } as const;
const FACE = { left: 4, top: 4, width: 64, height: 68 } as const;
/** The bars' colours (`MakeGaugeVertex`, :10325-10380). */
const HP_COLOR = 0x64ff0000;
const MP_COLOR = 0x640000ff;
const FP_COLOR = 0x6400ff00;
const EXP_COLOR = 0x847070ff;
const REST_COLOR = 0x84e6ce19;

/** `m_nDisplay`: 2 the value and the maximum, 1 the percent and the value, 0 no numbers. */
type Display = 0 | 1 | 2;

/** `MulDiv( value, 100, max )` of `GetHitPointPercent` and the others: rounded to the nearest, 0 for a max of 0. */
export function pointPercent(value: number, max: number): number {
  if (max === 0) return 0;
  const product = value * 100;
  // MulDiv rounds half away from zero
  return Math.sign(product) * Math.sign(max) * Math.floor((Math.abs(product) * 2 + Math.abs(max)) / (2 * Math.abs(max)));
}

/** `nWidthClient * value / max` (`MakeGaugeVertex`, int arithmetic): 0 for a max of 0, which the C++ would divide by. */
export function barWidth(value: number, max: number, width = BAR_WIDTH): number {
  return max <= 0 ? 0 : Math.trunc((width * value) / max);
}

/** `(int)( ( (float)nWidthClient / GetMaxExp1() ) * GetExp1() )` (`:10357`): the EXP bar's width, in C floats. */
export function expBarWidth(exp: bigint, needed: bigint, width = BAR_WIDTH): number {
  if (needed <= 0n) return 0;
  return Math.trunc(f32(f32(width / f32(Number(needed))) * f32(Number(exp))));
}

/** A row of numbers over a bar: three places, as the modes draw them. */
interface Row {
  element: HTMLElement;
  /** Mode 2: the value centred at 122, the maximum at 174, the slash in the middle. Mode 1: the percent at 114, `<value>` at 187. */
  parts: HTMLElement[];
}

/**
 * The status window. `update` is given the own numbers and name each frame and redraws what changed (the numbers are read
 * fresh each time, as `OnDraw` reads them); a click on the window cycles its numbers. It opens at the top left of its layer
 * (`OnInitialUpdate`, `WndField.cpp:11258-11261`) the first time there are numbers to show, and closes with its button,
 * Escape or `toggle`. The face is a picture its owner makes (`setPortrait`).
 */
export class StatusWindow {
  readonly frame: WindowFrame;
  private display: Display = 2;
  private readonly gauges: Record<keyof typeof ROWS, Gauge>;
  private readonly rows: Record<keyof typeof ROWS, Row>;
  private readonly face: HTMLElement;
  /** The window has been shown once: later updates leave it as the player left it. */
  private shown = false;
  private title = '';

  constructor(
    art: UiArt,
    private readonly data: { texts: Texts; exp: readonly ExpRow[] },
    private readonly doc: Document = document,
  ) {
    const frame = new WindowFrame('', art, { width: WIDTH, height: HEIGHT, texture: 'WndStatus2.tga' }, doc);
    frame.element.classList.add('hud-status');
    // Escape never closes it (GetWndBase, WndBase.cpp:2079-2087): T and its close button do
    frame.escapeCloses = false;
    this.frame = frame;
    const body = frame.body;
    body.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      this.display = this.display === 2 ? 0 : this.display === 0 ? 1 : 2;
    });

    this.face = doc.createElement('div');
    this.face.className = 'hud-status-face';
    this.place(this.face, FACE.left, FACE.top, FACE.width, FACE.height);
    body.append(this.face);

    const gauge = (name: keyof typeof ROWS, color: number, small: boolean): Gauge => {
      const g = new Gauge(art, small ? 'GauEmptySmall.bmp' : 'GauEmptyNormal.bmp', color, name, doc);
      g.element.style.left = `${BAR_LEFT}px`;
      g.element.style.top = `${ROWS[name]}px`;
      body.append(g.element);
      return g;
    };
    this.gauges = {
      hp: gauge('hp', HP_COLOR, false),
      mp: gauge('mp', MP_COLOR, false),
      fp: gauge('fp', FP_COLOR, false),
      exp: gauge('exp', EXP_COLOR, true),
      rest: gauge('rest', REST_COLOR, true),
    };
    const row = (name: keyof typeof ROWS, parts: number): Row => {
      const element = doc.createElement('div');
      element.className = 'hud-status-text';
      element.dataset.text = name;
      element.style.top = `${ROWS[name]}px`;
      const spans = Array.from({ length: parts }, () => doc.createElement('span'));
      body.append(element);
      return { element, parts: spans };
    };
    this.rows = { hp: row('hp', 3), mp: row('mp', 3), fp: row('fp', 3), exp: row('exp', 1), rest: row('rest', 1) };
  }

  /**
   * Draws `own`'s numbers, `name` and level in the title. Opens the window at the top left the first time. The EXP bar and
   * text are empty for a level the EXP table has no next row for (`GetMaxExp1` would read past it): the rest is drawn.
   */
  update(own: OwnState, name: string): void {
    if (!this.shown) {
      this.shown = true;
      this.frame.open({ x: 0, y: 0 });
    }
    const title = formatText(this.text('TID_GAME_WND_STATUS_PLAYER_INFORMATION'), [name, own.level]);
    if (title !== this.title) {
      this.title = title;
      this.frame.setTitle(title);
    }
    const points = [
      ['hp', own.hp, own.maxHp()],
      ['mp', own.mp, own.maxMp()],
      ['fp', own.fp, own.maxFp()],
    ] as const;
    for (const [key, value, max] of points) {
      this.gauges[key].set(barWidth(value, max));
      this.writePoints(this.rows[key], value, max);
    }

    let needed: bigint | null = null;
    try {
      needed = expNeeded(this.data.exp, own.level);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
    }
    this.gauges.exp.set(needed === null ? 0 : expBarWidth(own.exp, needed));
    this.write(this.rows.exp, this.display === 0 || needed === null ? [] : [expPercentText(own.exp, needed)]);
    // the guild-house rest bar (`__VER >= 15`): m_nExtraExp, 0 outside a guild house (no message sets it in Piece 4)
    this.gauges.rest.set(0);
    this.write(this.rows.rest, this.display === 0 ? [] : ['0%']);
  }

  /** The face of the own character, drawn in the face box (the window's 3D head, `OnDraw`'s viewport, `:10655-10931`). */
  setPortrait(canvas: HTMLCanvasElement): void {
    this.face.replaceChildren(canvas);
  }

  /** T (APP_STATUS1's key): closes the window if open, opens it where it was otherwise. */
  toggle(): void {
    if (this.frame.isOpen) this.frame.close();
    else this.frame.open(this.frame.position);
  }

  /** The HP, MP or FP numbers of the mode (`OnDraw`, `:10566-10614`). */
  private writePoints(row: Row, value: number, max: number): void {
    switch (this.display) {
      case 2:
        this.write(row, [String(value), '/', String(max)]);
        return;
      case 1:
        this.write(row, [
          `${pointPercent(value, max)}%`,
          formatText(this.text('TID_GAME_WND_STATUS_PERCENT_POINT'), [value]),
        ]);
        return;
      default:
        this.write(row, []);
    }
  }

  /** Puts `texts` in the row's places: one, two (mode 1) or three (mode 2), spaced so the row reads as Neuz draws it. */
  private write(row: Row, texts: readonly string[]): void {
    const mode = texts.length === 3 ? 'points' : texts.length === 2 ? 'percent' : 'single';
    if (row.element.dataset.mode !== mode) row.element.dataset.mode = mode;
    const used = row.parts.slice(0, texts.length);
    texts.forEach((value, i) => {
      if (used[i]!.textContent !== value) used[i]!.textContent = value;
    });
    // the spaces between the places are for reading the row (screen readers, tests); the places are positioned
    const children: Array<Node | string> = [];
    used.forEach((span, i) => {
      if (i > 0) children.push(' ');
      children.push(span);
    });
    if (row.element.childNodes.length !== children.length || used.some((span, i) => row.element.childNodes[i * 2] !== span)) {
      row.element.replaceChildren(...children);
    }
  }

  private place(element: HTMLElement, left: number, top: number, width: number, height: number): void {
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
  }

  /** A text of the catalog (`GETTEXT`), '' for one it lacks. */
  private text(id: string): string {
    return this.data.texts.get(id)?.text ?? '';
  }
}

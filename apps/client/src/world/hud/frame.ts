// Neuz's windows rebuilt as HTML over the 3D view (spec §3.9): the frame `CWndNeuz` paints from the theme's pieces
// (Client/Theme/Default, which the UI stage converts to `ui/*.png`), the title bar that moves the window (`CWndBase`), its
// close button (`CWndTitleBar`), and Escape. The status window, the Character window and the windows of later tasks are
// built in one of these.
//
//   CWndBase::SetWndRect          Source/_Interface/WndBase.cpp:1836-1858  the client area: 18 px of caption, then 4 4 8 10
//   CWndBase::PaintFrame          WndBase.cpp:577-590                      the title at (10, 4), in the window's colour
//   CWndBase::IsPickupSpace       WndBase.cpp:2003-2023                    the top 20 px of a captioned window move it
//   CWndBase::WindowProc (move)   WndBase.cpp:1251-1276                    kept on the screen (m_bCling), snapped within 10 px
//   CWndNeuz::AdditionalSkinTexture  _Interface/WndNeuz.cpp:255-335        the 12 tiles of 16 px of a tiled window
//   CWndTitleBar                  WndNeuz.cpp:39-107                       the close button 7 px from the right, 5 down
//   CTheme::RenderWndButton_4Texture  _Interface/ITheme.cpp:1336-1414      a button's 4 states side by side in its picture
//   CWndMgr::Process (Escape)     _Interface/WndManager.cpp:3295-3420      Escape closes the window that has the focus
//   CWndBase::GetWndBase          WndBase.cpp:2048-2095                    ... but never the status window (escapeCloses)

import { themeUrl } from './art';
import type { UiArt } from './art';

/** The side of a tile of a tiled window (`sizeBmp[ 0 ] = CSize( 16, 16 )`, `WndNeuz.cpp:293`). */
const TILE = 16;
/** The client area inside the window rectangle (`SetWndRect`): 18 px of caption, then 4 left, 4 top, 8 right, 10 bottom. */
const CAPTION = 18;
const CLIENT_LEFT = 4;
const CLIENT_TOP = 4;
const CLIENT_RIGHT = 8;
const CLIENT_BOTTOM = 10;
/** `IsPickupSpace`: `rect.bottom = 20` for a window with a caption. */
const TITLE_BAR = 20;
/** `CWndTitleBar::Replace`: the buttons end 7 px left of the window's right edge, 4 px down, each 16 px apart, a 1 px top. */
const BUTTONS_RIGHT = 7;
const BUTTONS_TOP = 4 + 1;
/** `ButtWndExit.tga`: the four states of the close button, 15 x 14 each (`FitTextureSize`: a quarter of the picture). */
const CLOSE_W = 15;
const CLOSE_H = 14;
/** `m_bCling`: a window this near an edge of the screen goes against it. */
const CLING = 10;

/** What a window looks like: its size, and its picture when it is not tiled (`resdata.inc`'s file name with `bTile` 0). */
export interface FrameLayout {
  width: number;
  height: number;
  /** Scale on compact touch screens; 0.7 unless this window needs a smaller footprint. */
  mobileScale?: number;
  /** Fit a landscape layout whole within the available window layer. */
  fitWhole?: boolean;
  /** The whole window's picture (a theme file name, `WndStatus2.tga`), drawn as it is; none for the tiled frame. */
  texture?: string;
  /**
   * False for a window whose title bar's buttons are hidden (`m_wndTitleBar.SetVisible( FALSE )`, CWndRevival,
   * WndField.cpp:12219): its caption is still drawn, but it has no close button. True by default.
   */
  closeButton?: boolean;
  /**
   * 2026-11-09: false for a window without `WBS_CAPTION` (the chat, `APP_COMMUNICATION_CHAT` 0x410040): no title bar, and
   * a press on any part its controls leave free moves it (`IsPickupSpace` is the whole window, WndBase.cpp:2003-2023).
   * True by default.
   */
  caption?: boolean;
  /**
   * 2026-11-09: the start of the tiles' file names: the layout's picture less its last 6 characters
   * (`AdditionalSkinTexture`, WndNeuz.cpp:276-278): 'WndTile' for "WndTile07.tga" and its kind, 'WndTile3' for the chat's
   * "WndTile308.tga". 'WndTile' by default.
   */
  tiles?: string;
  /** 2026-11-09: the client area's insets of a window with no caption (left, top, right, bottom; the chat's 4 4 6 6). */
  insets?: readonly [number, number, number, number];
  /**
   * 2026-11-09: `WBS_THICKFRAME`: the edges can be dragged (`GetResizeDir`, `WndBase.cpp:1967-2001`), down to this least
   * size (the window's `AdjustMinRect`).
   */
  resize?: { width: number; height: number };
}

/** `GetResizeDir`'s band: 6 px in from the window's edges. */
const RESIZE_BAND = 6;
/** The drag moves an edge in whole tiles (`pt.x = ( pt.x / 16 ) * 16`, WndBase.cpp:1196-1198). */
const RESIZE_STEP = 16;

/**
 * Which edge a press at (`x`, `y`) of a `width` x `height` window drags (`GetResizeDir`, `WndBase.cpp:1967-2001`): 1 top,
 * 2 bottom, 3 left, 4 right, 5 top left, 6 top right, 7 bottom left, 8 bottom right, 0 none.
 */
export function resizeDirection(x: number, y: number, width: number, height: number): number {
  if (x < 0 || y < 0 || x >= width || y >= height) return 0;
  const left = x < RESIZE_BAND, right = x > width - RESIZE_BAND, top = y < RESIZE_BAND, bottom = y > height - RESIZE_BAND;
  if (left && top) return 5;
  if (right && top) return 6;
  if (left && bottom) return 7;
  if (right && bottom) return 8;
  if (top) return 1;
  if (bottom) return 2;
  if (left) return 3;
  if (right) return 4;
  return 0;
}

/** A window's rectangle on its layer. */
export interface WindowRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The rectangle a drag of edge `dir` by (`dx`, `dy`) from `old` gives (`WindowProc`, `WndBase.cpp:1171-1230`): the drag
 * cut to whole steps of 16 px toward 0, an edge within 10 px of the room's (the layer above the task bar) put onto it,
 * then the least size kept from the edge that did not move (`AdjustMinRect`, `:2480-2499`).
 */
export function resizeRect(
  old: WindowRect, dir: number, dx: number, dy: number, room: { width: number; height: number },
  least: { width: number; height: number },
): WindowRect {
  const sx = Math.trunc(dx / RESIZE_STEP) * RESIZE_STEP;
  const sy = Math.trunc(dy / RESIZE_STEP) * RESIZE_STEP;
  let left = old.left, top = old.top, right = old.left + old.width, bottom = old.top + old.height;
  if (dir === 1 || dir === 5 || dir === 6) top += sy;
  if (dir === 2 || dir === 7 || dir === 8) bottom += sy;
  if (dir === 3 || dir === 5 || dir === 7) left += sx;
  if (dir === 4 || dir === 6 || dir === 8) right += sx;
  if (top < CLING) top = 0;
  if (bottom > room.height - CLING) bottom = room.height;
  if (left < CLING) left = 0;
  if (right > room.width - CLING) right = room.width;
  if (right - left < least.width) {
    if (left > old.left) left = right - least.width;
    else right = left + least.width;
  }
  if (bottom - top < least.height) {
    if (top > old.top) top = bottom - least.height;
    else bottom = top + least.height;
  }
  return { left, top, width: right - left, height: bottom - top };
}

/** The resize cursors of `OnSetCursor` (`WndNeuz.cpp:680-700`), by `resizeDirection`. */
const RESIZE_CURSORS = ['', 'ns-resize', 'ns-resize', 'ew-resize', 'ew-resize', 'nwse-resize', 'nesw-resize', 'nesw-resize', 'nwse-resize'];

/** A window with no layout of its own. */
const DEFAULT_LAYOUT: FrameLayout = { width: 256, height: 256 };

/**
 * Which of the 12 tiles goes at tile (`x`, `y`) of a frame `cx` by `cy` tiles: the if-chain of `AdditionalSkinTexture`
 * (`WndNeuz.cpp:314-328`), the top row 0 1 2, the second 3 4 5, the rest down to the last 6 7 8, the last 9 10 11 (a
 * frame of two rows has no last row: the second row's rule comes first).
 */
export function frameTile(x: number, y: number, cx: number, cy: number): number {
  const column = x === 0 ? 0 : x < cx - 1 ? 1 : 2;
  if (y === 0) return column;
  if (y === 1) return 3 + column;
  if (y < cy - 1) return 6 + column;
  return 9 + column;
}

/** The windows open on a document, the top one last: Escape closes that one. */
const stacks = new WeakMap<Document, WindowFrame[]>();

/** How much of each layer's bottom the windows leave free (`setLayoutBottom`). */
const layoutBottoms = new WeakMap<Element, number>();

/**
 * Keeps the windows of `layer` `px` CSS pixels clear of its bottom: the task bar's, which Neuz takes off the root window's
 * layout rectangle (`m_pWndRoot->m_rectLayout.bottom = rect.top`, `CWndTaskBar::OnInitialUpdate`,
 * `WndTaskBar.cpp:1176-1178`), inside which the windows are kept as they move (`m_bCling`, `WndBase.cpp:1261`).
 */
export function setLayoutBottom(layer: Element, px: number): void {
  const changed = layoutBottoms.get(layer) !== px;
  layoutBottoms.set(layer, px);
  // 2026-11-09: the open windows keep to the new room (the chat, put on the bar, goes onto it)
  if (changed) refitWindows(layer.ownerDocument);
}

/** 2026-11-05: what `setLayoutBottom` keeps free of `layer`'s bottom (0 if nothing), for the buff display's moves. */
export function layoutBottomOf(layer: Element): number {
  return layoutBottoms.get(layer) ?? 0;
}

function stackOf(doc: Document): WindowFrame[] {
  let stack = stacks.get(doc);
  if (stack === undefined) {
    stack = [];
    stacks.set(doc, stack);
  }
  return stack;
}

/** The z-index of the bottom window; each one above it is one more. */
const BASE_Z = 1;

/**
 * A window in Neuz's frame. Its `element` is put in the layer of windows by its owner and stays there: `open` shows it
 * at a point (kept on the layer), `close` hides it and calls `onClose`. The frame is the theme's 12 tiles of 16 px, laid as
 * `AdditionalSkinTexture` lays them (a window whose size is not a multiple of 16 is cut on the right and at the bottom),
 * or the window's own picture; the title at (10, 4); the close button at the top right; `body` the client area, 4 px in
 * and 22 px down (18 px of caption and 4). The top 20 px move the window, with the mouse or a finger (pointer events),
 * within the layer; Escape closes the window on top, the one opened or pressed last.
 */
export class WindowFrame {
  readonly element: HTMLElement;
  /** The client area, where the window's content goes. */
  readonly body: HTMLElement;
  /** Called once each time the window closes (its close button, Escape or `close`). */
  onClose?: () => void;
  /**
   * Whether Escape may close the window. `CWndBase::GetWndBase()`, which picks the window Escape closes, passes over
   * APP_STATUS1, APP_NAVIGATOR, APP_REVIVAL and APP_BUFF_STATUS (`WndBase.cpp:2048-2095`): those windows set it false.
   */
  escapeCloses = true;
  private readonly titleText: HTMLElement;
  private readonly doc: Document;
  private open_ = false;
  private drag: { pointerId: number; dx: number; dy: number } | null = null;
  /**
   * Where the window was put: the point it was opened at, or where it was dragged to. `refit` keeps the window on a
   * screen that has changed size from there, so a window squeezed in while the phone is upright goes back where it was
   * once the phone is turned back, and one opened past an edge goes to its point once there is room.
   */
  private placed = { x: 0, y: 0 };
  private centered = false;
  /** The window's size as Neuz has it (`FrameLayout`), its frame, and the height it is shown at (`fit`). */
  private width: number;
  private fullHeight: number;
  private readonly frame: HTMLElement;
  private readonly art: UiArt;
  private readonly tiled: boolean;
  private shownHeight: number;
  private scale = 1;
  private readonly mobileScale: number;
  private readonly fitWhole: boolean;
  /** 2026-11-09: the options of a window with no caption (the chat): see `FrameLayout`. */
  private readonly caption: boolean;
  private readonly tilePrefix: string;
  /** The client area's insets: left, top, right, bottom. */
  private readonly insets: readonly [number, number, number, number];
  private readonly least: { width: number; height: number } | undefined;
  private resizing: { pointerId: number; dir: number; x: number; y: number; old: WindowRect } | null = null;
  /** 2026-11-09: false while the move lock is on (`WBS_MOVE` taken away, WndCommunication.cpp:678-689); the edges still drag. */
  movable = true;
  /** 2026-11-09: called with the new size each time an edge is dragged to one (`OnSize`). */
  onResize?: (width: number, height: number) => void;
  /** 2026-11-09: called when a drag of the window or of an edge ends (the window's place to keep). */
  onPlaced?: () => void;

  constructor(title: string, art: UiArt, layout: FrameLayout = DEFAULT_LAYOUT, doc: Document = document) {
    this.doc = doc;
    this.mobileScale = layout.mobileScale ?? 0.7;
    this.fitWhole = layout.fitWhole ?? false;
    const { width, height } = layout;
    this.width = width;
    this.fullHeight = height;
    this.shownHeight = height;
    this.art = art;
    this.tiled = layout.texture === undefined;
    this.caption = layout.caption ?? true;
    this.tilePrefix = layout.tiles ?? 'WndTile';
    this.insets = this.caption ? [CLIENT_LEFT, CAPTION + CLIENT_TOP, CLIENT_RIGHT, CLIENT_BOTTOM] : layout.insets ?? [0, 0, 0, 0];
    this.least = layout.resize;
    const element = doc.createElement('div');
    element.className = 'hud-window';
    element.hidden = true;
    element.setAttribute('role', 'group');
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;

    const frame = doc.createElement('div');
    frame.className = 'hud-window-frame';
    if (layout.texture === undefined) this.tile(frame, art, width, height);
    else frame.style.backgroundImage = themeUrl(art, layout.texture);
    this.frame = frame;

    const titleBar = doc.createElement('div');
    titleBar.className = 'hud-window-title';
    titleBar.style.height = `${TITLE_BAR}px`;
    this.titleText = titleBar;

    const close = doc.createElement('button');
    close.type = 'button';
    close.className = 'hud-window-close';
    close.style.left = `${width - TILE - BUTTONS_RIGHT}px`;
    close.style.top = `${BUTTONS_TOP}px`;
    close.style.width = `${CLOSE_W}px`;
    close.style.height = `${CLOSE_H}px`;
    close.style.backgroundImage = themeUrl(art, 'ButtWndExit.tga');
    close.addEventListener('click', () => this.close());
    // the button is not part of the title bar's moving space
    close.addEventListener('pointerdown', (event) => event.stopPropagation());

    const body = doc.createElement('div');
    body.className = 'hud-window-body';
    const [left, top, right, bottom] = this.insets;
    body.style.left = `${left}px`;
    body.style.top = `${top}px`;
    body.style.width = `${Math.max(0, width - left - right)}px`;
    body.style.height = `${Math.max(0, height - top - bottom)}px`;
    this.body = body;

    element.append(frame);
    if (this.caption) element.append(titleBar);
    element.append(body);
    if (layout.closeButton !== false) element.append(close);
    this.element = element;
    this.setTitle(title);

    element.addEventListener('pointerdown', (event) => {
      this.raise();
      if (!this.caption) this.press(event);
    });
    titleBar.addEventListener('pointerdown', (event) => this.startDrag(event));
    if (this.least !== undefined) element.addEventListener('pointermove', (event) => this.hover(event));
  }

  /** Where a pointer is on the window: its point in the window's own pixels. */
  private local(event: PointerEvent): { x: number; y: number } {
    const rect = this.element.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / this.scale, y: (event.clientY - rect.top) / this.scale };
  }

  /**
   * 2026-11-09: a press on a window with no caption: within 6 px of an edge it drags that edge (`WBS_THICKFRAME`); else,
   * on a part no control takes, it moves the window (`WBS_MOVE`, which the move lock takes away).
   */
  private press(event: PointerEvent): void {
    if (event.button !== 0 || this.drag !== null || this.resizing !== null) return;
    // a control takes its own press, at the edges too (the focus is the child's, WndBase.cpp:1335-1370)
    const target = event.target as Element | null;
    if (target?.closest?.('button, input, textarea, select, a, [data-press]') != null) return;
    const { x, y } = this.local(event);
    const dir = this.least === undefined ? 0 : resizeDirection(x, y, this.width, this.shownHeight);
    if (dir !== 0) {
      const { x: left, y: top } = this.position;
      this.resizing = { pointerId: event.pointerId ?? 0, dir, x: event.clientX, y: event.clientY,
        old: { left, top, width: this.width, height: this.shownHeight } };
      const view = this.view();
      view.addEventListener('pointermove', this.onMove);
      view.addEventListener('pointerup', this.onUp);
      view.addEventListener('pointercancel', this.onUp);
      event.preventDefault();
      return;
    }
    if (!this.movable) return;
    this.startDrag(event);
  }

  /** The resize cursor over the edges' band (`OnSetCursor`, WndNeuz.cpp:680-700). */
  private hover(event: PointerEvent): void {
    if (this.drag !== null || this.resizing !== null) return;
    const { x, y } = this.local(event);
    this.element.style.cursor = RESIZE_CURSORS[resizeDirection(x, y, this.width, this.shownHeight)]!;
  }

  /**
   * 2026-11-09: the window made `width` x `height` (an edge dragged, `SetWndRect`): its frame laid again, its client
   * area as much bigger or smaller, and `onResize` told.
   */
  setSize(width: number, height: number): void {
    if (width === this.width && height === this.fullHeight) return;
    this.width = width;
    this.element.style.width = `${width}px`;
    const [left, , right] = this.insets;
    this.body.style.width = `${Math.max(0, width - left - right)}px`;
    this.fullHeight = height;
    this.shownHeight = -1;
    this.fit();
    this.onResize?.(width, this.shownHeight);
  }

  /** The window's size as it is shown. */
  get size(): { width: number; height: number } {
    return { width: this.width, height: this.shownHeight };
  }

  get isOpen(): boolean {
    return this.open_;
  }

  /** The title bar's text (`SetTitle`). */
  setTitle(text: string): void {
    this.titleText.textContent = text;
    this.element.setAttribute('aria-label', text);
  }

  /**
   * Shows the window with its top left at `at` (CSS pixels of its layer, kept on it, the window cut to the room above the
   * task bar if it is taller: `fit`) and puts it on top.
   */
  open(at: { x: number; y: number } | 'center'): void {
    this.centered = at === 'center';
    this.element.hidden = false;
    this.fit();
    const layer = this.element.parentElement;
    const position = at === 'center' ? {
      x: ((layer?.clientWidth ?? 0) - this.width * this.scale) / 2,
      y: ((layer?.clientHeight ?? 0) - (layer === null ? 0 : layoutBottoms.get(layer) ?? 0) - this.shownHeight * this.scale) / 2,
    } : at;
    this.moveTo(position.x, position.y, false);
    this.placed = { x: Math.round(position.x), y: Math.round(position.y) };
    if (!this.open_) {
      this.open_ = true;
      const stack = stackOf(this.doc);
      if (stack.length === 0) this.view().addEventListener('keydown', onKeyDown);
      stack.push(this);
    }
    this.raise();
  }

  /** Hides the window (`Destroy`, for the windows Piece 4 keeps) and calls `onClose`; nothing if it is not open. */
  close(): void {
    if (!this.open_) return;
    this.open_ = false;
    this.endDrag();
    this.element.hidden = true;
    const stack = stackOf(this.doc);
    const index = stack.indexOf(this);
    if (index >= 0) stack.splice(index, 1);
    if (stack.length === 0) this.view().removeEventListener('keydown', onKeyDown);
    this.restack(stack);
    this.onClose?.();
  }

  /** Where the window is: its top left in CSS pixels of its layer. */
  get position(): { x: number; y: number } {
    return { x: parseFloat(this.element.style.left) || 0, y: parseFloat(this.element.style.top) || 0 };
  }

  /**
   * Keeps the open window on its layer after the screen changed size (a resize, a turn of the device), as `open` keeps
   * it: from where it was put, so that it goes back there when the screen is big enough again. The layer hides what is
   * past its edges, and Neuz, whose screen never changes size under a window, has nothing of this. Its height is fitted
   * to the new room first (`fit`).
   */
  refit(): void {
    if (!this.open_) return;
    this.fit();
    const layer = this.element.parentElement;
    if (this.centered && layer !== null) {
      this.moveTo((layer.clientWidth - this.width * this.scale) / 2,
        (layer.clientHeight - (layoutBottoms.get(layer) ?? 0) - this.shownHeight * this.scale) / 2, false);
    } else this.moveTo(this.placed.x, this.placed.y, false);
  }

  /**
   * A window taller than the room its layer has above the task bar (the layer's height less `setLayoutBottom`'s) is cut to
   * that room: its frame tiled at the height it is shown at (`tile`, as `AdditionalSkinTexture` tiles any height), its
   * client area as much shorter, and scrolled (`data-scrolls`, style.css). With room again it is whole. Neuz's windows fit
   * its screens (the Character window's 512 px under a 600 px one less the bar's 48); a landscape phone has 300 to 340 px
   * above the bar. Piece 5 scales phone windows to about half their PC area. A layer not laid out yet (0 high)
   * cuts nothing.
   */
  private fit(): void {
    this.scale = this.view().matchMedia?.('(max-width: 1000px) and (pointer: coarse)').matches === true ? this.mobileScale : 1;
    const layer = this.element.parentElement;
    if (this.fitWhole && layer !== null && layer.clientWidth > 0 && layer.clientHeight > 0) {
      this.scale = Math.min(1, (layer.clientWidth - 16) / this.width,
        (layer.clientHeight - (layoutBottoms.get(layer) ?? 0) - 16) / this.fullHeight);
    }
    this.element.style.transform = this.scale === 1 ? '' : `scale(${this.scale})`;
    this.element.style.transformOrigin = 'top left';
    this.element.toggleAttribute('data-mobile-window', this.scale !== 1);
    const room = layer === null ? 0 : (layer.clientHeight - (layoutBottoms.get(layer) ?? 0)) / this.scale;
    const height = room > 0 && this.fullHeight > room ? room : this.fullHeight;
    if (height === this.shownHeight) return;
    this.shownHeight = height;
    this.element.style.height = `${height}px`;
    this.body.style.height = `${Math.max(0, height - this.insets[1] - this.insets[3])}px`;
    if (this.tiled) {
      this.frame.replaceChildren();
      this.tile(this.frame, this.art, this.width, height);
    }
    this.element.toggleAttribute('data-scrolls', height < this.fullHeight);
  }

  /** The 12 tiles: corners, the runs between them repeated every 16 px, on a grid of whole tiles cut to the window. */
  private tile(frame: HTMLElement, art: UiArt, width: number, height: number): void {
    const cx = Math.ceil(width / TILE);
    const cy = Math.ceil(height / TILE);
    // the columns and rows of tiles: the first, the run between (none for a frame of two), the last
    const spans = (n: number): Array<[number, number]> => {
      if (n <= 1) return [[0, n]];
      return n === 2 ? [[0, 1], [1, 1]] : [[0, 1], [1, n - 2], [n - 1, 1]];
    };
    const rowSpans = (n: number): Array<[number, number]> => {
      if (n <= 2) return Array.from({ length: n }, (_, i) => [i, 1] as [number, number]);
      return n === 3 ? [[0, 1], [1, 1], [2, 1]] : [[0, 1], [1, 1], [2, n - 3], [n - 1, 1]];
    };
    for (const [y, rows] of rowSpans(cy)) {
      for (const [x, columns] of spans(cx)) {
        const index = frameTile(x, y, cx, cy);
        const tile = this.doc.createElement('div');
        tile.dataset.tile = String(index);
        tile.style.left = `${x * TILE}px`;
        tile.style.top = `${y * TILE}px`;
        tile.style.width = `${columns * TILE}px`;
        tile.style.height = `${rows * TILE}px`;
        tile.style.backgroundImage = themeUrl(art, `${this.tilePrefix}${String(index).padStart(2, '0')}.tga`);
        frame.append(tile);
      }
    }
  }

  /**
   * Piece 7 M4: a window whose height changes as it shows more or fewer rows (`SetWndRect`, the party's quick view,
   * `CWndPartyQuick::SetActiveMember`): its frame is laid again at the new height.
   */
  setHeight(height: number): void {
    if (height === this.fullHeight) return;
    this.fullHeight = height;
    this.shownHeight = -1;
    this.fit();
  }

  /** Puts the window on top of the others (`SetFocus`): last in the stack, highest z-index. */
  raise(): void {
    if (!this.open_) return;
    const stack = stackOf(this.doc);
    const index = stack.indexOf(this);
    if (index >= 0 && index !== stack.length - 1) {
      stack.splice(index, 1);
      stack.push(this);
    }
    this.restack(stack);
  }

  private restack(stack: readonly WindowFrame[]): void {
    stack.forEach((frame, i) => {
      frame.element.style.zIndex = String(BASE_Z + i);
    });
  }

  private view(): Window {
    return this.doc.defaultView ?? window;
  }

  /**
   * `m_bPickup` on a press in the title bar (`IsPickupSpace`): the window follows the pointer until it is let go. The
   * pointer is told by its `pointerId`; the `?? 0` here and in `onMove` and `onUp` is for jsdom 25, which has no
   * PointerEvent: the unit tests send mouse events under the pointer events' names, which carry none. A browser always
   * gives one.
   */
  private startDrag(event: PointerEvent): void {
    if (event.button !== 0 || this.drag !== null) return;
    const { x, y } = this.position;
    this.drag = { pointerId: event.pointerId ?? 0, dx: event.clientX - x, dy: event.clientY - y };
    const view = this.view();
    view.addEventListener('pointermove', this.onMove);
    view.addEventListener('pointerup', this.onUp);
    view.addEventListener('pointercancel', this.onUp);
    event.preventDefault();
  }

  private readonly onMove = (event: PointerEvent): void => {
    const resizing = this.resizing;
    if (resizing !== null && (event.pointerId ?? 0) === resizing.pointerId) {
      const layer = this.element.parentElement;
      const room = {
        width: layer?.clientWidth ?? 0,
        height: (layer?.clientHeight ?? 0) - (layer === null ? 0 : layoutBottoms.get(layer) ?? 0),
      };
      const rect = resizeRect(resizing.old, resizing.dir, (event.clientX - resizing.x) / this.scale,
        (event.clientY - resizing.y) / this.scale, room, this.least!);
      this.centered = false;
      this.element.style.left = `${rect.left}px`;
      this.element.style.top = `${rect.top}px`;
      this.placed = { x: rect.left, y: rect.top };
      this.setSize(rect.width, rect.height);
      return;
    }
    const drag = this.drag;
    if (drag === null || (event.pointerId ?? 0) !== drag.pointerId) return;
    this.centered = false;
    this.moveTo(event.clientX - drag.dx, event.clientY - drag.dy, true);
    this.placed = this.position;
  };

  private readonly onUp = (event: PointerEvent): void => {
    if (this.drag !== null && (event.pointerId ?? 0) === this.drag.pointerId) this.endDrag();
    if (this.resizing !== null && (event.pointerId ?? 0) === this.resizing.pointerId) this.endDrag();
  };

  private endDrag(): void {
    const moved = this.drag !== null || this.resizing !== null;
    this.drag = null;
    this.resizing = null;
    if (moved) this.onPlaced?.();
    const view = this.view();
    view.removeEventListener('pointermove', this.onMove);
    view.removeEventListener('pointerup', this.onUp);
    view.removeEventListener('pointercancel', this.onUp);
  }

  /**
   * Moves the window's top left to (`x`, `y`), kept on its layer (`m_bCling`, `WndBase.cpp:1259-1271`): within 10 px of an
   * edge it goes against it (`cling`, while moved by the pointer), and it never goes past one; its bottom edge is the
   * layout's, above the task bar (`setLayoutBottom`). A layer with no size yet (not laid out) keeps nothing.
   *
   * A deliberate departure: Neuz keeps the left and top edges first and the right and bottom ones last (:1268-1271), so a
   * window taller than the screen ends with its bottom on the screen's and its title bar above the top, out of reach.
   * Here the right and bottom go first and the left and top last, so the title bar of such a window (on a short phone in
   * landscape) stays on the screen, to be dragged.
   */
  private moveTo(x: number, y: number, cling: boolean): void {
    const layer = this.element.parentElement;
    const right = layer?.clientWidth ?? 0;
    const bottom = (layer?.clientHeight ?? 0) - (layer === null ? 0 : layoutBottoms.get(layer) ?? 0);
    const w = (this.element.offsetWidth || parseFloat(this.element.style.width) || 0) * this.scale;
    const h = (this.element.offsetHeight || parseFloat(this.element.style.height) || 0) * this.scale;
    let px = Math.round(x);
    let py = Math.round(y);
    if (right > 0 && bottom > 0) {
      if (cling) {
        if (px < CLING && px > 0) px = 0;
        if (py < CLING && py > 0) py = 0;
        if (px + w > right - CLING && px + w < right) px = right - w;
        if (py + h > bottom - CLING && py + h < bottom) py = bottom - h;
      }
      if (px + w > right) px = right - w;
      if (py + h > bottom) py = bottom - h;
      if (px < 0) px = 0;
      if (py < 0) py = 0;
    }
    this.element.style.left = `${px}px`;
    this.element.style.top = `${py}px`;
  }
}

/** Keeps every open window of `doc` on its layer after the screen changed size (`WindowFrame.refit`). */
export function refitWindows(doc: Document): void {
  for (const frame of stacks.get(doc) ?? []) frame.refit();
}

/**
 * The window Escape closes on `doc`: the top one it may close (`CWndBase::GetWndBase()`, `WndBase.cpp:2048-2095`, which
 * passes over the windows whose `escapeCloses` is false), or none.
 */
export function escapeWindow(doc: Document): WindowFrame | undefined {
  const stack = stacks.get(doc) ?? [];
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i]!.escapeCloses) return stack[i];
  }
  return undefined;
}

/**
 * Escape closes the window `escapeWindow` names (`CWndMgr::Process`, `WndManager.cpp:3383-3420`); a held key closes one,
 * not all. An Escape that something before it in Neuz's order took (`preventDefault`: the revive window, a target
 * cleared, `escapeStep`) closes nothing, and one with no window to close is left to that order's owner.
 */
function onKeyDown(this: Window, event: KeyboardEvent): void {
  if (event.key !== 'Escape' || event.repeat || event.defaultPrevented) return;
  const top = escapeWindow(this.document);
  if (top === undefined) return;
  event.preventDefault();
  top.close();
}

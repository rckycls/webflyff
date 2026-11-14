// 2026-11-14: the Motion window (docs/2026-11-14-motion-window-research.md): `CWndMotion`, APP_MOTION, opened by O, the
// Start menu's Motion line and a task bar applet. Two tabs of one window, Motion and Emoticon, each a grid of icons: a
// click uses one, a drag carries it to the task bar, the mouse over one shows its tooltip.
//
//   resdata.inc APP_MOTION          Resource/resdata.inc:17727-17750   "WndTile09.tga" tiled, 304 x 320, "Motion";
//                                                                      WIDC_TABCTRL1 8,8-300,274
//   CWndMotion::OnInitialUpdate     _Interface/WndMotion.cpp:20-52     the tabs Motion and Emoticon (TID_GAME_TOOLTIP_*),
//                                                                      Motion chosen
//   CWndTabCtrl                     _Interface/WndControl.cpp:4183-4458  the edit tiles under the pages (15 px short of the
//                                                                      right), the strip of tabs at the bottom
//   CWndMotion1 / CWndEmoticon      WndMotion.cpp:81-452               the grid: 8 a row, (col * 32 + 3, 7 + row * 32);
//                                                                      the button let go uses, a move carries
//
// The phone (no mouse, no hover; plan: "a compact V15-look phone version"): the same frame, tabs and icons, the cells
// 40 px for a finger; a tap uses the icon and chooses it, and the Task bar button picks the chosen one for the next slot of
// the bar tapped, as the bag's and the skill window's do (the window closes, which uncovers the quick slots).

import { chatEmoticonKey } from '@flyffweb/formats';
import { EMOTICON_COUNT, MOTIONS, emoticonLine } from '../motion/motionTable';
import { themeKey } from './art';
import type { UiArt } from './art';
import { place } from './button';
import type { ControlRect } from './button';
import { WindowFrame } from './frame';
import { createTooltip, positionItemDetails } from './itemDetails';
import { byFinger } from './slotGestures';
import type { MotionCarried } from './taskBar';
import { TAB_TILE, TAB_TILE_HEIGHT, editTiles, tabStrip } from './tiles';

/** APP_MOTION's size, and WIDC_TABCTRL1 in its client area. */
const WIDTH = 304;
const HEIGHT = 320;
const TABS: ControlRect = { left: 8, top: 8, width: 292, height: 266 };
/** `rect.right -= 15`: the tab control's tiles and strip stop 15 px short of its right (WndControl.cpp:4326, :4223). */
const SHORT = 15;
/** The strip of tabs at the tab control's bottom, which the pages end above (`rect2.bottom -= 18`, :4467). */
const STRIP = 18;
/** The grid: 8 icons of 32 px a row, the first at (3, 7) (`OnDraw`, WndMotion.cpp:89-103). */
const COLUMNS = 8;
const CELL = 32;
const GRID_X = 3;
const GRID_Y = 7;

/** The phone's cells (a finger's), the grid's rows (27 motions, 29 emoticons), its margins, and the Task bar button. */
const PHONE_CELL = 40;
const PHONE_ROWS = Math.ceil(Math.max(MOTIONS.length, EMOTICON_COUNT) / COLUMNS);
const PHONE_TABS: ControlRect = { left: 8, top: 8, width: COLUMNS * PHONE_CELL + 2 * GRID_X, height: PHONE_ROWS * PHONE_CELL + 2 * GRID_X + TAB_TILE_HEIGHT };
const PHONE_BUTTON: ControlRect = { left: PHONE_TABS.left + PHONE_TABS.width - 120, top: PHONE_TABS.top + PHONE_TABS.height + 6, width: 120, height: 29 };
/** The client area: 4 left, 8 right; 18 caption + 4 top, 10 bottom (frame.ts). */
const PHONE_WIDTH = PHONE_TABS.left * 2 + PHONE_TABS.width + 12;
const PHONE_HEIGHT = PHONE_BUTTON.top + PHONE_BUTTON.height + 8 + 32;

/** What the window asks of the world screen. */
export interface MotionWindowHost {
  /** A text of the catalog ('' when it lacks it). */
  text(tid: string): string;
  /** `ObjectExecutor( SHORTCUT_MOTION, id )`. */
  useMotion(id: number): void;
  /** `ObjectExecutor( SHORTCUT_EMOTICON, index )`. */
  useEmoticon(index: number): void;
  /** The mouse's press on an icon, which a move turns into a drag to the task bar (`TaskBar.carryMotion`). */
  carry(carried: MotionCarried, event: PointerEvent): void;
  /** The phone's Task bar button: `carried` picked for the next slot tapped (`TaskBar.pickMotion`). */
  pick(carried: MotionCarried, within: Element): void;
  /** What a finger picked, if a motion or an emoticon (`TaskBar.pickedMotion`). */
  picked(): MotionCarried | null;
  /** The tooltip's lines of a motion or an emoticon (`motionTips.ts`). */
  tip(carried: MotionCarried): string[];
}

const same = (a: MotionCarried | null, b: MotionCarried | null): boolean =>
  a !== null && b !== null && (a.from === 'motions' ? b.from === 'motions' && a.motion === b.motion : b.from === 'emoticons' && a.emoticon === b.emoticon);

export class MotionWindow {
  readonly frame: WindowFrame;
  private readonly mobile: boolean;
  private readonly tabs: ControlRect;
  private readonly pages: HTMLElement[];
  private readonly cells: Array<{ element: HTMLButtonElement; carried: MotionCarried }> = [];
  private strip: HTMLElement;
  private tab = 0;
  /** The phone's chosen icon (its last tap), which the Task bar button picks. */
  private chosen: MotionCarried | null = null;
  private readonly taskBarButton: HTMLButtonElement | null;
  private tooltip: HTMLElement | null = null;

  constructor(private readonly art: UiArt, private readonly host: MotionWindowHost, private readonly doc: Document = document) {
    this.mobile = doc.defaultView?.matchMedia?.('(max-width: 1000px) and (pointer: coarse)').matches === true;
    this.tabs = this.mobile ? PHONE_TABS : TABS;
    const title = host.text('TID_APP_MOTION') || 'Motion';
    this.frame = new WindowFrame(title, art, this.mobile
      ? { width: PHONE_WIDTH, height: PHONE_HEIGHT, mobileScale: 1, fitWhole: true }
      : { width: WIDTH, height: HEIGHT }, doc);
    this.frame.element.classList.add('hud-motion');
    this.frame.element.toggleAttribute('data-phone', this.mobile);
    this.frame.onClose = () => this.hideTip();
    const body = this.frame.body;
    const drawn = this.mobile ? this.tabs.width : this.tabs.width - SHORT;
    // the tab control's edit tiles, every 8 px over its whole height (CWndTabCtrl::AdditionalSkinTexture, :4320-4365)
    const tiles = editTiles(doc, art, Math.trunc(drawn / TAB_TILE), Math.trunc(this.tabs.height / 8));
    tiles.classList.add('hud-motion-tiles');
    place(tiles, { ...this.tabs, width: drawn });
    body.append(tiles);
    const cell = this.mobile ? PHONE_CELL : CELL;
    const motions = MOTIONS.map((prop): [MotionCarried, string, string] => [{ from: 'motions', motion: prop.id }, themeKey(prop.icon), prop.desc]);
    const emoticons = Array.from({ length: EMOTICON_COUNT }, (_, i): [MotionCarried, string, string] =>
      [{ from: 'emoticons', emoticon: i }, chatEmoticonKey(i), emoticonLine(i)]);
    this.pages = [motions, emoticons].map((list, page) => {
      const element = doc.createElement('div');
      element.className = 'hud-motion-page';
      element.dataset.page = page === 0 ? 'motion' : 'emoticon';
      element.setAttribute('role', 'group');
      place(element, { left: this.tabs.left, top: this.tabs.top, width: drawn, height: this.tabs.height - STRIP });
      list.forEach(([carried, icon, label], i) => {
        const button = this.cell(carried, icon, label);
        place(button, { left: GRID_X + (i % COLUMNS) * cell, top: GRID_Y + Math.trunc(i / COLUMNS) * cell, width: cell, height: cell });
        element.append(button);
      });
      body.append(element);
      return element;
    });
    this.strip = this.makeStrip();
    body.append(this.strip);
    if (this.mobile) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'hud-motion-taskbar';
      button.dataset.button = 'taskbar';
      button.textContent = 'Task bar';
      button.setAttribute('aria-pressed', 'false');
      button.disabled = true;
      place(button, PHONE_BUTTON);
      button.addEventListener('click', () => this.pickChosen());
      body.append(button);
      this.taskBarButton = button;
    } else {
      this.taskBarButton = null;
    }
    this.showTab(0);
  }

  get isOpen(): boolean {
    return this.frame.isOpen;
  }

  /** O, the Start menu, an applet slot: opened at the screen's top left, as Neuz moves it there (`Move( point )`, :46-51), or closed. */
  toggle(): void {
    if (this.frame.isOpen) this.frame.close();
    else {
      this.frame.open(this.mobile ? 'center' : { x: 0, y: 0 });
      this.refresh();
    }
  }

  /** The chosen tab: 0 Motion, 1 Emoticon. */
  showTab(tab: number): void {
    this.tab = tab;
    this.pages.forEach((page, i) => { page.hidden = i !== tab; });
    this.drawIcons(this.pages[tab]);
    const strip = this.makeStrip();
    this.strip.replaceWith(strip);
    this.strip = strip;
    this.hideTip();
  }

  get currentTab(): number {
    return this.tab;
  }

  /** The marks of the phone's chosen icon and of the one picked for the bar, and the Task bar button's state. */
  refresh(): void {
    const picked = this.host.picked();
    for (const { element, carried } of this.cells) {
      element.toggleAttribute('data-chosen', same(carried, this.chosen));
      element.toggleAttribute('data-picked', same(carried, picked));
    }
    if (this.taskBarButton !== null) {
      this.taskBarButton.disabled = this.chosen === null;
      this.taskBarButton.setAttribute('aria-pressed', String(same(this.chosen, picked)));
    }
  }

  private makeStrip(): HTMLElement {
    const titles = [this.host.text('TID_GAME_TOOLTIP_MOTION') || 'Motion', this.host.text('TID_GAME_TOOLTIP_EMOTICON') || 'Emoticon'];
    const width = this.mobile ? this.tabs.width : this.tabs.width - SHORT;
    const strip = tabStrip(this.doc, this.art, width, titles, this.tab, (tab) => this.showTab(tab));
    strip.classList.add('hud-motion-tabs');
    strip.style.left = `${this.tabs.left}px`;
    strip.style.top = `${this.tabs.top + this.tabs.height - TAB_TILE_HEIGHT}px`;
    return strip;
  }

  /** An icon of a grid: its picture, its name for a screen reader, its presses. */
  private cell(carried: MotionCarried, icon: string, label: string): HTMLButtonElement {
    const button = this.doc.createElement('button');
    button.type = 'button';
    button.className = 'hud-motion-cell';
    if (carried.from === 'motions') button.dataset.motion = String(carried.motion);
    else button.dataset.emoticon = String(carried.emoticon);
    button.setAttribute('aria-label', label);
    button.dataset.icon = icon; // drawn when its tab is first shown (`drawIcons`): a picture not converted yet is named then
    button.tabIndex = -1;
    button.addEventListener('mousedown', (event) => event.preventDefault());
    let finger = false;
    button.addEventListener('pointerdown', (event) => {
      finger = byFinger(event);
      if (!finger && event.button === 0) this.host.carry(carried, event);
    });
    button.addEventListener('click', () => {
      this.hideTip();
      if (finger) {
        this.chosen = carried;
        this.refresh();
      }
      if (carried.from === 'motions') this.host.useMotion(carried.motion);
      else this.host.useEmoticon(carried.emoticon);
    });
    button.addEventListener('pointerenter', (event) => { if (!byFinger(event)) this.showTip(carried, button); });
    button.addEventListener('pointerleave', () => this.hideTip());
    this.cells.push({ element: button, carried });
    return button;
  }

  /** The icons of `page`, the first time it is shown (their pictures looked up then). */
  private drawIcons(page: HTMLElement | undefined): void {
    for (const cell of page?.querySelectorAll<HTMLElement>('.hud-motion-cell[data-icon]') ?? []) {
      const url = this.art.url(cell.dataset.icon!);
      if (url !== '') cell.style.setProperty('--motion-icon', `url(${JSON.stringify(url)})`);
      delete cell.dataset.icon;
    }
  }

  /** The phone's Task bar button: the chosen icon picked for the bar, and the window closed. */
  private pickChosen(): void {
    const chosen = this.chosen;
    if (chosen === null) return;
    this.frame.close();
    this.host.pick(chosen, this.frame.element);
  }

  private showTip(carried: MotionCarried, anchor: HTMLElement): void {
    this.hideTip();
    const lines = this.host.tip(carried);
    if (lines.length === 0) return;
    const tip = createTooltip(this.doc, this.art, lines.map((text) => [{ text, color: 0x000000 }]));
    tip.classList.add('hud-taskbar-tooltip', 'hud-motion-tooltip');
    this.doc.body.append(tip);
    positionItemDetails(tip, anchor, this.doc);
    this.tooltip = tip;
  }

  private hideTip(): void {
    this.tooltip?.remove();
    this.tooltip = null;
  }
}

// The beauty shop's windows (2026-11-15, docs/2026-11-15-beauty-shop-research.md §2-§3): the Hair Designer's hair window
// (APP_BEAUTY_SHOP_EX, "Hair Shop") and the Makeup Artist's face window (APP_BEAUTY_SHOP_SKIN, "Plastic Surgery"), the box
// that asks before paying (APP_BEAUTY_SHOP_EX_CONFIRM, "Confirm Purchase") and the free coupon's question (the same
// layout, "Use Coupon").
//
//   Class                    File:lines                          what
//   CWndBeautyShop           _Interface/WndShop.cpp:965-2206     the hair window: two models, four styles, three bars
//   CWndUseCouponConfirm     WndShop.cpp:2208-2350               the coupon's question: flag 0 from the bag (Yes opens a
//                                                                window with the coupon on), flag 1 from OK (Yes sends)
//   CWndBeautyShopConfirm    WndShop.cpp:2353-2486               the price's question (Yes sends and closes the window)
//   CWndFaceShop             WndShop.cpp:2488-3091               the face window: two models, two rows of four faces
//   CDPClient::SendSetHair   Neuz/DPClient.cpp:14057-14083       a disguise sends nothing (TID_GAME_ERROR_BEAUTYSHOP_DISGUISE)
//   CDPClient::SendChangeFace DPClient.cpp:2651-2672             likewise
//
// The windows open beside the bag (`OnInitialUpdate`: left of it when its left edge is past half the window's width).
// Moving does not close them. The server answers with SET_HAIR or CHANGEFACE (the look changes, WorldScreen) or a text.

import type { UiArt } from '../hud/art';
import { themeKey, themeUrl } from '../hud/art';
import { ResWindow } from '../hud/resWindow';
import type { ResControl, ResLayout } from '../hud/resWindow';
import { withCommas } from '../vendor/vendorRules';
import { BeautyPictures, FACE_VIEW, HAIR_VIEW } from './beautyPictures';
import type { BeautyPicturesHost, LookChange } from './beautyPictures';
import {
  channelByte, channelsOf, colorCost, confirmText, dragChannel, editNumber, faceCost, faceRowsFor, friendlyRow, hairCost,
  hairRow, knobX, newRow, okAnswer, sameBytes, stepFriendly, stepHair, stepNew, typedChannel,
} from './beautyRules';
import type { Channels } from './beautyRules';

const EDIT = 'WndEditTile00.tga';
const KNOB = 'yellowbuttten.tga';
/** The knob's half width (`m_Texture.m_size.cx / 2`, yellowbuttten.tga is 11 x 11). */
const KNOB_HALF = 5;
/** OnMouseWndSurface's area (:1827): a drag that leaves it stops. */
const DRAG_AREA = { left: 44, top: 198, right: 186, bottom: 398 } as const;

const button = (id: string, rect: ResControl['rect'], picture: string, label: string, quarter = 72): ResControl =>
  ({ kind: 'button', id, rect, picture, label, quarter });
const custom = (id: string, rect: ResControl['rect']): ResControl => ({ kind: 'custom', id, rect });
const label = (id: string, rect: ResControl['rect'], text: string): ResControl => ({ kind: 'static', id, rect, text });

/** The four style boxes, the face rows' boxes. */
const HAIR_BOXES = ['WIDC_CUSTOM1', 'WIDC_CUSTOM2', 'WIDC_CUSTOM3', 'WIDC_CUSTOM4'] as const;
const FRIENDLY_BOXES = HAIR_BOXES;
const NEW_BOXES = ['WIDC_CUSTOM7', 'WIDC_CUSTOM8', 'WIDC_CUSTOM9', 'WIDC_CUSTOM10'] as const;
const BARS = ['WIDC_CUSTOM_R', 'WIDC_CUSTOM_G', 'WIDC_CUSTOM_B'] as const;
const EDITS = ['WIDC_EDIT1', 'WIDC_EDIT2', 'WIDC_EDIT3'] as const;
/** The bars' rects (`m_ColorRect`, the controls' own: :1596-1621 sets them to the rects). */
const BAR_RECTS = [[44, 294, 164, 310], [44, 316, 164, 332], [44, 336, 164, 352]] as const;

/** APP_BEAUTY_SHOP_EX (`Resource/resdata.inc:6125-6361`): 464 x 464, its picture not tiled. */
export const HAIR_LAYOUT: ResLayout = {
  title: 'Hair Shop', width: 464, height: 464, texture: 'WndBeautyShop_EX.tga',
  controls: [
    custom('WIDC_CUSTOM5', [28, 54, 180, 174]),
    custom('WIDC_CUSTOM6', [274, 54, 426, 174]),
    button('WIDC_OK', [146, 390, 218, 410], 'ButOk2.bmp', 'OK'),
    button('WIDC_CANCEL', [242, 390, 314, 410], 'ButCancel2.bmp', 'Cancel'),
    button('WIDC_BUTTON1', [22, 390, 94, 410], 'reset.bmp', 'Reset'),
    custom('WIDC_CUSTOM1', [52, 202, 126, 276]),
    custom('WIDC_CUSTOM2', [144, 202, 218, 276]),
    custom('WIDC_CUSTOM3', [236, 202, 310, 276]),
    custom('WIDC_CUSTOM4', [326, 202, 400, 276]),
    button('WIDC_HAIRSTYLE_LEFT', [8, 214, 28, 255], 'ButtLeftH.tga', 'Previous hair styles', 20),
    button('WIDC_HAIRSTYLE_RIGHT', [424, 216, 444, 257], 'ButtRightH.tga', 'Next hair styles', 20),
    label('WIDC_STATIC1', [336, 288, 432, 304], '0'),
    label('WIDC_STATIC2', [336, 318, 432, 334], '0'),
    label('WIDC_COST', [336, 348, 432, 364], '0'),
    label('WIDC_STATIC5', [238, 288, 332, 302], 'Style Price :'),
    label('WIDC_STATIC6', [238, 318, 332, 334], 'Color Price : '),
    label('WIDC_STATIC7', [278, 348, 332, 364], 'Total :'),
    custom('WIDC_CUSTOM_R', BAR_RECTS[0]),
    custom('WIDC_CUSTOM_G', BAR_RECTS[1]),
    custom('WIDC_CUSTOM_B', BAR_RECTS[2]),
    { kind: 'edit', id: 'WIDC_EDIT1', rect: [198, 292, 227, 308], tile: EDIT, maxLength: 3 },
    { kind: 'edit', id: 'WIDC_EDIT2', rect: [198, 314, 227, 330], tile: EDIT, maxLength: 3 },
    { kind: 'edit', id: 'WIDC_EDIT3', rect: [198, 336, 227, 352], tile: EDIT, maxLength: 3 },
    label('WIDC_STATIC3', [78, 366, 134, 382], 'Hair Color'),
    label('WIDC_STATIC4', [60, 182, 116, 198], 'Hair Style'),
  ],
};

/** APP_BEAUTY_SHOP_SKIN (`Resource/resdata.inc:6362-6544`): 464 x 464, its picture not tiled. */
export const FACE_LAYOUT: ResLayout = {
  title: 'Plastic Surgery', width: 464, height: 464, texture: 'WndBeautyShopSkin_EX.tga',
  controls: [
    custom('WIDC_CUSTOM5', [28, 54, 180, 174]),
    custom('WIDC_CUSTOM6', [272, 54, 424, 174]),
    custom('WIDC_CUSTOM1', [54, 214, 128, 288]),
    custom('WIDC_CUSTOM2', [146, 214, 220, 288]),
    custom('WIDC_CUSTOM3', [238, 214, 312, 288]),
    custom('WIDC_CUSTOM4', [330, 214, 404, 288]),
    custom('WIDC_CUSTOM7', [54, 314, 128, 388]),
    custom('WIDC_CUSTOM8', [146, 314, 220, 388]),
    custom('WIDC_CUSTOM9', [238, 314, 312, 388]),
    custom('WIDC_CUSTOM10', [330, 314, 404, 388]),
    button('WIDC_FRIENDSHIPFACE_LEFT', [20, 232, 40, 273], 'ButtLeftH.tga', 'Previous friendly faces', 20),
    button('WIDC_NEWFACE_LEFT', [20, 332, 40, 373], 'ButtLeftH.tga', 'Previous new faces', 20),
    button('WIDC_FRIENDSHIPFACE_RIGHT', [414, 230, 434, 271], 'ButtRightH.tga', 'Next friendly faces', 20),
    button('WIDC_NEWFACE_RIGHT', [414, 332, 434, 373], 'ButtRightH.tga', 'Next new faces', 20),
    button('WIDC_BTN_OK', [148, 398, 220, 418], 'ButOk2.bmp', 'OK'),
    button('WIDC_BTN_CANCEL', [242, 398, 314, 418], 'ButCancel2.bmp', 'Cancel'),
    button('WIDC_BTN_RESET', [22, 398, 94, 418], 'reset.bmp', 'Reset'),
    label('WIDC_STATIC1', [56, 192, 152, 208], 'Friendly Face'),
    label('WIDC_STATIC2', [56, 292, 152, 308], 'New Face'),
  ],
};

/** APP_BEAUTY_SHOP_EX_CONFIRM (`Resource/resdata.inc:6545-6575`): 288 x 128, tiled; its title set by the class. */
export const CONFIRM_LAYOUT: ResLayout = {
  title: 'Confirm Purchase', width: 288, height: 128,
  controls: [
    button('WIDC_YES', [56, 70, 128, 90], 'ButtYes.tga', 'Yes'),
    button('WIDC_NO', [152, 70, 224, 90], 'ButtNo.tga', 'No'),
    { kind: 'text', id: 'WIDC_TEXT1', rect: [10, 12, 270, 64], tile: EDIT },
  ],
};

/** The own player as the windows read it: `m_dwHairMesh` and `m_dwHeadMesh` (0-based), the drawn hair colour. */
export interface BeautyPlayer {
  playerId: number;
  hairMesh: number;
  /** 0xAARRGGBB as drawn (`m_fHairColorR/G/B`: a white colour is already its style's default). */
  hairColor: number;
  headMesh: number;
}

export interface BeautyHost {
  text(tid: string): string;
  player(): BeautyPlayer | null;
  /** `HasBuffByIk3( IK3_TEXT_DISGUISE )`. */
  disguised(): boolean;
  say(tid: string): void;
  sendSetHair(hair: number, r: number, g: number, b: number, useCoupon: boolean): void;
  sendChangeFace(playerId: number, face: number, cost: number, useCoupon: boolean): void;
  /** The bag (`CreateApplet( APP_INVENTORY )`) and its place in the layer, for the window's. */
  openBag(): void;
  bagRect(): { x: number; y: number; width: number } | null;
  mobile(): boolean;
  pictures: BeautyPicturesHost;
  ui: { art: UiArt; doc: Document; layer(): HTMLElement | null };
}

export type BeautyKind = 'hair' | 'face';

/** A window's box over another: the price's or the coupon's question, its Yes. */
class QuestionBox {
  readonly window: ResWindow;
  private yes: () => void = () => {};

  constructor(private readonly host: BeautyHost) {
    this.window = new ResWindow(CONFIRM_LAYOUT, host.ui.art, host.ui.doc);
    this.window.frame.element.classList.add('hud-beauty-confirm');
    this.window.button('WIDC_YES').onclick = () => {
      const yes = this.yes;
      this.close();
      yes();
    };
    this.window.button('WIDC_NO').onclick = () => this.close();
    this.window.onClose = () => { this.yes = () => {}; };
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  /**
   * Opens it with `title` and its words, centred on `parent` (`MoveParentCenter`: the shop window it was made for), or on
   * the screen with none (the bag's coupon question, made with no parent). Yes runs `yes`, No and the close button nothing.
   */
  ask(title: string, words: Array<Node | string>, yes: () => void, parent?: HTMLElement): void {
    const layer = this.host.ui.layer();
    if (layer !== null && this.window.element.parentElement !== layer) layer.append(this.window.element);
    this.window.frame.setTitle(title);
    this.window.setContent('WIDC_TEXT1', ...words);
    this.yes = yes;
    let at: { x: number; y: number } | 'center' = 'center';
    if (parent !== undefined && layer !== null && !this.host.mobile()) {
      const box = parent.getBoundingClientRect(), origin = layer.getBoundingClientRect();
      const { width, height } = CONFIRM_LAYOUT;
      at = { x: Math.round(box.left - origin.left + (box.width - width) / 2), y: Math.round(box.top - origin.top + (box.height - height) / 2) };
    }
    this.window.open(at);
  }

  close(): void {
    this.window.close();
  }
}

/** One of the two windows: what both do (beside the bag, the pictures, OK's questions, the coupon in the title). */
abstract class ShopWindow {
  protected window: ResWindow | null = null;
  protected coupon = false;
  protected readonly pictures: BeautyPictures;

  constructor(protected readonly host: BeautyHost, private readonly layout: ResLayout, private readonly className: string,
    protected readonly confirm: QuestionBox) {
    this.pictures = new BeautyPictures(host.pictures, host.ui.doc);
  }

  get isOpen(): boolean {
    return this.window?.isOpen === true;
  }

  /** Whether the window was opened with a coupon (`m_bUseCoupon`). */
  get usingCoupon(): boolean {
    return this.isOpen && this.coupon;
  }

  /**
   * `Initialize` and `OnInitialUpdate`: the bag, then the window beside it, from the player's look. A phone shows the
   * window alone in the middle (its compact panel, style.css): no bag item is used here, and the bag would take its room.
   */
  open(coupon: boolean): void {
    const window = this.make();
    this.coupon = coupon;
    this.reset();
    // UseHairCoupon / UseFaceCoupon: "  Using the Free Coupon." after the title
    window.frame.setTitle(coupon ? `${this.layout.title}  ${this.host.text('TID_GAME_NOWUSING_COUPON')}` : this.layout.title);
    const phone = this.host.mobile();
    if (!phone) this.host.openBag();
    const bag = this.host.bagRect();
    const width = this.layout.width;
    window.open(bag === null || phone ? 'center' : { x: bag.x > width / 2 ? bag.x - width : bag.x + bag.width, y: bag.y });
    this.draw();
  }

  close(): void {
    this.window?.close();
  }

  /** Each frame: the turning model, and the pictures again when the look changed (`UpdateModels`, DPClient.cpp:2441-2446). */
  frame(now: number): void {
    if (!this.isOpen) return;
    this.pictures.frame(now);
    if (now - this.lastLookCheck > 500) {
      this.lastLookCheck = now;
      this.drawPictures();
    }
  }

  private lastLookCheck = 0;

  protected abstract reset(): void;
  protected abstract wire(window: ResWindow): void;
  protected abstract draw(): void;
  protected abstract drawPictures(): void;

  /**
   * OK's answer (`okAnswer`): the coupon's question (flag 1), the price's, or the window closed. Each Yes sends (unless a
   * disguise is on: its text, nothing sent) and closes the window.
   */
  protected ok(cost: number, changed: boolean, send: () => void, face: boolean): void {
    const answer = okAnswer(cost, this.coupon, changed);
    if (answer.kind === 'close') {
      this.close();
      return;
    }
    const yes = (): void => {
      if (this.host.disguised()) this.host.say('TID_GAME_ERROR_BEAUTYSHOP_DISGUISE');
      else send();
      this.close();
    };
    if (answer.kind === 'coupon') {
      this.confirm.ask(this.host.text('TID_GAME_USE_CHANGE_COUPON'), couponWords(this.host, true), yes, this.window?.frame.element);
      return;
    }
    this.confirm.ask(CONFIRM_LAYOUT.title, [confirmText((tid) => this.host.text(tid), face, answer.cost)], yes,
      this.window?.frame.element);
  }

  private make(): ResWindow {
    if (this.window === null) {
      // a phone's panel is the tiled V15 frame (the 464 px picture cannot frame it); its boxes and bars keep their pieces
      // of the picture (`crop`)
      const phone = this.host.mobile();
      const window = new ResWindow(phone ? { ...this.layout, texture: undefined } : this.layout, this.host.ui.art, this.host.ui.doc);
      window.frame.element.classList.add('hud-beauty', this.className);
      if (phone && this.layout.texture !== undefined) {
        for (const control of this.layout.controls) {
          if (control.kind === 'custom') crop(window.control(control.id), this.host.ui.art, this.layout.texture, control.rect);
        }
      }
      window.onClose = () => {
        this.confirm.close();
        this.pictures.clear();
      };
      this.window = window;
      this.wire(window);
    }
    const layer = this.host.ui.layer();
    if (layer !== null && this.window.element.parentElement !== layer) layer.append(this.window.element);
    return this.window;
  }
}

/**
 * The window picture's piece under a control (the client area is 4 px in and 22 px down in the picture: the 18 px caption
 * and the 4 px edges, frame.ts), as the control's own background: a phone's boxes and colour bars.
 */
function crop(element: HTMLElement, art: UiArt, texture: string, [left, top]: ResControl['rect']): void {
  element.style.backgroundImage = themeUrl(art, texture);
  element.style.backgroundPosition = `${-(left + 4)}px ${-(top + 22)}px`;
  element.style.backgroundRepeat = 'no-repeat';
}

/** The coupon's words: flag 0's question, or flag 1's with the red warning under it (`OnInitialUpdate`, :2257-2290). */
function couponWords(host: BeautyHost, send: boolean): Array<Node | string> {
  if (!send) return [host.text('TID_GAME_ASKUSE_COUPON1')];
  const warning = host.ui.doc.createElement('span');
  warning.className = 'hud-beauty-warning';
  warning.textContent = host.text('TID_GAME_WARNNING_USE_COUPON');
  return [host.text('TID_GAME_ASKUSE_COUPON2'), '\n', warning];
}

/** CWndBeautyShop: the hair window. */
export class HairWindow extends ShopWindow {
  /** `m_dwHairMesh`: the first style of the row (1-based). */
  first = 1;
  /** `m_dwSelectHairMesh`: the chosen style (1-based). */
  chosen = 1;
  /** `m_fColor`: the chosen colour's channels. */
  color: [number, number, number] = [1, 1, 1];
  /** `m_ColorScrollBar[i].x` and `m_OriginalColorScrollBar[i].x`. */
  private knobs = [0, 0, 0];
  private originalKnobs = [0, 0, 0];
  /** `m_ChoiceBar`: the bar held, or -1. */
  private held = -1;

  constructor(host: BeautyHost, confirm: QuestionBox) {
    super(host, HAIR_LAYOUT, 'hud-beauty-hair', confirm);
  }

  /** The player's colour (`g_pPlayer->m_fHairColorR/G/B`). */
  private playerChannels(): Channels {
    return channelsOf(this.host.player()?.hairColor ?? 0xffffffff);
  }

  /** The prices shown (`OnDraw`): the style's, the colour's, and their sum. */
  get prices(): { hair: number; color: number; total: number } {
    const player = this.host.player();
    const hair = hairCost(player?.hairMesh ?? 0, this.chosen, this.coupon);
    const color = colorCost(this.playerChannels(), this.color, this.coupon);
    return { hair, color, total: hair + color };
  }

  /** `Initialize` and WIDC_BUTTON1 (Reset): the player's style and colour, no price; the knobs at their places. */
  protected reset(): void {
    const player = this.host.player();
    this.first = (player?.hairMesh ?? 0) + 1;
    this.chosen = this.first;
    this.color = [...this.playerChannels()];
    this.held = -1;
    this.resetKnobs();
    this.originalKnobs = [...this.knobs];
    if (this.window !== null) EDITS.forEach((id, i) => { this.window!.input(id).value = String(editNumber(this.color[i]!)); });
  }

  private resetKnobs(): void {
    this.knobs = BAR_RECTS.map(([left, , right], i) => knobX(this.color[i]!, left, right));
  }

  /** A style box pressed (`OnLButtonDown`): that style chosen. */
  choose(box: number): void {
    const style = hairRow(this.first)[box];
    if (style === undefined) return;
    this.chosen = style;
    this.draw();
  }

  /** The arrows: the row one style back or on. */
  step(step: -1 | 1): void {
    this.first = stepHair(this.first, step);
    this.draw();
  }

  /** A typed number in an edit (`SetRGBToBar`): the channel, the edit held to 0..254, every knob placed again. */
  typed(bar: number): void {
    const input = this.window?.input(EDITS[bar]!);
    if (input === undefined) return;
    const { channel, shown } = typedChannel(input.value);
    if (shown !== null) input.value = shown;
    this.color[bar] = channel;
    this.resetKnobs();
    this.draw();
  }

  /**
   * A press (`bar`: the bar pressed, or null for anywhere else) or a move while a bar is held, at `x`, `y` px from the held
   * bar's top left (`OnLButtonDown`, `OnMouseWndSurface`): the point is the window's (the bar's rect added), so that a
   * drag leaving OnMouseWndSurface's area stops, wherever a phone's panel put the bar.
   */
  pointer(bar: number | null | undefined, x: number, y: number): void {
    if (bar !== undefined) this.held = bar ?? -1;
    if (this.held < 0) return;
    const [left, top, right] = BAR_RECTS[this.held]!;
    const wx = left + x, wy = top + y;
    if (wx < DRAG_AREA.left || wx >= DRAG_AREA.right || wy < DRAG_AREA.top || wy >= DRAG_AREA.bottom) {
      this.held = -1;
      return;
    }
    const at = Math.min(wx, right);
    this.color[this.held] = dragChannel(at - left, right - left);
    this.knobs[this.held] = at;
    this.window!.input(EDITS[this.held]!).value = String(editNumber(this.color[this.held]!));
    this.draw();
  }

  /** The button let go (`OnLButtonUp`). */
  release(): void {
    this.held = -1;
  }

  /** WIDC_OK (:2109-2167). */
  okPressed(): void {
    const player = this.host.player();
    const changed = (player?.hairMesh ?? 0) !== this.chosen - 1 || !sameBytes(this.playerChannels(), this.color);
    const hair = this.chosen - 1, [r, g, b] = this.color.map(channelByte) as [number, number, number];
    this.ok(this.prices.total, changed, () => this.host.sendSetHair(hair, r, g, b, this.coupon), false);
  }

  protected wire(window: ResWindow): void {
    const body = window.frame.body;
    HAIR_BOXES.forEach((id, box) => {
      const element = window.control(id);
      element.classList.add('hud-beauty-box');
      element.dataset.beautyHair = String(box);
      element.addEventListener('click', () => this.choose(box));
    });
    window.button('WIDC_HAIRSTYLE_LEFT').onclick = () => this.step(-1);
    window.button('WIDC_HAIRSTYLE_RIGHT').onclick = () => this.step(1);
    window.button('WIDC_BUTTON1').onclick = () => { this.reset(); this.draw(); };
    window.button('WIDC_OK').onclick = () => this.okPressed();
    window.button('WIDC_CANCEL').onclick = () => this.close();
    EDITS.forEach((id, bar) => {
      const input = window.input(id);
      input.inputMode = 'numeric';
      input.addEventListener('input', () => this.typed(bar));
    });
    for (const id of ['WIDC_STATIC5', 'WIDC_STATIC6', 'WIDC_STATIC7']) window.control(id).parentElement!.classList.add('is-right');
    for (const id of ['WIDC_STATIC1', 'WIDC_STATIC2', 'WIDC_COST']) window.control(id).parentElement!.classList.add('is-money');
    // the knobs (yellowbuttten.tga) and their faded copies at the first places, in their bars
    const doc = this.host.ui.doc;
    BARS.forEach((id, bar) => {
      const element = window.control(id);
      element.dataset.beautyBar = String(bar);
      for (const faded of [true, false]) {
        const knob = doc.createElement('img');
        knob.className = faded ? 'hud-beauty-knob is-original' : 'hud-beauty-knob';
        knob.dataset.bar = String(bar);
        knob.alt = '';
        knob.draggable = false;
        knob.src = this.host.ui.art.url(themeKey(KNOB));
        element.append(knob);
      }
    });
    // a press on a bar and the drag: the point from the held bar's top left, its scale (a phone's zoom) taken out by the
    // bar's own width
    const point = (event: PointerEvent): { x: number; y: number } => {
      const bar = Math.max(0, this.held);
      const rect = window.control(BARS[bar]!).getBoundingClientRect();
      const [left, , right] = BAR_RECTS[bar]!;
      const scale = rect.width > 0 ? rect.width / (right - left) : 1;
      return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
    };
    body.addEventListener('pointerdown', (event) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-beauty-bar]') : null;
      this.held = target === null ? -1 : Number(target.dataset.beautyBar);
      if (this.held < 0) return;
      const { x, y } = point(event);
      this.pointer(this.held, x, y);
      event.preventDefault();
      body.setPointerCapture?.(event.pointerId);
    });
    body.addEventListener('pointermove', (event) => {
      if (this.held < 0) return;
      const { x, y } = point(event);
      this.pointer(undefined, x, y);
    });
    const up = (): void => this.release();
    body.addEventListener('pointerup', up);
    body.addEventListener('pointercancel', up);
  }

  /** OnDraw: the prices, the chosen box, the knobs, the pictures. */
  protected draw(): void {
    const window = this.window;
    if (window === null) return;
    const prices = this.prices;
    window.setText('WIDC_STATIC1', withCommas(prices.hair));
    window.setText('WIDC_STATIC2', withCommas(prices.color));
    window.setText('WIDC_COST', withCommas(prices.total));
    const row = hairRow(this.first);
    HAIR_BOXES.forEach((id, box) => {
      const element = window.control(id);
      element.toggleAttribute('data-chosen', row[box] === this.chosen);
      element.title = `${row[box]}`;
    });
    const knobs = window.frame.body.querySelectorAll<HTMLElement>('.hud-beauty-knob');
    for (const knob of knobs) {
      const bar = Number(knob.dataset.bar);
      const original = knob.classList.contains('is-original');
      const x = original ? this.originalKnobs[bar]! : this.knobs[bar]!;
      // in the bar: its x less the bar's left, at the bar's top (OnDraw :1410-1416)
      knob.style.left = `${x - BAR_RECTS[bar]![0] - KNOB_HALF}px`;
      knob.style.top = '0px';
      // the faded copy only once the knob left it (:1418-1422)
      if (original) knob.hidden = this.knobs[bar] === this.originalKnobs[bar];
    }
    this.drawPictures();
  }

  protected drawPictures(): void {
    const window = this.window;
    const player = this.host.player();
    if (window === null || player === null) return;
    this.pictures.setStill(window.control('WIDC_CUSTOM5'));
    const color = (0xff000000 | (channelByte(this.color[0]) << 16) | (channelByte(this.color[1]) << 8) | channelByte(this.color[2])) >>> 0;
    this.pictures.setTurning(window.control('WIDC_CUSTOM6'), { hairMesh: this.chosen - 1, hairColor: color });
    const row = hairRow(this.first);
    // each style in the player's own colour (DrawHairKind, :1530-1532)
    HAIR_BOXES.forEach((id, box) => {
      const change: LookChange = { hairMesh: row[box]! - 1 };
      this.pictures.setSmall(window.control(id), change, HAIR_VIEW);
    });
  }
}

/** CWndFaceShop: the face window. */
export class FaceWindow extends ShopWindow {
  /** `m_dwFriendshipFace` and `m_dwNewFace`: the rows' first faces. */
  friendly = 1;
  fresh = 6;
  /** `m_nSelectedFace` (1-based). */
  chosen = 1;

  constructor(host: BeautyHost, confirm: QuestionBox) {
    super(host, FACE_LAYOUT, 'hud-beauty-face', confirm);
  }

  /** `m_nCost`. */
  get cost(): number {
    return faceCost(this.host.player()?.headMesh ?? 0, this.chosen, this.coupon);
  }

  /** `Initialize` and WIDC_BTN_RESET: the rows from the player's face, it chosen, no price. */
  protected reset(): void {
    const head = this.host.player()?.headMesh ?? 0;
    const rows = faceRowsFor(head);
    this.friendly = rows.friendly;
    this.fresh = rows.fresh;
    this.chosen = head + 1;
  }

  /** A face box pressed (`OnLButtonDown`): 0-3 the friendly row's, 4-7 the new row's. */
  choose(box: number): void {
    const face = box < 4 ? friendlyRow(this.friendly)[box] : newRow(this.fresh)[box - 4];
    if (face === undefined) return;
    this.chosen = face;
    this.draw();
  }

  stepFriendly(step: -1 | 1): void {
    this.friendly = stepFriendly(this.friendly, step);
    this.draw();
  }

  stepNew(step: -1 | 1): void {
    this.fresh = stepNew(this.fresh, step);
    this.draw();
  }

  /** WIDC_BTN_OK (:3028-3081). */
  okPressed(): void {
    const player = this.host.player();
    if (player === null) return;
    const face = this.chosen - 1, cost = this.cost;
    this.ok(cost, player.headMesh !== face, () => this.host.sendChangeFace(player.playerId, face, cost, this.coupon), true);
  }

  protected wire(window: ResWindow): void {
    [...FRIENDLY_BOXES, ...NEW_BOXES].forEach((id, box) => {
      const element = window.control(id);
      element.classList.add('hud-beauty-box');
      element.dataset.beautyFace = String(box);
      element.addEventListener('click', () => this.choose(box));
    });
    window.button('WIDC_FRIENDSHIPFACE_LEFT').onclick = () => this.stepFriendly(-1);
    window.button('WIDC_FRIENDSHIPFACE_RIGHT').onclick = () => this.stepFriendly(1);
    window.button('WIDC_NEWFACE_LEFT').onclick = () => this.stepNew(-1);
    window.button('WIDC_NEWFACE_RIGHT').onclick = () => this.stepNew(1);
    window.button('WIDC_BTN_RESET').onclick = () => { this.reset(); this.draw(); };
    window.button('WIDC_BTN_OK').onclick = () => this.okPressed();
    window.button('WIDC_BTN_CANCEL').onclick = () => this.close();
  }

  protected draw(): void {
    const window = this.window;
    if (window === null) return;
    const friendly = friendlyRow(this.friendly), fresh = newRow(this.fresh);
    [...FRIENDLY_BOXES, ...NEW_BOXES].forEach((id, box) => {
      const face = box < 4 ? friendly[box] : fresh[box - 4];
      const element = window.control(id);
      element.toggleAttribute('data-chosen', face === this.chosen);
      element.title = `${face}`;
    });
    this.drawPictures();
  }

  protected drawPictures(): void {
    const window = this.window;
    if (window === null || this.host.player() === null) return;
    this.pictures.setStill(window.control('WIDC_CUSTOM5'));
    this.pictures.setTurning(window.control('WIDC_CUSTOM6'), { headMesh: this.chosen - 1 });
    const friendly = friendlyRow(this.friendly), fresh = newRow(this.fresh);
    [...FRIENDLY_BOXES, ...NEW_BOXES].forEach((id, box) => {
      const face = box < 4 ? friendly[box]! : fresh[box - 4]!;
      this.pictures.setSmall(window.control(id), { headMesh: face - 1 }, FACE_VIEW);
    });
  }
}

/** The two windows, their question box, and the coupon's question from the bag. */
export class BeautyShop {
  readonly hair: HairWindow;
  readonly face: FaceWindow;
  private readonly confirm: QuestionBox;
  /** `g_WndMng.m_pWndUseCouponConfirm`: the bag's coupon question (flag 0). */
  private readonly couponBox: QuestionBox;

  constructor(private readonly host: BeautyHost) {
    this.confirm = new QuestionBox(host);
    this.couponBox = new QuestionBox(host);
    this.hair = new HairWindow(host, this.confirm);
    this.face = new FaceWindow(host, this.confirm);
  }

  /** Either window open (`GetWndBase( APP_BEAUTY_SHOP_EX ) || GetWndBase( APP_BEAUTY_SHOP_SKIN )`). */
  get isOpen(): boolean {
    return this.hair.isOpen || this.face.isOpen;
  }

  open(kind: BeautyKind, coupon = false): void {
    (kind === 'hair' ? this.hair : this.face).open(coupon);
  }

  /**
   * A coupon used from the bag (`SendDoUseItem`, DPClient.cpp:10440-10458): its question, unless one is open already;
   * Yes opens the bag and the window with the coupon on. No DOUSEITEM is sent.
   */
  useCoupon(kind: BeautyKind): void {
    if (this.couponBox.isOpen) return;
    this.couponBox.ask(this.host.text('TID_GAME_USE_CHANGE_COUPON'), couponWords(this.host, false), () => this.open(kind, true));
  }

  frame(now: number): void {
    this.hair.frame(now);
    this.face.frame(now);
  }

  close(): void {
    this.hair.close();
    this.face.close();
    this.couponBox.close();
  }
}

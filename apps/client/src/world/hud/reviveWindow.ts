// The revive window (spec §3.5): `CWndRevival`, where the dead player picks where to come back to life. The own death
// opens it (`CDPClient::OnMoverDeath`, Neuz/DPClient.cpp:2060-2072), and so does Escape while dead (`CWndMgr::Process`,
// _Interface/WndManager.cpp:3311-3318, through `escapeStep`).
//
//   resdata.inc APP_REVIVAL         Resource/resdata.inc:10964-11011  "WndTile07.tga" tiled, 176 x 128, WBS_CAPTION | WBS_MOVE
//                                                                     | WBS_SOUND, titled "Revive" (IDS_RESDATA_INC_001138,
//                                                                     Resource/resData.txt.txt:1139), four buttons
//   CWndRevival::Initialize         _Interface/WndField.cpp:12253-12262  WBS_MODAL
//   CWndRevival::OnInitialUpdate    WndField.cpp:12173-12252          the tooltips (:12183-12187); Revive here only with a
//                                                                     resurrection scroll (:12193-12200); the title bar's
//                                                                     buttons hidden (:12219); __VER >= 9 puts Revive here in
//                                                                     the Lodelight's place and the Shop in Revive here's, and
//                                                                     hides the Lodelight (:12221-12245); at the middle of the
//                                                                     screen's width, 70 px down (:12247-12251)
//   CWndRevival::OnChildNotify      WndField.cpp:12295-12345          Lodestar sends REVIVAL_TO_LODESTAR (:12311-12320); every
//                                                                     button but the Shop destroys the window (:12342-12343)
//   CWndBase::GetWndBase            _Interface/WndBase.cpp:2048-2095  Escape passes over APP_REVIVAL
//
// WBS_MODAL: while the window is open, no other window, no press on the world and no key reach the game (its
// `ModalBackdrop`, modal.ts).
//
// Revive here (PACKETTYPE_REVIVAL) needs the resurrection scroll, an item of Piece 5: it is greyed, as Neuz greys it for a
// player who has none. The Shop opens the item mall's web box (`APP_WEBBOX`), which the browser does not have: greyed too.

import type { OwnEvent } from '../OwnState';
import type { UiArt } from './art';
import { pictureButton } from './button';
import type { ControlRect } from './button';
import { WindowFrame } from './frame';
import { ModalBackdrop } from './modal';

/** `APP_REVIVAL "WndTile07.tga" 1 176 128` (resdata.inc:10964). */
const WIDTH = 176;
const HEIGHT = 128;
/** `IDS_RESDATA_INC_001138` (resData.txt.txt:1139): the applet's title, which `CWndNeuz::OnInitialUpdate` sets (WndNeuz.cpp:210-216). */
const TITLE = 'Revive';
/** Where `OnInitialUpdate` puts it: 70 px down (:12250). */
const TOP = 70;
/**
 * The buttons' rectangles in the client area (resdata.inc:10974-11008) after `__VER >= 9`'s swap (:12221-12245): Lodestar
 * at WIDC_REVIVAL_TO_LODESTAR's, Revive here at WIDC_REVIVAL_TO_LODELIGHT's, the Shop at WIDC_REVIVAL_STAND's.
 */
const LODESTAR_AT: ControlRect = { left: 12, top: 12, width: 140, height: 20 };
const STAND_AT: ControlRect = { left: 12, top: 38, width: 140, height: 20 };
const SHOP_AT: ControlRect = { left: 12, top: 64, width: 140, height: 20 };
/** Each button's picture is 560 x 20: four states of 140 px. */
const QUARTER = 140;

/** The texts the window reads (the texts catalog). */
export type ReviveTexts = ReadonlyMap<string, { text: string }>;

/**
 * The revive window. Its `element` (its modal backdrop, `modal`, with the window in it) goes in the windows' layer;
 * `open` shows it at the middle of that layer's width, 70 px down; Lodestar calls `onLodestar` (REVIVAL_TO_LODESTAR) and
 * closes it. `modal.onChange` hears it open and close, for the world screen to let go of the controls.
 */
export class ReviveWindow {
  readonly frame: WindowFrame;
  readonly modal: ModalBackdrop;

  constructor(art: UiArt, texts: ReviveTexts, private readonly onLodestar: () => void, doc: Document = document) {
    const text = (id: string): string => texts.get(id)?.text ?? '';
    // m_wndTitleBar.SetVisible( FALSE ) (:12219): its caption is drawn, but it has no close button
    const frame = new WindowFrame(TITLE, art, { width: WIDTH, height: HEIGHT, closeButton: false }, doc);
    frame.element.classList.add('hud-revive');
    // Escape passes over it (GetWndBase)
    frame.escapeCloses = false;
    frame.onClose = () => this.modal.hide();

    const button = (name: string, picture: string, rect: ControlRect, tooltip: string, press: () => void) => {
      const element = pictureButton(doc, art, picture, rect, QUARTER, press);
      element.dataset.button = name;
      element.title = text(tooltip);
      return element;
    };
    const lodestar = button('lodestar', 'ButtLodestar.bmp', LODESTAR_AT, 'TID_GAME_TOOLTIP_LODESTAR', () => this.lodestar());
    // no resurrection scroll (II_SYS_SYS_SCR_RESURRECTION, :12193-12200): Piece 5's items
    const stand = button('stand', 'ButtReviveStand.bmp', STAND_AT, 'TID_GAME_TOOLTIP_OGNPOINT', () => {});
    stand.disabled = true;
    // the item mall's web box (:12334-12339) is not the browser's
    const shop = button('shop', 'ButtFlyffShop.tga', SHOP_AT, 'TID_GAME_TOOLTIP_SHOP', () => {});
    shop.disabled = true;
    frame.body.append(lodestar, stand, shop);
    this.frame = frame;
    this.modal = new ModalBackdrop(frame, doc);
  }

  /** The modal backdrop with the window in it: what goes in the windows' layer. */
  get element(): HTMLElement {
    return this.modal.element;
  }

  get isOpen(): boolean {
    return this.frame.isOpen;
  }

  /**
   * Shows the window at the middle of its layer's width, 70 px down (`( rectRoot.right - rectWindow.Width() ) / 2`,
   * :12247-12251), unless it is open (`m_pWndRevival == NULL`, DPClient.cpp:2062, WndManager.cpp:3313).
   */
  open(): void {
    if (this.isOpen) return;
    const width = this.modal.layerWidth;
    this.modal.show();
    this.frame.open({ x: Math.trunc((width - WIDTH) / 2), y: TOP });
  }

  /** What the own events open: the own death (`OnMoverDeath`, DPClient.cpp:2060-2072). */
  play(events: readonly OwnEvent[]): void {
    if (events.some((event) => event.kind === 'died')) this.open();
  }

  /** Closes it, and takes it off its layer. */
  dispose(): void {
    this.frame.close();
    this.element.remove();
  }

  /** Lodestar: `SendHdr( PACKETTYPE_REVIVAL_TO_LODESTAR )` and `Destroy()` (:12311-12320, :12342-12343), once. */
  private lodestar(): void {
    if (!this.isOpen) return;
    this.onLodestar();
    this.frame.close();
  }
}

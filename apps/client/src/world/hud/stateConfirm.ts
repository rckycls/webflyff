// The box that asks before the stat points are applied (spec §3.6, [stats §3.4]): `CWndStateConfirm` (APP_STATE_CONFIRM),
// which the Character window's Apply opens.
//
//   resdata.inc APP_STATE_CONFIRM      Resource/resdata.inc:1202-1240     "WndTile08.tga" tiled, 304 x 128, a caption, titled
//                                                                         "Change State" (IDS_RESDATA_INC_000000,
//                                                                         Resource/resData.txt.txt:1); the text WIDC_TEXT1
//                                                                         "WndEditTile00.tga" tiled, WIDC_YES, WIDC_NO
//   CWndStateConfirm::OnInitialUpdate  _Interface/WndField.cpp:4409-4454  TID_GAME_CHARSTATUS_APPLY_Q and, for a base job,
//                                                                         TID_DIAG_0082 on the next line; the middle of the
//                                                                         screen (MoveParentCenter, :4453)
//   CWndStateConfirm::Initialize       WndField.cpp:4456-4460             InitDialog with no style of its own: not WBS_MODAL
//   CWndStateConfirm::OnChildNotify    WndField.cpp:4485-4550             Yes sends MODIFY_STATUS (:4487-4502); No and the
//                                                                         close button close it (:4503-4510)
//   CNeuzApp::KillWindow               Neuz/Neuz.cpp:1495-1524            every key is the box's while it is open (:1262,
//                                                                         :1323): Escape closes it, Enter calls SendYes
//
// `SendYes` (WndField.cpp:4552-4556) is the old path: it sends INC_STAT_LEVEL with `m_nId` 0, which
// `CDPSrvr::OnIncStatLevel` drops (WORLDSERVER/DPSrvr.cpp, its `default: return`), and closes the box. The browser sends
// nothing on Enter: it closes the box, as the server's answer leaves it.

import type { UiArt } from './art';
import { pictureButton, place } from './button';
import type { ControlRect } from './button';
import { WindowFrame } from './frame';
import { holdKey } from './modal';
import { EDIT, editTiles } from './tiles';

/** `APP_STATE_CONFIRM "WndTile08.tga" 1 304 128` (resdata.inc:1202). */
const WIDTH = 304;
const HEIGHT = 128;
/** `IDS_RESDATA_INC_000000` (resData.txt.txt:1): the applet's title (`CWndNeuz::OnInitialUpdate`, WndNeuz.cpp:210-216). */
const TITLE = 'Change State';
/** Its controls (resdata.inc:1212-1238): the text `WIDC_TEXT1`, `WIDC_YES`, `WIDC_NO`. */
const TEXT: ControlRect = { left: 8, top: 8, width: 278, height: 52 };
const YES: ControlRect = { left: 56, top: 70, width: 72, height: 20 };
const NO: ControlRect = { left: 146, top: 70, width: 72, height: 20 };
/** ButtYes.tga and ButtNo.tga: 288 x 20, four states of 72 px. */
const QUARTER = 72;
/** A control's client area inside its frame (`CWndBase::SetWndRect`, `WndBase.cpp:1846-1853`): 4 4 8 10 in. */
const INSET = { left: 4, top: 4, right: 8, bottom: 10 } as const;

/** The texts the box reads (the texts catalog). */
export type StateConfirmTexts = ReadonlyMap<string, { text: string }>;

/**
 * The confirm box. Its `frame` goes in the windows' layer; `open` shows it at the middle of the layer with its text; Yes
 * calls `onYes` and closes it; No, its close button and Escape close it. It is not modal: the world and the other windows
 * take presses. But while it is open it holds every keydown (`KillWindow`).
 */
export class StateConfirm {
  readonly frame: WindowFrame;
  private readonly message: HTMLElement;
  private readonly doc: Document;

  constructor(art: UiArt, private readonly texts: StateConfirmTexts, private readonly onYes: () => void, doc: Document = document) {
    this.doc = doc;
    const frame = new WindowFrame(TITLE, art, { width: WIDTH, height: HEIGHT }, doc);
    frame.element.classList.add('hud-confirm');
    frame.onClose = () => this.listen(false);
    const box = doc.createElement('div');
    box.className = 'hud-confirm-box';
    place(box, TEXT);
    box.append(editTiles(doc, art, Math.trunc(TEXT.width / EDIT), Math.trunc(TEXT.height / EDIT)));
    const message = doc.createElement('div');
    message.className = 'hud-confirm-text';
    place(message, {
      left: INSET.left,
      top: INSET.top,
      width: TEXT.width - INSET.left - INSET.right,
      height: TEXT.height - INSET.top - INSET.bottom,
    });
    box.append(message);
    this.message = message;
    const button = (name: string, picture: string, rect: ControlRect, label: string, press: () => void) => {
      const element = pictureButton(doc, art, picture, rect, QUARTER, press);
      element.dataset.button = name;
      element.setAttribute('aria-label', this.text(label));
      return element;
    };
    const yes = button('yes', 'ButtYes.tga', YES, 'TID_GAME_YES', () => {
      if (!this.isOpen) return;
      this.onYes();
      this.close();
    });
    const no = button('no', 'ButtNo.tga', NO, 'TID_GAME_NO', () => this.close());
    frame.body.append(box, yes, no);
    this.frame = frame;
  }

  get isOpen(): boolean {
    return this.frame.isOpen;
  }

  /** Shows it at the middle of its layer (`MoveRectCenter` of the root window, WndBase.cpp:1805-1816); `baseJob`: add TID_DIAG_0082. */
  open(baseJob: boolean): void {
    let message = this.text('TID_GAME_CHARSTATUS_APPLY_Q');
    if (baseJob) message += `\n${this.text('TID_DIAG_0082')}`;
    this.message.textContent = message;
    const layer = this.frame.element.parentElement;
    const x = Math.trunc((layer?.clientWidth ?? 0) / 2) - WIDTH / 2;
    const y = Math.trunc((layer?.clientHeight ?? 0) / 2) - HEIGHT / 2;
    if (!this.isOpen) this.listen(true);
    this.frame.open({ x, y });
  }

  close(): void {
    this.frame.close();
  }

  private text(id: string): string {
    return this.texts.get(id)?.text ?? '';
  }

  private listen(on: boolean): void {
    const view = this.doc.defaultView ?? window;
    if (on) view.addEventListener('keydown', this.onKeyDown, true);
    else view.removeEventListener('keydown', this.onKeyDown, true);
  }

  /** `KillWindow`: every keydown is the box's; Escape and Enter close it. */
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    holdKey(event);
    if (event.repeat) return;
    if (event.key === 'Escape' || event.key === 'Enter') {
      event.preventDefault();
      this.close();
    }
  };
}

// The invite box (Piece 7 M4, [R §5.4]): `CWndPartyConfirm`, which a PARTYREQEST opens.
//
//   resdata.inc APP_PARTY_CONFIRM     Resource/resdata.inc:9824-9862        "WndTile08.tga" tiled, 288 x 128, "Confirm
//                                                                          Party"; WIDC_YES 64,68-136,88, WIDC_NO
//                                                                          148,68-220,88, WIDC_TEXT1 8,8-264,60
//                                                                          ("WndEditTile00.tga" tiled)
//   CWndPartyConfirm::OnInitialUpdate _Interface/WndPartyConfirm.cpp:44-70  TID_DIAG_0072 with the leader's name;
//                                                                          centred across, 70 px from the top
//   CWndPartyConfirm::OnChildNotify   WndPartyConfirm.cpp:102-120           Yes: ADDPARTYMEMBER with the request's values;
//                                                                          No and the close button: MEMBERREQUESTCANCLE 0
//
// No timer and no withdraw: only its buttons close it (plan Decisions 19). It answers once.

import type { MessageOf } from '@flyffweb/protocol';
import type { UiArt } from '../art';
import { pictureButton, place } from '../button';
import type { ControlRect } from '../button';
import { WindowFrame } from '../frame';
import { EDIT, editTiles } from '../tiles';

const WIDTH = 288;
const HEIGHT = 128;
/** The applet's title (resData.txt.txt, APP_PARTY_CONFIRM's). */
const TITLE = 'Confirm Party';
const TEXT: ControlRect = { left: 8, top: 8, width: 256, height: 52 };
const YES: ControlRect = { left: 64, top: 68, width: 72, height: 20 };
const NO: ControlRect = { left: 148, top: 68, width: 72, height: 20 };
/** ButtYes.tga and ButtNo.tga: 288 x 20, four states of 72 px. */
const QUARTER = 72;
/** A control's client area inside its frame (`CWndBase::SetWndRect`, `WndBase.cpp:1846-1853`): 4 4 8 10 in. */
const INSET = { left: 4, top: 4, right: 8, bottom: 10 } as const;
/** 70 px from the top (`WndPartyConfirm.cpp:67-70`). */
const TOP = 70;

type Request = MessageOf<'partyRequest'>;

export class PartyConfirm {
  readonly frame: WindowFrame;
  onYes: (request: Request) => void = () => {};
  onNo: (request: Request) => void = () => {};
  private readonly message: HTMLElement;
  /** The invite the box shows, until it is answered. */
  private request: Request | null = null;

  constructor(art: UiArt, doc: Document = document) {
    const frame = new WindowFrame(TITLE, art, { width: WIDTH, height: HEIGHT }, doc);
    frame.element.classList.add('hud-party-confirm');
    // the close button is No (WTBID_CLOSE, :113-117)
    frame.onClose = () => this.answer(false);
    const box = doc.createElement('div');
    box.className = 'hud-confirm-box';
    place(box, TEXT);
    box.append(editTiles(doc, art, Math.trunc(TEXT.width / EDIT), Math.trunc(TEXT.height / EDIT)));
    const message = doc.createElement('div');
    message.className = 'hud-party-confirm-text';
    place(message, {
      left: INSET.left, top: INSET.top, width: TEXT.width - INSET.left - INSET.right, height: TEXT.height - INSET.top - INSET.bottom,
    });
    box.append(message);
    this.message = message;
    const button = (name: string, label: string, picture: string, rect: ControlRect, yes: boolean) => {
      const element = pictureButton(doc, art, picture, rect, QUARTER, () => {
        this.answer(yes);
        frame.close();
      });
      element.dataset.button = name;
      element.setAttribute('aria-label', label);
      return element;
    };
    frame.body.append(box, button('yes', 'Yes', 'ButtYes.tga', YES, true), button('no', 'No', 'ButtNo.tga', NO, false));
    this.frame = frame;
  }

  get isOpen(): boolean {
    return this.frame.isOpen;
  }

  /** Shows the invite `request` with its text (TID_DIAG_0072 with the leader's name), centred across, 70 px down. */
  open(request: Request, text: string): void {
    this.request = request;
    this.message.textContent = text;
    const layer = this.frame.element.parentElement;
    this.frame.open({ x: Math.trunc(((layer?.clientWidth ?? 0) - WIDTH) / 2), y: TOP });
  }

  /** Closes it with no answer: the world it was opened in is gone (`PartyHud.dispose`). */
  dismiss(): void {
    this.request = null;
    this.frame.close();
  }

  private answer(yes: boolean): void {
    const request = this.request;
    if (request === null) return;
    this.request = null;
    if (yes) this.onYes(request);
    else this.onNo(request);
  }
}

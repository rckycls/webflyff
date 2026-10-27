// The box that asks before logging out (`CWndLogOut`, _Interface/WndField.cpp:11910-11983), a `CWndMessageBox` with OK
// and Cancel (_Interface/WndMessageBox.cpp:65-129, :198-206):
//
//   resdata.inc APP_MESSAGEBOX      Resource/resdata.inc:24534   "WndMessagebox.tga", 256 x 144, a caption, titled
//                                                                "Message Box" (IDS_RESDATA_INC_003100,
//                                                                Resource/resData.txt.txt:3101)
//   CWndMessageBox::Create          WndMessageBox.cpp:198-206    InitDialog with WBS_MODAL (:202); the title it sets from the
//                                                                text it is given (:201) is put back to the applet's by
//                                                                CWndNeuz::OnInitialUpdate (WndNeuz.cpp:210-216)
//   CWndLogOut::Initialize          WndField.cpp:11910-11932     Create with TID_DIAG_0068 (shown nowhere: the text is then
//                                                                TID_DIAG_0069), at the middle of the screen's width and
//                                                                70 px down
//   CWndMessageBox::OnInitialUpdate WndMessageBox.cpp:65-129     the text in the client area less 10 10 10 35, in black
//                                                                (:203); OK 70 px left of the middle and Cancel 10 px right
//                                                                of it, 30 px over the client area's bottom, each a quarter
//                                                                of its picture wide (ButtOk.tga, ButtCancel.tga, 288 x 20)
//   CWndLogOut::OnChildNotify       WndField.cpp:11933-11983     Cancel closes it; OK logs out
//
// WBS_MODAL: while the box is open no other window, no press on the world and no key reach the game, Escape included
// (`ModalBackdrop`, modal.ts); its buttons and its close button work.
//
// OK leaves the world as Piece 3's Leave does. Neuz logs out at once in a safe region or for a game master, and otherwise
// counts down first (`CWndLogOutWaitting`, :11963-11975); Piece 4 does not count down.

import type { UiArt } from './art';
import { pictureButton, place } from './button';
import { WindowFrame } from './frame';
import { ModalBackdrop } from './modal';

/** `APP_MESSAGEBOX "WndMessagebox.tga" 0 256 144` (resdata.inc:24534). */
const WIDTH = 256;
const HEIGHT = 144;
/** `IDS_RESDATA_INC_003100` (resData.txt.txt:3101): the applet's title. */
const TITLE = 'Message Box';
/** The client area of a window with a caption (`CWndBase::SetWndRect`, `WndBase.cpp:1846-1853`): 18 + 4 down, 4 in. */
const CLIENT_WIDTH = WIDTH - 4 - 8;
const CLIENT_HEIGHT = HEIGHT - 22 - 10;
/** The buttons: a quarter of their 288 x 20 picture (`FitTextureSize`, `WndControl.cpp:309-320`), 60 apart by Create's rect. */
const BUTTON_WIDTH = 72;
const BUTTON_HEIGHT = 20;
const BUTTON_SPACING = 60;
/** Where `CWndLogOut::Initialize` puts it: 70 px from the top (:11928). */
const TOP = 70;

/** The texts the box reads (the texts catalog). */
export type LogOutTexts = ReadonlyMap<string, { text: string }>;

/**
 * The log-out box. Its `element` (its modal backdrop, `modal`, with the box in it) goes in the windows' layer; `open`
 * shows it at the middle of the layer's width, 70 px down; OK calls `onOk` and closes it, Cancel and its close button
 * close it.
 */
export class LogOutBox {
  readonly frame: WindowFrame;
  readonly modal: ModalBackdrop;

  constructor(art: UiArt, texts: LogOutTexts, onOk: () => void, doc: Document = document) {
    const text = (id: string): string => texts.get(id)?.text ?? '';
    const frame = new WindowFrame(TITLE, art, { width: WIDTH, height: HEIGHT, texture: 'WndMessagebox.tga' }, doc);
    frame.element.classList.add('hud-logout');
    frame.onClose = () => this.modal.hide();
    const body = frame.body;
    const message = doc.createElement('div');
    message.className = 'hud-logout-text';
    message.textContent = text('TID_DIAG_0069');
    // the client area less 10 10 10 35 (:83), in the body's place (the body is the client area)
    place(message, { left: 10, top: 10, width: CLIENT_WIDTH - 20, height: CLIENT_HEIGHT - 45 });
    const middle = CLIENT_WIDTH / 2;
    const y = CLIENT_HEIGHT - 30;
    const button = (key: string, name: string, picture: string, left: number, press: () => void): HTMLButtonElement => {
      const rect = { left, top: y, width: BUTTON_WIDTH, height: BUTTON_HEIGHT };
      const element = pictureButton(doc, art, picture, rect, BUTTON_WIDTH, press);
      element.classList.add('hud-logout-button');
      element.dataset.button = key;
      element.setAttribute('aria-label', name);
      return element;
    };
    // rect2_1 and rect2_2 (:76-77); the names are the buttons' own ("OK", "CANCEL", :106-107), their pictures' words
    const ok = button('ok', 'OK', 'ButtOk.tga', middle - BUTTON_SPACING - 10, () => {
      frame.close();
      onOk();
    });
    const cancel = button('cancel', 'Cancel', 'ButtCancel.tga', middle + 10, () => frame.close());
    body.append(message, ok, cancel);
    this.frame = frame;
    this.modal = new ModalBackdrop(frame, doc);
  }

  /** The modal backdrop with the box in it: what goes in the windows' layer. */
  get element(): HTMLElement {
    return this.modal.element;
  }

  /** Shows the box at the middle of a layer `layerWidth` px wide, 70 px down (`CWndLogOut::Initialize`, :11926-11929). */
  open(layerWidth: number): void {
    this.modal.show();
    this.frame.open({ x: Math.trunc((layerWidth - WIDTH) / 2), y: TOP });
  }

  get isOpen(): boolean {
    return this.frame.isOpen;
  }

  /** Closes it, and takes it off its layer. */
  dispose(): void {
    this.frame.close();
    this.element.remove();
  }
}

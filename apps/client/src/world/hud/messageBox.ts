// Neuz's message box (Piece 7 M3, [R §5]): `CWndMessageBox` with OK, or OK and Cancel, its text given at the opening.
// The Scroll of Return's question (`CReturnScrollMsgBox`) and the guild war's Blinkwing refusal
// (`OpenMessageBoxUpper( TID_GAME_GUILDCOMBAT_NO_OUTWAR )`) are such boxes. Laid out as the log-out box is (logOutBox.ts).
//
//   Function                          File:lines                         what
//   resdata.inc APP_MESSAGEBOX        Resource/resdata.inc:24534         "WndMessagebox.tga", 256 x 144, "Message Box"
//   CWndMessageBox::OnInitialUpdate   _Interface/WndMessageBox.cpp:65-128 the text in the client area less 10 10 10 35;
//                                                                        MB_OKCANCEL: OK 70 px left of the middle,
//                                                                        Cancel 10 px right; MB_OK: OK at the middle - 30;
//                                                                        30 px over the bottom; MoveParentCenter (:128)
//   CWndMessageBox::Create            WndMessageBox.cpp:198-206          WBS_MODAL
//   CReturnScrollMsgBox               _Interface/WndSelectVillage.cpp:17-45  OK opens the village window, Cancel closes

import type { UiArt } from './art';
import { pictureButton, place } from './button';
import { WindowFrame } from './frame';
import { ModalBackdrop } from './modal';

/** `APP_MESSAGEBOX "WndMessagebox.tga" 0 256 144` (resdata.inc:24534). */
const WIDTH = 256;
const HEIGHT = 144;
/** `IDS_RESDATA_INC_003100` (resData.txt.txt:3101). */
const TITLE = 'Message Box';
/** The client area of a window with a caption: 18 + 4 down, 4 in (`CWndBase::SetWndRect`, `WndBase.cpp:1846-1853`). */
const CLIENT_WIDTH = WIDTH - 4 - 8;
const CLIENT_HEIGHT = HEIGHT - 22 - 10;
/** A quarter of the 288 x 20 pictures (`FitTextureSize`), at the 60 px of Create's rect. */
const BUTTON_WIDTH = 72;
const BUTTON_HEIGHT = 20;
const BUTTON_SPACING = 60;

export class MessageBox {
  readonly frame: WindowFrame;
  readonly modal: ModalBackdrop;
  private readonly text: HTMLDivElement;
  private readonly ok: HTMLButtonElement;
  private readonly cancel: HTMLButtonElement;
  private onOk: () => void = () => {};
  private onCancel: () => void = () => {};

  constructor(art: UiArt, doc: Document = document) {
    // its own size on a phone too (a phone rule makes its words 14 px): at the 0.7 of the other windows its text would be
    // under 10 px and its OK and Cancel too small to tap (final review)
    const frame = new WindowFrame(TITLE, art, {
      width: WIDTH, height: HEIGHT, texture: 'WndMessagebox.tga', mobileScale: 1, fitWhole: true,
    }, doc);
    frame.element.classList.add('hud-message');
    // the close button and Escape are Cancel, as IDCANCEL (WndMessageBox.cpp:148-180)
    frame.onClose = () => {
      this.modal.hide();
      const cancel = this.onCancel;
      this.onCancel = () => {};
      cancel();
    };
    const text = doc.createElement('div');
    text.className = 'hud-message-text';
    place(text, { left: 10, top: 10, width: CLIENT_WIDTH - 20, height: CLIENT_HEIGHT - 45 });
    const y = CLIENT_HEIGHT - 30;
    const button = (key: string, name: string, picture: string, press: () => void): HTMLButtonElement => {
      const element = pictureButton(doc, art, picture, { left: 0, top: y, width: BUTTON_WIDTH, height: BUTTON_HEIGHT }, BUTTON_WIDTH, press);
      element.classList.add('hud-message-button');
      element.dataset.button = key;
      element.setAttribute('aria-label', name);
      return element;
    };
    this.ok = button('ok', 'OK', 'ButtOk.tga', () => {
      const ok = this.onOk;
      this.onCancel = () => {};
      frame.close();
      ok();
    });
    this.cancel = button('cancel', 'Cancel', 'ButtCancel.tga', () => frame.close());
    frame.body.append(text, this.ok, this.cancel);
    this.text = text;
    this.frame = frame;
    this.modal = new ModalBackdrop(frame, doc);
  }

  /** The modal backdrop with the box in it: what goes in the windows' layer. */
  get element(): HTMLElement {
    return this.modal.element;
  }

  get isOpen(): boolean {
    return this.frame.isOpen;
  }

  /** Shows `text` (as text) with OK (`'ok'`, MB_OK) or OK and Cancel (`'okCancel'`), centred; OK runs `onOk`, Cancel `onCancel`. */
  open(text: string, buttons: 'ok' | 'okCancel', onOk: () => void, onCancel: () => void = () => {}): void {
    this.text.textContent = text;
    this.onOk = onOk;
    this.onCancel = onCancel;
    const middle = CLIENT_WIDTH / 2;
    if (buttons === 'okCancel') {
      this.ok.style.left = `${middle - BUTTON_SPACING - 10}px`; // rect2_1 (:76)
      this.cancel.style.left = `${middle + 10}px`; // rect2_2 (:77)
      this.cancel.hidden = false;
    } else {
      this.ok.style.left = `${middle - BUTTON_SPACING / 2}px`; // rect1_1 (:75)
      this.cancel.hidden = true;
    }
    this.modal.show();
    this.frame.open('center');
  }

  /** Closes it as Cancel would. */
  close(): void {
    if (this.frame.isOpen) this.frame.close();
  }

  dispose(): void {
    this.onCancel = () => {};
    this.frame.close();
    this.element.remove();
  }
}

// The Scroll of Return's village window (Piece 7 M3, [R §5]): `CWndSelectVillage`, APP_COMM_SELECTVIL.
//
//   Function                              File:lines                              what
//   resdata.inc APP_COMM_SELECTVIL        Resource/resdata.inc:24294-24356        "WndTile00.tga" tiled, 176 x 144; a static,
//                                                                                  three radios in ButtRadio.bmp, OK, Cancel
//   the texts                             Resource/resData.txt.txt:3141-3149      the title, the static, the villages
//   CWndSelectVillage::OnInitialUpdate    _Interface/WndSelectVillage.cpp:64-75   Flaris checked; MoveParentCenter
//   CWndSelectVillage::OnChildNotify      WndSelectVillage.cpp:112-132            OK sends the first checked radio's index
//                                                                                  (0 flaris, 1 saintmorning, 2 darkon) and
//                                                                                  closes; Cancel only closes
//   CTheme::RenderWndButton_6Texture      _Interface/ITheme.cpp                   the radio's six frames of 14 x 14: 1 off,
//                                                                                  0 off under the mouse, 3 on, 2 on under the
//                                                                                  mouse (4 and 5 disabled)
//   CTheme::RenderWndButtonRadio          ITheme.cpp                              the label 2 px right of the 14 px picture

import type { UiArt } from './art';
import { themeUrl } from './art';
import { pictureButton, place } from './button';
import { WindowFrame } from './frame';
import { ModalBackdrop } from './modal';

const WIDTH = 176;
const HEIGHT = 144;
/** `IDS_RESDATA_INC_003140` and the static's `IDS_RESDATA_INC_003141` (resData.txt.txt:3141-3142). */
const TITLE = 'Choose the Village to Return';
const PROMPT = 'Choose the Village';
/** The radios' labels and rects, in RETURNSCROLL's order (resData.txt.txt:3143-3149; resdata.inc:24294-24356). */
const VILLAGES: ReadonlyArray<{ label: string; top: number }> = [
  { label: 'Flaris', top: 28 },
  { label: 'Sain City', top: 46 },
  { label: 'Darken City', top: 64 },
];
const RADIO = { left: 8, width: 96, height: 16 };
/** `ButtRadio.bmp`: six frames of 14 x 14 side by side. */
const RADIO_PX = 14;
/** The pictures of OK and Cancel are 288 x 20: a quarter each state. */
const BUTTON_QUARTER = 72;

export class SelectVillageWindow {
  readonly frame: WindowFrame;
  readonly modal: ModalBackdrop;
  private readonly radios: Array<{ button: HTMLButtonElement; icon: HTMLElement; hover: boolean }> = [];
  private checked = 0;
  private onChoose: (select: 0 | 1 | 2) => void = () => {};

  constructor(art: UiArt, doc: Document = document) {
    const frame = new WindowFrame(TITLE, art, { width: WIDTH, height: HEIGHT, mobileScale: 1, fitWhole: true }, doc);
    frame.element.classList.add('hud-select-village');
    frame.onClose = () => this.modal.hide();
    const prompt = doc.createElement('div');
    prompt.className = 'hud-select-village-prompt';
    prompt.textContent = PROMPT;
    place(prompt, { left: 10, top: 8, width: 150, height: 18 });
    frame.body.append(prompt);
    const radioPicture = themeUrl(art, 'ButtRadio.bmp');
    VILLAGES.forEach(({ label, top }, i) => {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'hud-village-radio';
      button.setAttribute('role', 'radio');
      place(button, { left: RADIO.left, top, width: RADIO.width, height: RADIO.height });
      const icon = doc.createElement('span');
      icon.className = 'hud-village-radio-icon';
      icon.style.backgroundImage = radioPicture;
      const text = doc.createElement('span');
      text.textContent = label;
      button.append(icon, text);
      const radio = { button, icon, hover: false };
      button.addEventListener('click', () => this.check(i));
      button.addEventListener('pointerenter', () => { radio.hover = true; this.draw(); });
      button.addEventListener('pointerleave', () => { radio.hover = false; this.draw(); });
      this.radios.push(radio);
      frame.body.append(button);
    });
    const button = (key: string, name: string, picture: string, left: number, press: () => void): HTMLButtonElement => {
      const element = pictureButton(doc, art, picture, { left, top: 82, width: 72, height: 20 }, BUTTON_QUARTER, press);
      element.dataset.button = key;
      element.setAttribute('aria-label', name);
      return element;
    };
    const ok = button('ok', 'OK', 'ButtOk.tga', 8, () => {
      const choose = this.onChoose;
      const select = this.checked as 0 | 1 | 2;
      frame.close();
      choose(select);
    });
    const cancel = button('cancel', 'Cancel', 'ButtCancel.tga', 84, () => frame.close());
    frame.body.append(ok, cancel);
    this.frame = frame;
    this.modal = new ModalBackdrop(frame, doc);
  }

  get element(): HTMLElement {
    return this.modal.element;
  }

  get isOpen(): boolean {
    return this.frame.isOpen;
  }

  /** Opens it centred with Flaris checked; OK gives `onChoose` the village's index. */
  open(onChoose: (select: 0 | 1 | 2) => void): void {
    this.onChoose = onChoose;
    this.check(0);
    this.modal.show();
    this.frame.open('center');
  }

  dispose(): void {
    this.frame.close();
    this.element.remove();
  }

  private check(i: number): void {
    this.checked = i;
    this.draw();
  }

  private draw(): void {
    this.radios.forEach(({ button, icon, hover }, i) => {
      const on = i === this.checked;
      const frame = on ? (hover ? 2 : 3) : (hover ? 0 : 1);
      button.setAttribute('aria-checked', String(on));
      button.dataset.frame = String(frame);
      icon.style.backgroundPosition = `-${frame * RADIO_PX}px 0px`;
    });
  }
}

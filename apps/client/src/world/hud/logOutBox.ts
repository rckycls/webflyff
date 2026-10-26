// The box that asks before logging out (`CWndLogOut`, _Interface/WndField.cpp:11910-11983), a `CWndMessageBox` with OK
// and Cancel (_Interface/WndMessageBox.cpp:65-129):
//
//   resdata.inc APP_MESSAGEBOX      Resource/resdata.inc:24534  "WndMessagebox.tga", 256 x 144, a caption
//   CWndLogOut::Initialize          WndField.cpp:11910-11932    the title TID_DIAG_0068, the text TID_DIAG_0069, at the
//                                                               middle of the screen's width and 70 px down
//   CWndMessageBox::OnInitialUpdate WndMessageBox.cpp:65-129    the text in the client area less 10 10 10 35, in black
//                                                               (:203); OK 70 px left of the middle and Cancel 10 px right
//                                                               of it, 30 px over the client area's bottom, each a quarter
//                                                               of its picture wide (ButtOk.tga, ButtCancel.tga, 288 x 20)
//   CWndLogOut::OnChildNotify       WndField.cpp:11933-11983    Cancel closes it; OK logs out
//
// OK leaves the world as Piece 3's Leave does. Neuz logs out at once in a safe region or for a game master, and otherwise
// counts down first (`CWndLogOutWaitting`, :11963-11975); Piece 4 does not count down.

import { themeUrl } from './art';
import type { UiArt } from './art';
import { WindowFrame } from './frame';

/** `APP_MESSAGEBOX "WndMessagebox.tga" 0 256 144` (resdata.inc:24534). */
const WIDTH = 256;
const HEIGHT = 144;
/** The client area of a window with a caption (`CWndBase::SetWndRect`, `WndBase.cpp:1846-1853`): 18 + 4 down, 4 in. */
const CLIENT_LEFT = 4;
const CLIENT_TOP = 22;
const CLIENT_WIDTH = WIDTH - 4 - 8;
const CLIENT_HEIGHT = HEIGHT - CLIENT_TOP - 10;
/** The buttons: a quarter of their 288 x 20 picture (`FitTextureSize`, `WndControl.cpp:309-320`), 60 apart by Create's rect. */
const BUTTON_WIDTH = 72;
const BUTTON_HEIGHT = 20;
const BUTTON_SPACING = 60;
/** Where `CWndLogOut::Initialize` puts it: 70 px from the top (:11928). */
const TOP = 70;

/** The texts the box reads (the texts catalog). */
export type LogOutTexts = ReadonlyMap<string, { text: string }>;

/**
 * The log-out box. Its `frame` goes in the windows' layer; `open` shows it at the middle of the layer's width, 70 px down;
 * OK calls `onOk` and closes it, Cancel (and its close button, and Escape: it is a window of resdata.inc, which `GetWndBase`
 * finds) closes it.
 */
export class LogOutBox {
  readonly frame: WindowFrame;

  constructor(art: UiArt, texts: LogOutTexts, onOk: () => void, doc: Document = document) {
    const text = (id: string): string => texts.get(id)?.text ?? '';
    const frame = new WindowFrame(text('TID_DIAG_0068'), art, { width: WIDTH, height: HEIGHT, texture: 'WndMessagebox.tga' }, doc);
    frame.element.classList.add('hud-logout');
    const body = frame.body;
    const message = doc.createElement('div');
    message.className = 'hud-logout-text';
    message.textContent = text('TID_DIAG_0069');
    // the client area less 10 10 10 35 (:83), in the body's place (the body is the client area)
    message.style.left = '10px';
    message.style.top = '10px';
    message.style.width = `${CLIENT_WIDTH - 20}px`;
    message.style.height = `${CLIENT_HEIGHT - 45}px`;
    const middle = CLIENT_WIDTH / 2;
    const y = CLIENT_HEIGHT - 30;
    const button = (name: string, picture: string, left: number, press: () => void): HTMLButtonElement => {
      const element = doc.createElement('button');
      element.type = 'button';
      element.className = 'hud-logout-button';
      element.setAttribute('aria-label', name);
      element.tabIndex = -1;
      element.addEventListener('mousedown', (event) => event.preventDefault());
      element.style.left = `${left}px`;
      element.style.top = `${y}px`;
      element.style.width = `${BUTTON_WIDTH}px`;
      element.style.height = `${BUTTON_HEIGHT}px`;
      element.style.backgroundImage = themeUrl(art, picture);
      element.addEventListener('click', press);
      return element;
    };
    // rect2_1 and rect2_2 (:76-77); the names are the buttons' own ("OK", "CANCEL", :106-107), their pictures' words
    const ok = button('OK', 'ButtOk.tga', middle - BUTTON_SPACING - 10, () => {
      frame.close();
      onOk();
    });
    const cancel = button('Cancel', 'ButtCancel.tga', middle + 10, () => frame.close());
    body.append(message, ok, cancel);
    this.frame = frame;
  }

  /** Shows the box at the middle of a layer `layerWidth` px wide, 70 px down (`CWndLogOut::Initialize`, :11926-11929). */
  open(layerWidth: number): void {
    this.frame.open({ x: Math.trunc((layerWidth - WIDTH) / 2), y: TOP });
  }

  get isOpen(): boolean {
    return this.frame.isOpen;
  }
}

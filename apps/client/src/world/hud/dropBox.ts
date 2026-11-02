// The box a dropped world shows (Piece 6 M3): Neuz's message box (APP_MESSAGEBOX, the picture the log-out box uses) with
// the reason, **Reconnect** and **Back to login**. Neuz shows "Disconnected from the server." in such a box when its
// login connection drops (TID_DIAG_0023, DPLoginClient.cpp:65-82) and has no reconnect; the buttons are the web's.
// It is modal over the frozen world, has no close button, and Escape does not close it: the player chooses.

import type { BoxState } from '../../lobby/reconnect';
import type { UiArt } from './art';
import { place } from './button';
import { WindowFrame } from './frame';
import { ModalBackdrop } from './modal';

/** `APP_MESSAGEBOX "WndMessagebox.tga" 0 256 144` (resdata.inc:24534), as the log-out box. */
const WIDTH = 256;
const HEIGHT = 144;
/** `IDS_RESDATA_INC_003100`: the message box's title. */
const TITLE = 'Message Box';
const CLIENT_WIDTH = WIDTH - 4 - 8;
const CLIENT_HEIGHT = HEIGHT - 22 - 10;
const BUTTON_WIDTH = 104;
const BUTTON_HEIGHT = 22;
/** Where `CWndLogOut::Initialize` puts its box: 70 px from the top. */
const TOP = 70;

export class DropBox {
  readonly frame: WindowFrame;
  readonly modal: ModalBackdrop;
  onReconnect: () => void = () => {};
  onBack: () => void = () => {};
  private readonly text: HTMLElement;
  private readonly reconnect: HTMLButtonElement;

  constructor(art: UiArt, doc: Document = document) {
    const frame = new WindowFrame(TITLE, art, { width: WIDTH, height: HEIGHT, texture: 'WndMessagebox.tga', closeButton: false }, doc);
    frame.escapeCloses = false;
    frame.element.classList.add('hud-dropbox');
    this.text = doc.createElement('div');
    this.text.className = 'hud-dropbox-text';
    this.text.setAttribute('role', 'alert');
    place(this.text, { left: 10, top: 10, width: CLIENT_WIDTH - 20, height: CLIENT_HEIGHT - 45 });
    const button = (key: string, label: string, left: number, press: () => void): HTMLButtonElement => {
      const element = doc.createElement('button');
      element.type = 'button';
      element.className = 'hud-dropbox-button';
      element.dataset.button = key;
      element.textContent = label;
      place(element, { left, top: CLIENT_HEIGHT - 32, width: BUTTON_WIDTH, height: BUTTON_HEIGHT });
      element.addEventListener('click', press);
      return element;
    };
    const middle = CLIENT_WIDTH / 2;
    this.reconnect = button('reconnect', 'Reconnect', middle - BUTTON_WIDTH - 6, () => this.onReconnect());
    const back = button('back', 'Back to login', middle + 6, () => this.onBack());
    frame.body.append(this.text, this.reconnect, back);
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

  /** Shows `state`, opening the box at the middle of a layer `layerWidth` px wide when it is not open yet. */
  show(state: BoxState, layerWidth: number): void {
    this.text.textContent = state.text;
    this.reconnect.hidden = !state.canReconnect;
    this.reconnect.disabled = state.busy;
    if (!this.frame.isOpen) {
      this.modal.show();
      this.frame.open({ x: Math.max(0, Math.trunc((layerWidth - WIDTH) / 2)), y: TOP });
    }
  }

  /** Closes it, and takes it off its layer. */
  dispose(): void {
    this.frame.close();
    this.element.remove();
  }
}

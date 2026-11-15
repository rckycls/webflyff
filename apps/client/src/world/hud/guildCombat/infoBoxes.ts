// The siege's two pop-up boxes (2026-11-15, B3; A-client.md §2.8), whose text the world server sends.
//
//   CGuildCombatInfoMessageBox    APP_GUILDCOMBAT_MSG, resdata.inc:2339, 320 x 176   GC_TELE: the text, Yes teleports to Madrigal
//                                 (`SendGCTele`, WndField.cpp:15741-15753), No closes; the title is "Guild Siege - Applying
//                                 Situation" (:15706-15729)
//   CGuildCombatInfoMessageBox2   APP_GUILDCOMBAT_MSG2, resdata.inc:1934, 320 x 176  GC_DIAGMESSAGE: "Guild Siege Introduction",
//                                 the text, OK

import type { UiArt } from '../art';
import { ResWindow } from '../resWindow';
import type { ResLayout } from '../resWindow';

export const teleLayout = (title: string): ResLayout => ({
  title, width: 320, height: 176,
  controls: [
    { kind: 'text', id: 'WIDC_TEXT1', rect: [8, 8, 298, 100] },
    { kind: 'button', id: 'WIDC_YES', rect: [64, 106, 136, 126], picture: 'ButtYes.tga', label: 'Yes', quarter: 72 },
    { kind: 'button', id: 'WIDC_NO', rect: [172, 106, 244, 126], picture: 'ButtNo.tga', label: 'No', quarter: 72 },
  ],
});

export const diagLayout = (title: string): ResLayout => ({
  title, width: 320, height: 176,
  controls: [
    { kind: 'text', id: 'WIDC_TEXT1', rect: [8, 8, 298, 100] },
    { kind: 'button', id: 'WIDC_OK', rect: [118, 106, 190, 126], picture: 'ButtOk.tga', label: 'OK', quarter: 72 },
  ],
});

/** GC_TELE's box. */
export class TeleBox {
  readonly window: ResWindow;
  onYes: () => void = () => {};

  constructor(title: string, art: UiArt, doc: Document = document) {
    const window = new ResWindow(teleLayout(title), art, doc);
    window.frame.element.classList.add('hud-gc', 'hud-gc-tele');
    window.button('WIDC_YES').addEventListener('click', () => { window.close(); this.onYes(); });
    window.button('WIDC_NO').addEventListener('click', () => window.close());
    this.window = window;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  get element(): HTMLElement {
    return this.window.element;
  }

  /** The server's text; a box already open takes the new text. */
  open(text: string): void {
    this.window.setText('WIDC_TEXT1', text);
    if (!this.window.isOpen) this.window.open();
  }

  close(): void {
    this.window.close();
  }
}

/** GC_DIAGMESSAGE's box. */
export class DiagBox {
  readonly window: ResWindow;

  constructor(title: string, art: UiArt, doc: Document = document) {
    const window = new ResWindow(diagLayout(title), art, doc);
    window.frame.element.classList.add('hud-gc', 'hud-gc-diag');
    window.button('WIDC_OK').addEventListener('click', () => window.close());
    this.window = window;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  get element(): HTMLElement {
    return this.window.element;
  }

  open(text: string): void {
    this.window.setText('WIDC_TEXT1', text);
    if (!this.window.isOpen) this.window.open();
  }

  close(): void {
    this.window.close();
  }
}

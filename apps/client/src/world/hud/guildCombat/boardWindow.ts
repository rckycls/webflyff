// The info board (2026-11-15, B3; A-client.md §2.7): the text of one of the siege's files in a scrolling box.
//
//   CWndGuildCombatBoard   _Interface/WndField.cpp:15605-15687   APP_GUILDCOMBAT_BOARD, resdata.inc:137, 384 x 384,
//                                                                "Guild Siege - Info."; WIDC_TEXT1 (12,10)-(364,306)
//                                                                holds the file's text (AddParsingString); WIDC_BUTTON1
//                                                                (ButOk2.bmp) closes it

import type { UiArt } from '../art';
import { ResWindow } from '../resWindow';
import type { ResLayout } from '../resWindow';
import { setDescription } from '../../items/npcWindowKit';

export const boardLayout = (title: string): ResLayout => ({
  title, width: 384, height: 384,
  controls: [
    { kind: 'text', id: 'WIDC_TEXT1', rect: [12, 10, 364, 306], tile: 'WndEditTile00.tga', scroll: true },
    { kind: 'button', id: 'WIDC_BUTTON1', rect: [154, 318, 226, 338], picture: 'ButOk2.bmp', label: 'OK', quarter: 72 },
  ],
});

export class BoardWindow {
  readonly window: ResWindow;

  constructor(title: string, art: UiArt, private readonly doc: Document = document) {
    const window = new ResWindow(boardLayout(title), art, doc);
    window.frame.element.classList.add('hud-gc', 'hud-gc-board');
    window.button('WIDC_BUTTON1').addEventListener('click', () => window.close());
    this.window = window;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  get element(): HTMLElement {
    return this.window.element;
  }

  /** An open board is deleted and a new one made (`WndWorld.cpp:4007-4017`): the text replaced, the window shown again. */
  open(text: string): void {
    setDescription(this.window, 'WIDC_TEXT1', this.doc, text);
    this.window.close();
    this.window.open();
  }

  setTitle(title: string): void {
    this.window.frame.setTitle(title);
  }

  close(): void {
    this.window.close();
  }
}

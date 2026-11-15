// The siege's two confirm windows (2026-11-15, B3; A-client.md §2.5, §2.6).
//
//   CWndGuildWarCancelConfirm   WndField.cpp:16838-16935   APP_GUILDCOMBAT_CANCEL_CONFIRM, resdata.inc:2300, 336 x 160,
//                                                          "Guild Siege - Cancel Application"; the text (TID_GAME_GUILDWAR_CANCEL)
//                                                          in black in the top half; Yes cancels the application, No closes
//   CWndGuildWarJoinConfirm     WndField.cpp:16954-17065   APP_CLOSE_EXISTING_CONNECTION, resdata.inc:28218, 256 x 144,
//                                                          WndMessagebox.tga, "Entering Guild Siege Arena"; the text
//                                                          (TID_GAME_GUILDWAR_JOIN) in its colour; Yes joins, a vagrant is refused

import type { UiArt } from '../art';
import { ResWindow } from '../resWindow';
import type { ResLayout } from '../resWindow';

export const cancelLayout = (title: string, question: string): ResLayout => ({
  title, width: 336, height: 160,
  controls: [
    { kind: 'text', id: 'WIDC_TEXT1', rect: [12, 8, 316, 82], text: question },
    { kind: 'button', id: 'WIDC_YES', rect: [80, 92, 152, 112], picture: 'ButtYes.tga', label: 'Yes', quarter: 72 },
    { kind: 'button', id: 'WIDC_NO', rect: [172, 92, 244, 112], picture: 'ButtNo.tga', label: 'No', quarter: 72 },
  ],
});

export const joinLayout = (title: string, question: string): ResLayout => ({
  title, width: 256, height: 144, texture: 'WndMessagebox.tga',
  controls: [
    { kind: 'text', id: 'WIDC_TEXT1', rect: [16, 14, 232, 74], text: question },
    { kind: 'button', id: 'WIDC_YES', rect: [48, 84, 120, 104], picture: 'ButtYes.tga', label: 'Yes', quarter: 72 },
    { kind: 'button', id: 'WIDC_NO', rect: [126, 84, 198, 104], picture: 'ButtNo.tga', label: 'No', quarter: 72 },
  ],
});

/** A Yes / No window: Yes runs `onYes` (the caller closes or keeps the window), No closes. */
export class YesNoWindow {
  readonly window: ResWindow;
  onYes: () => void = () => {};

  constructor(layout: ResLayout, name: string, art: UiArt, doc: Document = document, color?: number) {
    const window = new ResWindow(layout, art, doc);
    window.frame.element.classList.add('hud-gc', `hud-gc-${name}`);
    if (color !== undefined) window.control('WIDC_TEXT1').style.color = `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
    window.button('WIDC_YES').addEventListener('click', () => this.onYes());
    window.button('WIDC_NO').addEventListener('click', () => window.close());
    this.window = window;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  get element(): HTMLElement {
    return this.window.element;
  }

  open(): void {
    this.window.open();
  }

  close(): void {
    this.window.close();
  }
}

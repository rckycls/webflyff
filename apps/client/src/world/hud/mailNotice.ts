// The new-mail notice (2026-11-10, docs/superpowers/specs/2026-11-10-bank-mail-research.md §2.4; B-mail.md §8). The own mover's
// MODE_MAILBOX (0x8000, `_Common/authorization.h:121`) says it has an unread mail; it comes in ADD_OBJ and MODIFYMODE. Neuz shows
// it three ways: a "Mail" instant message for a minute, the chat line (WorldScreen.onModifyMode), and WndMail.dds blinking in the
// Messenger at WIDC_CUSTOM1, 56,312, 12 x 12, its alpha 50 to 255 and back by 8 a frame, the tooltip TID_MAIL_RECEIVE
// (`CWndMessengerEx::OnDraw`, `_Interface/WndMessenger.cpp:486-490, :622-654`). V15 has no HUD icon: the owner asked for one, so
// the HUD shows the same picture, blinking the same way, while the bit is set (a FlyffWeb addition).

import type { UiArt } from './art';
import { place } from './button';

/** The Messenger's WIDC_CUSTOM1 (resdata.inc:2180-2299). */
const MESSENGER_SPOT = { left: 56, top: 312, width: 12, height: 12 };

/** One blinking WndMail picture: its element, shown while `set( true )`. */
function mailMark(doc: Document, art: UiArt, label: string, className: string): HTMLElement {
  const element = doc.createElement('div');
  element.className = className;
  element.setAttribute('role', 'status');
  element.setAttribute('aria-label', label);
  element.title = label;
  element.hidden = true;
  const img = doc.createElement('img');
  img.src = art.url('ui/wndmail.png');
  img.alt = '';
  element.append(img);
  return element;
}

/** The HUD's icon and the Messenger's mark, together. */
export class MailNotice {
  /** The HUD's icon (style.css `.hud-mail-notice`). */
  readonly element: HTMLElement;
  /** The Messenger's mark, for its window's body. */
  readonly messengerMark: HTMLElement;
  private on = false;

  constructor(art: UiArt, label: string, doc: Document = document) {
    this.element = mailMark(doc, art, label, 'hud-mail-notice');
    this.messengerMark = mailMark(doc, art, label, 'hud-messenger-mail');
    place(this.messengerMark, MESSENGER_SPOT);
  }

  get shown(): boolean {
    return this.on;
  }

  /** The own mode's MODE_MAILBOX bit. */
  set(on: boolean): void {
    this.on = on;
    this.element.hidden = !on;
    this.messengerMark.hidden = !on;
  }
}

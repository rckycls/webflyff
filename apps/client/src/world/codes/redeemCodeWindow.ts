// custom (owner 2026-11-20, "I would like this to be an ingame window ... whether its desktop browser or mobile browsers";
// docs/superpowers/specs/2026-11-20-vip-codes-design.md): the Redeem Code window, from the Start menu's Extras folder.
// It is no window of Neuz's. What it does is codeRedeemer.ts; this is its look:
//
//   the code     the box (the floating keyboard on a phone), Paste (the clipboard; where the browser gives none, how to
//                paste by hand) and Check (Enter in the box)
//   the offer    what the code gives: the VIP star and "VIP2 for 7 days", each item's icon, name and count; the bag
//                slots it needs and has; the warning when it would end a lower VIP; after Redeem, the done lines
//   the message  a refusal's line in red
//   password     only after a lost session: the box (Enter) and OK
//   the buttons  Redeem ("Yes, redeem" once it asks again) and Cancel
//
// The phone: the same parts in a compact panel over the open bag (style.css, `.hud-redeem`).

import type { UiArt } from '../hud/art';
import { textButton } from '../hud/numpad';
import { ResWindow } from '../hud/resWindow';
import type { ResLayout } from '../hud/resWindow';
import { CodeRedeemer } from './codeRedeemer';
import type { CodeRedeemerHost, CodeView } from './codeRedeemer';

const EDIT = 'WndEditTile00.tga';
export const PASTE_BY_HAND = 'Long-press the box and choose Paste.';
export const BOUND_LINE = 'Bound to your character: these items can\'t be traded.';
const HINT = 'Type or paste your code, then press Check.';

export interface RedeemCodeHost extends CodeRedeemerHost {
  /** An item's name and icon picture (null: none). */
  item(itemId: number): { name: string; iconUrl: string | null };
}

export const REDEEM_LAYOUT: ResLayout = {
  title: 'Redeem Code',
  width: 368,
  height: 316,
  controls: [
    { kind: 'static', id: 'WIDC_STATIC1', rect: [8, 12, 46, 28], text: 'Code' },
    { kind: 'edit', id: 'WIDC_CODE', rect: [48, 8, 224, 28], tile: EDIT, maxLength: 40 },
    { kind: 'custom', id: 'WIDC_CODE_BUTTONS', rect: [230, 7, 352, 29] },
    { kind: 'custom', id: 'WIDC_OFFER', rect: [8, 36, 352, 180], tile: EDIT },
    { kind: 'static', id: 'WIDC_STATIC2', rect: [8, 190, 74, 206], text: 'Password' },
    { kind: 'edit', id: 'WIDC_PASSWORD', rect: [76, 186, 268, 206], tile: EDIT, maxLength: 64 },
    { kind: 'custom', id: 'WIDC_PASSWORD_OK', rect: [274, 185, 352, 207] },
    { kind: 'custom', id: 'WIDC_MESSAGE', rect: [8, 212, 352, 244] },
    { kind: 'custom', id: 'WIDC_BUTTONS', rect: [8, 250, 352, 274] },
  ],
};

export class RedeemCodeWindow {
  readonly window: ResWindow;
  private readonly redeemer: CodeRedeemer;
  private readonly code: HTMLInputElement;
  private readonly password: HTMLInputElement;
  private readonly offer: HTMLElement;
  private readonly message: HTMLElement;
  private readonly redeemButton: HTMLButtonElement;
  private readonly checkButton: HTMLButtonElement;
  private readonly okButton: HTMLButtonElement;
  /** A line of the window's own (Paste) shown until the next step. */
  private note: string | null = null;

  constructor(private readonly host: RedeemCodeHost, private readonly art: UiArt, private readonly doc: Document = document) {
    const window = new ResWindow(REDEEM_LAYOUT, art, doc);
    window.frame.element.classList.add('hud-redeem');
    // above the phone's open bag, as the other windows a Start menu line opens
    window.frame.overBag = true;
    this.window = window;
    this.code = window.input('WIDC_CODE');
    this.code.setAttribute('aria-label', 'Code');
    this.code.placeholder = 'XXXX-XXXX-XXXX-XXXX';
    this.code.autocapitalize = 'characters';
    this.code.addEventListener('keydown', (event) => { if (event.key === 'Enter') void this.check(); });
    this.password = window.input('WIDC_PASSWORD');
    this.password.type = 'password';
    this.password.setAttribute('aria-label', 'Password');
    this.password.autocomplete = 'current-password';
    this.password.addEventListener('keydown', (event) => { if (event.key === 'Enter') void this.sendPassword(); });

    const paste = textButton(doc, 'Paste', () => void this.paste(), 'paste', 'redeem');
    this.checkButton = textButton(doc, 'Check', () => void this.check(), 'check', 'redeem');
    for (const b of [paste, this.checkButton]) b.classList.add('auto-word');
    window.control('WIDC_CODE_BUTTONS').append(paste, this.checkButton);
    this.okButton = textButton(doc, 'OK', () => void this.sendPassword(), 'ok', 'redeem');
    this.okButton.classList.add('auto-word');
    window.control('WIDC_PASSWORD_OK').append(this.okButton);
    this.redeemButton = textButton(doc, 'Redeem', () => void this.redeemer.redeem(), 'redeem', 'redeem');
    const cancel = textButton(doc, 'Cancel', () => this.close(), 'cancel', 'redeem');
    for (const b of [this.redeemButton, cancel]) b.classList.add('auto-word');
    window.control('WIDC_BUTTONS').append(this.redeemButton, cancel);

    this.offer = doc.createElement('div');
    this.offer.className = 'redeem-offer';
    window.control('WIDC_OFFER').append(this.offer);
    this.message = window.control('WIDC_MESSAGE');
    this.message.classList.add('redeem-message');
    this.message.setAttribute('role', 'status');

    this.redeemer = new CodeRedeemer(host, (view) => { this.note = null; this.render(view); });
    window.onClose = () => {
      // a finished or refused code is not kept for the next opening; one waiting for the password is
      if (this.redeemer.view.step === 'done') this.redeemer.reset();
    };
    this.render(this.redeemer.view);
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  /** What goes in the windows' layer. */
  get element(): HTMLElement {
    return this.window.element;
  }

  open(): void {
    if (this.redeemer.view.step === 'done') {
      this.redeemer.reset();
      this.code.value = '';
    }
    this.render(this.redeemer.view);
    this.window.open();
  }

  /** The Start menu line: open it, or close it when it is open. */
  toggle(): void {
    if (this.window.isOpen) this.close();
    else this.open();
  }

  close(): void {
    this.window.close();
  }

  dispose(): void {
    this.window.dispose();
  }

  private async check(): Promise<void> {
    if (this.redeemer.view.step === 'busy') return;
    await this.redeemer.check(this.code.value);
  }

  private async sendPassword(): Promise<void> {
    if (this.redeemer.view.step !== 'password') return;
    const text = this.password.value;
    this.password.value = ''; // never kept
    await this.redeemer.password(text);
  }

  /** The clipboard into the code box; where the browser gives none (or says no), how to paste by hand. Never throws. */
  private async paste(): Promise<void> {
    let text: string | undefined;
    try {
      text = await this.doc.defaultView?.navigator.clipboard?.readText();
    } catch {
      text = undefined;
    }
    if (typeof text !== 'string' || text.trim() === '') {
      this.note = PASTE_BY_HAND;
      this.render(this.redeemer.view);
      return;
    }
    this.code.value = text.trim().slice(0, 40);
    this.note = null;
    this.render(this.redeemer.view);
  }

  private line(text: string, className?: string): HTMLElement {
    const line = this.doc.createElement('div');
    line.className = className === undefined ? 'redeem-line' : `redeem-line ${className}`;
    line.textContent = text;
    return line;
  }

  private render(view: CodeView): void {
    const busy = view.step === 'busy';
    const asking = view.step === 'password';
    this.window.control('WIDC_STATIC2').hidden = !asking;
    this.password.closest<HTMLElement>('[data-control]')!.hidden = !asking;
    this.window.control('WIDC_PASSWORD_OK').hidden = !asking;
    this.checkButton.disabled = busy;
    this.okButton.disabled = busy;
    this.redeemButton.disabled = view.step !== 'offer';
    this.redeemButton.textContent = view.step === 'offer' && view.confirming ? 'Yes, redeem' : 'Redeem';

    const lines: HTMLElement[] = [];
    if (view.step === 'busy') lines.push(this.line('Please wait…', 'is-quiet'));
    else if (view.step === 'done') for (const text of view.lines) lines.push(this.line(text));
    else if (view.step === 'offer') {
      lines.push(this.line(`"${view.check.offer.label}" gives:`, 'is-quiet'));
      const offer = view.check.offer;
      if (offer.vipLevel > 0) {
        const row = this.line(`VIP${offer.vipLevel} for ${offer.vipDays} day${offer.vipDays === 1 ? '' : 's'}`, 'redeem-gift');
        row.prepend(this.icon(this.art.url(`ui/vipstar${offer.vipLevel}.png`)));
        lines.push(row);
      }
      for (const stack of offer.items) {
        const item = this.host.item(stack.itemId);
        const row = this.line(`${item.name} ×${stack.count}`, 'redeem-gift');
        row.prepend(this.icon(item.iconUrl));
        lines.push(row);
      }
      // owner 2026-11-20: a bound code's items carry the game's binds flag
      if (offer.bound && offer.items.length > 0) lines.push(this.line(BOUND_LINE, 'is-quiet'));
      if (view.needed > 0) {
        const short = view.free < view.needed;
        lines.push(this.line(`Needs ${view.needed} free bag slot${view.needed === 1 ? '' : 's'} (you have ${view.free}).`, short ? 'is-short' : 'is-quiet'));
      }
      if (view.warning !== null) lines.push(this.line(view.warning, 'is-warning'));
      if (view.confirming) lines.push(this.line('Press "Yes, redeem" to go on.', 'is-warning'));
    } else if (view.step === 'enter' || view.step === 'password') {
      lines.push(this.line(view.step === 'password' ? 'Your website login ran out.' : HINT, 'is-quiet'));
    }
    this.offer.replaceChildren(...lines);

    const message = this.note ?? ('message' in view ? view.message : null);
    this.message.textContent = message ?? '';
    this.message.hidden = message === null;
  }

  private icon(url: string | null): HTMLElement {
    const icon = this.doc.createElement('span');
    icon.className = 'redeem-icon';
    if (url !== null) icon.style.backgroundImage = `url(${JSON.stringify(url)})`;
    return icon;
  }
}

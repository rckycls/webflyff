// The Guild Siege's offer window (2026-11-15, B3; docs/guild-siege/research/A-client.md §2.1): what Frankie's Apply opens
// when the world server answers GC_IN_WINDOW. V15 builds the 1:1 offer window for the normal siege too
// (`DPClient.cpp:6836-6840`):
//
//   CWndGuildCombat1to1Offer   _Interface/WndGuildCombat1to1.cpp:563-796   APP_GUILDCOMBAT_1TO1_OFFER, resdata.inc:12062,
//                                                                           304 x 272, "Guild Siege - Apply"
//   WIDC_EDIT1                 the bid, filled with the minimum fee or the own current one (SetGold, :645-655)
//   WIDC_TEXT1                 GuildCombatRedChipGuild.inc (:606-617)
//   WIDC_ACCEPT                the refusals and the confirm box are the hud's (guildCombatHud.ts, `bidRefusal`)

import type { UiArt } from '../art';
import { padField } from '../amountBox';
import { ResWindow } from '../resWindow';
import type { ResLayout } from '../resWindow';
import { RED_CHIP_INFO } from '../../guildCombat/boardTexts';
import { parseBid } from '../../guildCombat/guildCombatRules';
import { setDescription } from '../../items/npcWindowKit';

const EDIT = 'WndEditTile00.tga';

export function applyLayout(title: string): ResLayout {
  return {
    title, width: 304, height: 272,
    controls: [
      { kind: 'static', id: 'WIDC_STATIC2', rect: [20, 18, 116, 34], text: 'Current Application Fee.' },
      { kind: 'edit', id: 'WIDC_EDIT1', rect: [126, 18, 270, 37], tile: EDIT, maxLength: 10 },
      { kind: 'static', id: 'WIDC_STATIC3', rect: [20, 62, 116, 78], text: 'Red Chip Info.' },
      { kind: 'text', id: 'WIDC_TEXT1', rect: [20, 90, 286, 194], tile: EDIT, scroll: true },
      { kind: 'button', id: 'WIDC_ACCEPT', rect: [70, 206, 142, 226], picture: 'ButtAccept.tga', label: 'Accept', quarter: 72 },
      { kind: 'button', id: 'WIDC_CLOSE', rect: [158, 206, 230, 226], picture: 'ButtClose.tga', label: 'Close', quarter: 72 },
    ],
  };
}

export class ApplyWindow {
  readonly window: ResWindow;
  /** Accept: the typed fee (`parseBid`: every digit, so "1,000,000" is a million; 0 for none). */
  onAccept: (fee: number) => void = () => {};
  /** The most fee the phone's number pad takes (the own bid and the own penya, `bidRefusal`). */
  maxFee: () => number = () => 0;
  private readonly field: HTMLInputElement;

  constructor(title: string, art: UiArt, doc: Document = document) {
    const window = new ResWindow(applyLayout(title), art, doc);
    window.frame.element.classList.add('hud-gc', 'hud-gc-apply');
    this.field = window.input('WIDC_EDIT1');
    this.field.inputMode = 'numeric';
    this.field.pattern = '[0-9]*';
    this.field.enterKeyHint = 'done';
    this.field.setAttribute('aria-label', 'Current application fee');
    // 2026-11-16 (owner): the phone's number pad, as the bank's and the mail's amounts (`padField`)
    padField(this.field, art, doc, () => ({ max: this.maxFee() }));
    this.field.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); this.accept(); }
    });
    window.button('WIDC_ACCEPT').addEventListener('click', () => this.accept());
    window.button('WIDC_CLOSE').addEventListener('click', () => window.close());
    setDescription(window, 'WIDC_TEXT1', doc, RED_CHIP_INFO);
    this.window = window;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  get element(): HTMLElement {
    return this.window.element;
  }

  /** Opened centred with the fee in the box: the guild's own when it has bid, else the minimum (`SetGold`). */
  open(ownBid: number, minBid: number): void {
    this.field.value = String(ownBid !== 0 ? ownBid : minBid);
    this.window.open();
  }

  close(): void {
    this.window.close();
  }

  setTitle(title: string): void {
    this.window.frame.setTitle(title);
  }

  private accept(): void {
    this.onAccept(parseBid(this.field.value));
  }
}

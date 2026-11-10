// The guild's small windows (2026-11-10, guild research §3, appendix A §2.7-2.12 and its control tables), each a
// ResWindow from its resdata.inc entry:
//
//   CWndGuildConfirm     APP_GUILD_INVATE 347     resdata.inc:6944-7000  "WndTile08.tga" 240 x 144  WndGuild.cpp:182-252
//   CWndGuildName        APP_GUILDNAME 345        resdata.inc:7502-7549  "WndTile06.tga" 272 x 128  WndGuildName.cpp:10-166
//   CWndGuildNickName    APP_GUILD_NICKNAME 349   resdata.inc:7550-7597  "WndTile08.tga" 272 x 128  WndGuildName.cpp:169-334
//   CWndGuildNotice      APP_GUILD_NOTICE 313     resdata.inc:3254-3301  "WndTile07.tga" 320 x 240  WndGuildTabInfo.cpp:92-188
//   CWndGuildSetLogo     APP_GUILD_SETLOGO 315    resdata.inc:3302-3349  "WndTile07.tga" 208 x 240  WndGuildTabInfo.cpp:191-370
//   CWndGuildDisMiss     APP_GUILD_DISMISS 332    resdata.inc:6065-6112  "WndTile08.tga" 288 x 128  WndGuildTabInfo.cpp:21-88
//   CWndGuildPayConfirm  APP_GUILD_PAYCONFIRM 338 resdata.inc:7001-7057  "WndTile08.tga" 288 x 144  WndGuildTabApp.cpp:465-566
//
// Every one but the invite is modal (`WBS_MODAL`, `WndGuildTabInfo.cpp:51, :140, :303`, `WndGuildTabApp.cpp:496`) and
// opens centred on the screen (`MoveParentCenter`); the invite is centred across, 70 px from the top (`WndGuild.cpp:203-206`).
// On a phone the text fields bring up the phone's keyboard (`enterKeyHint`), and Enter and OK both answer.

import type { UiArt } from '../art';
import { place } from '../button';
import { ResWindow } from '../resWindow';
import type { ResLayout } from '../resWindow';
import { PLAYER_LOGOS, logoCell, logoKey } from '../../guild/guildRules';

const INVITE: ResLayout = {
  title: 'Invite to Guild', width: 240, height: 144,
  controls: [
    { kind: 'static', id: 'WIDC_STATIC3', rect: [32, 12, 192, 28] },
    { kind: 'static', id: 'WIDC_STATIC1', rect: [30, 34, 192, 52], text: 'Guild is inviting you.' },
    { kind: 'static', id: 'WIDC_STATIC2', rect: [30, 56, 190, 74], text: 'Will you join the Guild?' },
    { kind: 'button', id: 'WIDC_OK', rect: [36, 82, 108, 102], picture: 'ButtYes.tga', label: 'YES', quarter: 72 },
    { kind: 'button', id: 'WIDC_NO', rect: [120, 82, 192, 102], picture: 'ButtNo.tga', label: 'NO', quarter: 72 },
  ],
};

const NAME: ResLayout = {
  title: 'Guild Name Setup Window', width: 272, height: 128, modal: true,
  controls: [
    { kind: 'static', id: 'WIDC_STATIC1', rect: [42, 10, 206, 28], text: 'Enter the guild name.' },
    { kind: 'edit', id: 'WIDC_EDIT1', rect: [8, 36, 252, 56], tile: 'WndEditTile00.tga', maxLength: 32 },
    { kind: 'button', id: 'WIDC_OK', rect: [46, 68, 118, 88], picture: 'ButtOk.tga', label: 'OK', quarter: 72 },
    { kind: 'button', id: 'WIDC_CANCEL', rect: [130, 68, 202, 88], picture: 'ButtCancel.tga', label: 'CANCEL', quarter: 72 },
  ],
};

const NICKNAME: ResLayout = {
  title: 'Setup Guild Title', width: 272, height: 128, modal: true,
  controls: [
    { kind: 'static', id: 'WIDC_STATIC1', rect: [44, 12, 246, 30], text: 'Enter Title' },
    { kind: 'edit', id: 'WIDC_EDIT1', rect: [40, 36, 224, 55], tile: 'WndEditTile00.tga', maxLength: 12 },
    { kind: 'button', id: 'WIDC_OK', rect: [48, 66, 120, 86], picture: 'ButtOk.tga', label: 'OK', quarter: 72 },
    { kind: 'button', id: 'WIDC_CANCEL', rect: [130, 64, 202, 84], picture: 'ButtCancel.tga', label: 'Cancel', quarter: 72 },
  ],
};

const NOTICE: ResLayout = {
  title: 'Guild Notice Setup Window', width: 320, height: 240, modal: true,
  controls: [
    // WIDC_EDIT1 6,6,308,176: a multi-line edit (`EBS_WANTRETURN | EBS_AUTOVSCROLL`, :104-134), built below as a textarea
    { kind: 'custom', id: 'WIDC_EDIT1', rect: [6, 6, 308, 176], tile: 'WndEditTile00.tga' },
    { kind: 'button', id: 'WIDC_BUTTON1', rect: [28, 182, 100, 202], picture: 'ButtNoticeNew.BMP', label: 'New Notice', quarter: 72 },
    { kind: 'button', id: 'WIDC_BUTTON2', rect: [116, 182, 188, 202], picture: 'ButtNoticeStart.BMP', label: 'Open Notice', quarter: 72 },
    { kind: 'button', id: 'WIDC_BUTTON3', rect: [204, 182, 276, 202], picture: 'ButtNoticeEdit.BMP', label: 'Modify Notice', quarter: 72 },
  ],
};

/** A player's logo window is cut to 208 high, the GM Logo button hidden (`WndGuildTabInfo.cpp:276-288`). */
const LOGO: ResLayout = {
  title: 'Guild Logo Setup Window', width: 208, height: 208, modal: true,
  controls: [
    { kind: 'custom', id: 'WIDC_STATIC1', rect: [12, 10, 182, 144], tile: 'WndEditTile00.tga' },
    { kind: 'button', id: 'WIDC_OK', rect: [18, 150, 90, 170], picture: 'ButtOk.tga', label: 'Setup Logo', quarter: 72 },
    { kind: 'button', id: 'WIDC_CANCEL', rect: [100, 150, 172, 170], picture: 'ButtCancel.tga', label: 'Cancel', quarter: 72 },
  ],
};

const DISBAND: ResLayout = {
  title: 'Disband Guild Confirmation Window', width: 288, height: 128, modal: true,
  controls: [
    { kind: 'custom', id: 'WIDC_EDIT1', rect: [10, 10, 266, 62], tile: 'WndEditTile00.tga' },
    { kind: 'static', id: 'WIDC_STATIC1', rect: [44, 24, 244, 44], text: 'Do you want to disband the guild?' },
    { kind: 'button', id: 'WIDC_YES', rect: [52, 70, 124, 90], picture: 'ButtYes.tga', label: 'Yes', quarter: 72 },
    { kind: 'button', id: 'WIDC_NO', rect: [136, 70, 208, 90], picture: 'ButtNo.tga', label: 'No', quarter: 72 },
  ],
};

const PAY: ResLayout = {
  title: 'Setup Pay per Title', width: 288, height: 144, modal: true,
  controls: [
    { kind: 'static', id: 'WIDC_STATIC1', rect: [38, 12, 232, 30], text: 'What amount will you set for payment?' },
    { kind: 'static', id: 'WIDC_STATIC2', rect: [44, 46, 86, 64], text: 'Amount' },
    { kind: 'edit', id: 'WIDC_EDIT1', rect: [90, 46, 210, 64], tile: 'WndEditTile00.tga', maxLength: 6 },
    { kind: 'button', id: 'WIDC_YES', rect: [42, 78, 114, 98], picture: 'ButtOk.tga', label: 'OK', quarter: 72 },
    { kind: 'button', id: 'WIDC_NO', rect: [144, 78, 216, 98], picture: 'ButtCancel.tga', label: 'Cancel', quarter: 72 },
  ],
};

/**
 * The phone shows the picture buttons as words (style.css, as the trade's and the shop's): a short word for each, so
 * that 14 px text fits the button's own width.
 */
const PHONE_WORDS: Readonly<Record<string, string>> = {
  'Setup Guild Name': 'Name', 'Setup Notice': 'Notice', 'Setup Logo': 'Logo', 'Disband Guild': 'Disband',
  'Apply Settings': 'Apply', 'Declare Guild Duel': 'Declare', 'Propose Cease-fire': 'Peace', 'Give Up Guild Duel': 'Give up',
  'New Notice': 'New', 'Open Notice': 'Post', 'Modify Notice': 'Edit', CANCEL: 'Cancel', YES: 'Yes', NO: 'No',
};

/** Each button of a guild window gets its phone word (`data-word`). */
export function phoneWords(window: ResWindow): void {
  for (const control of window.layout.controls) {
    if (control.kind !== 'button') continue;
    const label = control.label.startsWith('Setup ') && control.label.endsWith(' pay') ? 'Set' : control.label;
    window.button(control.id).dataset.word = PHONE_WORDS[label] ?? label;
  }
}

/** A window of the guild: its ResWindow with the guild's class and its buttons' phone words. */
function guildWindow(layout: ResLayout, className: string, art: UiArt, doc: Document): ResWindow {
  const window = new ResWindow(layout, art, doc);
  window.frame.element.classList.add('hud-guild-dialog', className);
  phoneWords(window);
  return window;
}

/** A field that answers with Enter (the desktop's `EN_RETURN`, the phone keyboard's Done). */
function answerOnEnter(input: HTMLInputElement, answer: () => void): void {
  input.enterKeyHint = 'done';
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); answer(); }
  });
}

/** CWndGuildConfirm: the invite received. YES or Enter accepts; NO closes and sends nothing (`:246-249`). */
export class GuildInviteWindow {
  readonly window: ResWindow;
  onYes: () => void = () => {};

  constructor(art: UiArt, doc: Document = document) {
    const window = guildWindow(INVITE, 'hud-guild-invite', art, doc);
    window.button('WIDC_OK').addEventListener('click', () => { this.onYes(); window.close(); });
    window.button('WIDC_NO').addEventListener('click', () => window.close());
    this.window = window;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  /** The guild's name in WIDC_STATIC3 (`:201-202`), centred across and 70 px down (`:203-206`). */
  open(guildName: string): void {
    this.window.setText('WIDC_STATIC3', guildName);
    const layer = this.window.frame.element.parentElement;
    this.window.open({ x: Math.trunc(((layer?.clientWidth ?? 0) - INVITE.width) / 2), y: 70 });
  }

  close(): void {
    this.window.close();
  }
}

/** A one-field window (the name, the nickname, the salary): OK or Enter runs `onOk` with the typed text. */
export class GuildFieldWindow {
  readonly window: ResWindow;
  /** OK: the typed text; answering true closes the window. */
  onOk: (typed: string) => boolean = () => true;
  private readonly field: HTMLInputElement;

  constructor(layout: ResLayout, className: string, private readonly okId: string, cancelId: string, art: UiArt, doc: Document, numeric = false) {
    const window = guildWindow(layout, className, art, doc);
    this.field = window.input('WIDC_EDIT1');
    if (numeric) {
      this.field.inputMode = 'numeric';
      this.field.pattern = '[0-9]*';
    }
    const ok = (): void => { if (this.onOk(this.field.value)) window.close(); };
    window.button(okId).addEventListener('click', ok);
    window.button(cancelId).addEventListener('click', () => window.close());
    answerOnEnter(this.field, ok);
    this.window = window;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  get value(): string {
    return this.field.value;
  }

  set value(text: string) {
    this.field.value = text;
  }

  open(text = ''): void {
    this.field.value = text;
    this.window.open();
    this.field.focus();
  }

  close(): void {
    this.window.close();
  }
}

/** CWndGuildName (`WndGuildName.cpp:39-60`): the current name in the field. */
export const guildNameWindow = (art: UiArt, doc: Document = document): GuildFieldWindow =>
  new GuildFieldWindow(NAME, 'hud-guild-name', 'WIDC_OK', 'WIDC_CANCEL', art, doc);

/** CWndGuildNickName. */
export const guildNicknameWindow = (art: UiArt, doc: Document = document): GuildFieldWindow =>
  new GuildFieldWindow(NICKNAME, 'hud-guild-nickname', 'WIDC_OK', 'WIDC_CANCEL', art, doc);

/** CWndGuildPayConfirm: digits only. */
export const guildPayWindow = (art: UiArt, doc: Document = document): GuildFieldWindow =>
  new GuildFieldWindow(PAY, 'hud-guild-pay', 'WIDC_YES', 'WIDC_NO', art, doc, true);

/**
 * CWndGuildNotice: New Notice empties the box, Open Notice posts it (`onPost`, which closes it when it answers true),
 * Modify Notice puts the caret in it (`:157-188`). The box is pre-filled with the notice.
 */
export class GuildNoticeWindow {
  readonly window: ResWindow;
  onPost: (text: string) => boolean = () => true;
  readonly area: HTMLTextAreaElement;

  constructor(art: UiArt, doc: Document = document) {
    const window = guildWindow(NOTICE, 'hud-guild-notice', art, doc);
    const area = doc.createElement('textarea');
    area.className = 'hud-guild-notice-text';
    area.spellcheck = false;
    area.maxLength = 127;
    area.enterKeyHint = 'enter';
    area.addEventListener('keydown', (event) => event.stopPropagation());
    area.addEventListener('keyup', (event) => event.stopPropagation());
    window.control('WIDC_EDIT1').append(area);
    window.button('WIDC_BUTTON1').addEventListener('click', () => { area.value = ''; area.focus(); });
    window.button('WIDC_BUTTON2').addEventListener('click', () => { if (this.onPost(area.value)) window.close(); });
    window.button('WIDC_BUTTON3').addEventListener('click', () => area.focus());
    this.area = area;
    this.window = window;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  open(notice: string): void {
    this.area.value = notice;
    this.window.open();
    this.area.focus();
  }

  close(): void {
    this.window.close();
  }
}

/**
 * CWndGuildSetLogo: the 20 player logos in 5 columns of 4 rows, 24 x 24, the chosen one with two magenta rings 1 and 2 px
 * outside it (`:203-237`); OK sends the choice (1-based, 0 for none, `:334-346`).
 */
export class GuildLogoWindow {
  readonly window: ResWindow;
  onOk: (logo: number) => void = () => {};
  private chosen = 0;
  private readonly cells: HTMLButtonElement[] = [];

  constructor(art: UiArt, url: (key: string) => string, doc: Document = document) {
    const window = guildWindow(LOGO, 'hud-guild-logo', art, doc);
    const grid = window.control('WIDC_STATIC1');
    for (let k = 0; k < PLAYER_LOGOS; k++) {
      const cell = doc.createElement('button');
      cell.type = 'button';
      cell.className = 'hud-guild-logo-cell';
      cell.dataset.logo = String(k + 1);
      cell.setAttribute('aria-label', `Logo ${k + 1}`);
      const at = logoCell(k);
      // the grid's top left is the window's client area: the cells sit at their place less the static's corner
      place(cell, { left: at.left - 12, top: at.top - 10, width: 24, height: 24 });
      const src = url(logoKey(k + 1));
      if (src !== '') cell.style.backgroundImage = `url("${src}")`;
      cell.addEventListener('click', () => { this.choose(k + 1); });
      this.cells.push(cell);
      grid.append(cell);
    }
    window.button('WIDC_OK').addEventListener('click', () => { this.onOk(this.chosen); window.close(); });
    window.button('WIDC_CANCEL').addEventListener('click', () => window.close());
    this.window = window;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  /** Opens with the guild's logo chosen (`m_nSelectLogo = m_dwLogo`). */
  open(logo: number): void {
    this.choose(logo);
    this.window.open();
  }

  private choose(logo: number): void {
    this.chosen = logo;
    this.cells.forEach((cell, k) => cell.setAttribute('aria-pressed', String(k + 1 === logo)));
  }
}

/** CWndGuildDisMiss: YES runs `onYes` (its checks and the packet) and closes either way (`:68-88`). */
export class GuildDisbandWindow {
  readonly window: ResWindow;
  onYes: () => void = () => {};

  constructor(art: UiArt, doc: Document = document) {
    const window = guildWindow(DISBAND, 'hud-guild-disband', art, doc);
    window.button('WIDC_YES').addEventListener('click', () => { this.onYes(); window.close(); });
    window.button('WIDC_NO').addEventListener('click', () => window.close());
    this.window = window;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  open(): void {
    this.window.open();
  }
}

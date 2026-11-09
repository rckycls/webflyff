// The Messenger's small windows (2026-11-10, friends-say research §4, §5):
//
//   CWndAddFriend      APP_ADDFRIEND 270       resdata.inc:27903-27958   "WndTile06.tga", 240 x 144, "Add Friend": "Enter
//                                                                        Name", "Name :", the edit, OK, Cancel
//                      _Interface/WndFriendConFirm.cpp:111-224          the edit focused; centred (MoveParentCenter)
//   CWndFriendConFirm  APP_FRIEND_CONFIRM 226  resdata.inc:24426-24462   "WndTile08.tga", 288 x 128, "Confirm Friend Request":
//                                                                        the text (TID_DIAG_0071), Yes, No
//                      WndFriendConFirm.cpp:11-109                      centred across, 70 px down; Yes ADDFRIEND, No
//                                                                        ADDFRIENDCANCEL (its close box answers nothing)
//   CWndMessage        APP_MESSAGE 223         resdata.inc:23646-23683   "WndTile07.tga", 336 x 288, "Message - name",
//                                                                        WBS_THICKFRAME (at least 160 x 160)
//                      _Interface/WndMessenger.cpp:1107-1267            the text, the edit and Send; Enter or Send sends
//                                                                        `/say "name" text`; a line "name :" then the words
//   CWndInstantMsg     APP_INSTANTMSG 224      resdata.inc:25074-25093   "WndInstantMsg.tga" (one picture), 144 x 112
//                      WndMessenger.cpp:990-1104                        gone 10 s after its last line; a press opens the
//                                                                        Message window with that line

import type { UiArt } from '../art';
import { cssRgb } from '../art';
import { pictureButton, place } from '../button';
import type { ControlRect } from '../button';
import { WindowFrame } from '../frame';
import { EDIT, editTiles } from '../tiles';

/** OK, Cancel, Yes and No: 288 x 20, four states of 72 px. */
const QUARTER = 72;

function staticText(doc: Document, cls: string, value: string, rect: ControlRect): HTMLElement {
  const element = doc.createElement('div');
  element.className = cls;
  element.textContent = value;
  place(element, rect);
  return element;
}

function tiledBox(doc: Document, art: UiArt, cls: string, rect: ControlRect): HTMLElement {
  const box = doc.createElement('div');
  box.className = cls;
  place(box, rect);
  box.append(editTiles(doc, art, Math.trunc(rect.width / EDIT), Math.ceil(rect.height / EDIT)));
  return box;
}

function button(doc: Document, art: UiArt, name: string, label: string, picture: string, rect: ControlRect, press: () => void): HTMLButtonElement {
  const element = pictureButton(doc, art, picture, rect, QUARTER, press);
  element.dataset.button = name;
  element.setAttribute('aria-label', label);
  return element;
}

/** `CWndAddFriend`. */
export class AddFriendWindow {
  readonly frame: WindowFrame;
  /** OK with the name typed. */
  onOk: (name: string) => void = () => {};
  readonly edit: HTMLInputElement;

  constructor(art: UiArt, doc: Document = document) {
    const frame = new WindowFrame('Add Friend', art, { width: 240, height: 144 }, doc);
    frame.element.classList.add('hud-add-friend');
    const editRect = { left: 70, top: 50, width: 132, height: 20 };
    const editBox = tiledBox(doc, art, 'hud-friend-edit', editRect);
    this.edit = doc.createElement('input');
    this.edit.type = 'text';
    this.edit.maxLength = 64;
    this.edit.setAttribute('aria-label', 'Name :');
    this.edit.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); this.onOk(this.edit.value); }
    });
    editBox.append(this.edit);
    frame.body.append(
      staticText(doc, 'hud-friend-text', 'Enter Name', { left: 42, top: 14, width: 148, height: 20 }),
      staticText(doc, 'hud-friend-text', 'Name :', { left: 16, top: 48, width: 44, height: 20 }),
      editBox,
      button(doc, art, 'ok', 'OK', 'ButtOk.tga', { left: 28, top: 82, width: 72, height: 20 }, () => this.onOk(this.edit.value)),
      button(doc, art, 'cancel', 'Cancel', 'ButtCancel.tga', { left: 128, top: 80, width: 72, height: 20 }, () => frame.close()),
    );
    this.frame = frame;
  }

  open(): void {
    this.edit.value = '';
    this.frame.open('center');
    this.edit.focus();
  }
}

/** `CWndFriendConFirm`. */
export class FriendConfirm {
  readonly frame: WindowFrame;
  onYes: () => void = () => {};
  onNo: () => void = () => {};
  private readonly message: HTMLElement;

  constructor(art: UiArt, doc: Document = document) {
    const frame = new WindowFrame('Confirm Friend Request', art, { width: 288, height: 128 }, doc);
    frame.element.classList.add('hud-friend-confirm');
    const textRect = { left: 8, top: 8, width: 256, height: 52 };
    const box = tiledBox(doc, art, 'hud-confirm-box', textRect);
    this.message = staticText(doc, 'hud-friend-confirm-text', '', { left: 4, top: 4, width: textRect.width - 12, height: textRect.height - 14 });
    box.append(this.message);
    frame.body.append(
      box,
      button(doc, art, 'yes', 'Yes', 'ButtYes.tga', { left: 64, top: 68, width: 72, height: 20 }, () => { this.onYes(); frame.close(); }),
      button(doc, art, 'no', 'No', 'ButtNo.tga', { left: 148, top: 68, width: 72, height: 20 }, () => { this.onNo(); frame.close(); }),
    );
    this.frame = frame;
  }

  get isOpen(): boolean {
    return this.frame.isOpen;
  }

  /** Centred across, 70 px from the top (`OnInitialUpdate`, :57-60). */
  open(text: string): void {
    this.message.textContent = text;
    const layer = this.frame.element.parentElement;
    this.frame.open({ x: Math.trunc(((layer?.clientWidth ?? 0) - 288) / 2), y: 70 });
  }
}

const MESSAGE_WIDTH = 336;
const MESSAGE_HEIGHT = 288;
/** The client area of a captioned window: 12 narrower, 32 lower (the party window's). */
const CLIENT_W = (width: number): number => width - 12;
const CLIENT_H = (height: number): number => height - 32;

/** `CWndMessage`: one per name. */
export class MessageWindow {
  readonly frame: WindowFrame;
  /** Enter or Send with words: the line to send (`/say "name" text`). */
  onSend: (text: string) => void = () => {};
  /** The window closed (`OnDestroy`: out of `m_mapMessage`). */
  onClosed: () => void = () => {};
  private readonly text: HTMLElement;
  private readonly textBox: HTMLElement;
  private readonly editBox: HTMLElement;
  readonly edit: HTMLTextAreaElement;
  private readonly send: HTMLButtonElement;

  constructor(private readonly art: UiArt, readonly name: string, private readonly doc: Document = document) {
    const frame = new WindowFrame(`Message - ${name}`, art, {
      width: MESSAGE_WIDTH, height: MESSAGE_HEIGHT, resize: { width: 160, height: 160 },
    }, doc);
    frame.element.classList.add('hud-message');
    frame.element.dataset.player = name;
    this.textBox = doc.createElement('div');
    this.textBox.className = 'hud-message-box';
    this.text = doc.createElement('div');
    this.text.className = 'hud-message-text';
    this.text.setAttribute('role', 'log');
    this.textBox.append(this.text);
    this.editBox = doc.createElement('div');
    this.editBox.className = 'hud-message-box';
    this.edit = doc.createElement('textarea');
    this.edit.className = 'hud-message-edit';
    this.edit.setAttribute('aria-label', `Message to ${name}`);
    this.edit.addEventListener('keydown', (event) => {
      // EN_RETURN: Enter sends (`OnChildNotify`, :1215-1229)
      if (event.key === 'Enter') { event.preventDefault(); this.submit(); }
    });
    this.editBox.append(this.edit);
    this.send = pictureButton(doc, art, 'ButtSend.bmp', { left: 252, top: 204, width: 64, height: 40 }, 64, () => this.submit());
    this.send.dataset.button = 'send';
    this.send.setAttribute('aria-label', 'Send');
    frame.body.append(this.textBox, this.editBox, this.send);
    frame.onClose = () => this.onClosed();
    frame.onResize = (width, height) => this.layout(width, height);
    this.frame = frame;
    this.layout(MESSAGE_WIDTH, MESSAGE_HEIGHT);
  }

  /** `OnSize` (:1166-1203): the text above a 50 px band; the edit and Send in it. */
  private layout(width: number, height: number): void {
    const w = CLIENT_W(width), h = CLIENT_H(height);
    const text = { left: 4, top: 4, width: w - 8, height: h - 54 };
    const edit = { left: 4, top: h - 45, width: w - 84, height: 41 };
    for (const [box, rect] of [[this.textBox, text], [this.editBox, edit]] as const) {
      place(box, rect);
      box.querySelector('.hud-edit-tiles')?.remove();
      box.prepend(editTiles(this.doc, this.art, Math.trunc(rect.width / EDIT), Math.ceil(rect.height / EDIT)));
    }
    this.send.style.left = `${w - 74}px`;
    this.send.style.top = `${h - 45}px`;
  }

  private submit(): void {
    const value = this.edit.value.replace(/[\r\n]+/g, ' ').trim();
    if (value === '' || this.send.disabled) return;
    this.onSend(value);
    this.edit.value = '';
  }

  /** `AddMessage`: "name :" in `color`, then the words on the next line, two spaces in; the newest shown. */
  add(from: string, words: string, color: number): void {
    const head = this.doc.createElement('div');
    head.className = 'hud-message-from';
    head.textContent = `${from} :`;
    head.style.color = cssRgb(color);
    const line = this.doc.createElement('div');
    line.className = 'hud-message-words';
    line.textContent = `  ${words}`;
    this.text.append(head, line);
    this.textBox.scrollTop = this.textBox.scrollHeight;
  }

  /** A blocked friend (`OnSay`, :11949-11959): Send disabled and the edit hidden. */
  block(): void {
    this.send.disabled = true;
    this.edit.hidden = true;
  }

  /** The lines shown (for the tests). */
  get lines(): string[] {
    return [...this.text.children].map((child) => child.textContent ?? '');
  }
}

const INSTANT_WIDTH = 144;
const INSTANT_HEIGHT = 112;
/** `m_timer.Set( SEC( 10 ) )` (:1007). */
export const INSTANT_MS = 10_000;

/** `CWndInstantMsg`: one per name. */
export class InstantMessage {
  readonly frame: WindowFrame;
  /** A press on it (not on its close box): the Message window with the last line (`OnLButtonUp`, :1039-1047). */
  onPress: () => void = () => {};
  onClosed: () => void = () => {};
  /** `m_strMessage`: the last `/say` line, '' for a log-in notice. */
  lastWords = '';
  /** When it goes (ms of `now`). */
  endsAt = 0;
  private readonly text: HTMLElement;

  constructor(art: UiArt, readonly name: string, private readonly doc: Document = document) {
    const frame = new WindowFrame('', art, { width: INSTANT_WIDTH, height: INSTANT_HEIGHT, texture: 'WndInstantMsg.tga' }, doc);
    frame.element.classList.add('hud-instant-message');
    frame.element.dataset.player = name;
    this.text = doc.createElement('div');
    this.text.className = 'hud-instant-text';
    place(this.text, { left: 0, top: 0, width: 132, height: 80 });
    this.text.addEventListener('click', () => this.onPress());
    frame.body.append(this.text);
    frame.onClose = () => this.onClosed();
    this.frame = frame;
  }

  /** `AddMessage` (:1071-1083): "name :" in blue, then the words. */
  add(from: string, words: string, now: number): void {
    this.lastWords = words;
    this.line(`${from} :`, `  ${words}`);
    this.endsAt = now + INSTANT_MS;
  }

  /** `AddMessageJoin` (:1085-1095): "{name}has logged into the game." in blue (TID_GAME_LOGIN). */
  addJoin(text: string, now: number): void {
    this.line(text, null);
    this.endsAt = now + INSTANT_MS;
  }

  private line(head: string, words: string | null): void {
    const first = this.doc.createElement('div');
    first.className = 'hud-instant-from';
    first.textContent = head;
    this.text.append(first);
    if (words !== null) {
      const second = this.doc.createElement('div');
      second.textContent = words;
      this.text.append(second);
    }
  }

  get lines(): string[] {
    return [...this.text.children].map((child) => child.textContent ?? '');
  }
}

/** Where the `n`-th open instant message goes (`OpenInstantMsg`, `WndManager.cpp:7139-7150`), in a `width` x `height` layer. */
export function instantPlace(n: number, width: number, height: number): { x: number; y: number } {
  const perColumn = Math.max(1, Math.trunc(height / INSTANT_HEIGHT));
  const column = Math.trunc(n / perColumn) + 1;
  const row = (n % perColumn) + 1;
  return { x: width - INSTANT_WIDTH * column, y: height - INSTANT_HEIGHT * row };
}

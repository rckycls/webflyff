// The post's windows (2026-11-10, docs/superpowers/specs/2026-11-10-bank-mail-research.md §2; B-mail.md §2-§6), each laid out
// from its resdata.inc entry by `ResWindow` (resData.txt.txt's English):
//
//   CWndPost               APP_POST 517            resdata.inc:27030-27050  tiled, 320 x 368, "POST": WIDC_TABCTRL1 8,8,314,330,
//                                                                         its tabs at the bottom (WndField.cpp:13857-13880)
//   CWndPostSend           APP_POST_SEND 513       resdata.inc:26928-27029  tab 0 "Send Mail": Receiver, Title, the text, the item
//                                                                         slot, Penya (14 px left on English clients,
//                                                                         :14234-14247), Send, "Rental Fee : 500 Penya"
//   CWndPostReceive        APP_POST_RECEIVE 515    resdata.inc:25848-25859  tab 1 "Inbox": drawn in code (:15089-15258), 6 rows of
//                                                                         40 px over WndPostTable.tga at alpha 150
//   CWndPostRead           APP_POST_READ 525       resdata.inc:25539-25649  288 x 336, "Check Post Box", modal
//   CWndPostDeleteConfirm  APP_POST_DELETE_CONFIRM resdata.inc:2429-2467    256 x 144, no title, modal
//   CWndPostItemWarning    APP_QUEITMWARNING 482   resdata.inc:23229-23276  320 x 160, "Warning", modal
//   CWndMailRequestingBox  APP_REQUESTING_POST 890 resdata.inc:6605-6634    192 x 192, "Mail Request", modal, no close box, fixed
//
// The windows draw and report presses and drops; post/postHud.ts holds the rules and sends the packets. On a landscape phone
// the post and the read window are panels beside the bag (style.css), and taps replace drags and right clicks.

import type { InventoryItem } from '@flyffweb/protocol';
import type { WebItemProp } from '@flyffweb/formats';
import type { UiArt } from '../art';
import { cssRgb, themeUrl } from '../art';
import { place } from '../button';
import { ResWindow, textScrollBar } from '../resWindow';
import type { ResControl, ResLayout } from '../resWindow';
import { tabStrip } from '../tiles';
import { isPhone } from '../numpad';
import { BAG_DRAG } from '../trade/tradeWindows';
import { itemIconOf } from '../../pets/petStatus';

const EDIT = 'WndEditTile00.tga';
const LABEL = 'WndEditTile200.tga';
const button = (id: string, rect: ResControl['rect'], picture: string, label: string, quarter = 72): ResControl =>
  ({ kind: 'button', id, rect, picture, label, quarter });

/** The drag of a mail's item and of its penya out of the read window (`m_bDrag`, `CWndGold`), onto the bag. */
export const MAIL_DRAG = 'application/x-flyff-mail-item';
export const MAIL_PENYA_DRAG = 'application/x-flyff-mail-penya';

/** APP_POST (resdata.inc:27030-27050). */
export const POST: ResLayout = {
  title: 'POST', width: 320, height: 368,
  controls: [{ kind: 'custom', id: 'WIDC_TABCTRL1', rect: [8, 8, 314, 330] }],
};
/** The tab control's page: its rect less the 18 px of the strip under it (WndControl.cpp:4522-4533). */
const PAGE = { width: 306, height: 304 };
const STRIP_TOP = 302;

/** APP_POST_SEND (resdata.inc:26928-27029), page coordinates; Penya and its field as English clients move them. */
export const POST_SEND: readonly ResControl[] = [
  { kind: 'static', id: 'WIDC_STATIC1', rect: [12, 18, 78, 34], group: LABEL, text: 'Receiver' },
  { kind: 'combo', id: 'WIDC_COMBOBOX1', rect: [86, 18, 256, 36], tile: EDIT, maxLength: 16 },
  { kind: 'static', id: 'WIDC_STATIC5', rect: [12, 44, 78, 60], group: LABEL, text: 'Title' },
  { kind: 'edit', id: 'WIDC_EDIT2', rect: [86, 42, 256, 60], tile: EDIT, maxLength: 31 },
  { kind: 'custom', id: 'WIDC_EDIT3', rect: [7, 74, 267, 210], tile: EDIT },
  { kind: 'custom', id: 'WIDC_STATIC3', rect: [12, 228, 44, 260] },
  { kind: 'static', id: 'WIDC_STATIC2', rect: [50, 238, 112, 254], text: 'Penya' },
  { kind: 'edit', id: 'WIDC_EDIT4', rect: [98, 238, 194, 254], tile: EDIT, maxLength: 10 },
  button('WIDC_SEND', [201, 224, 267, 266], 'ButtSend.bmp', 'Send', 64),
  { kind: 'static', id: 'WIDC_STATIC4', rect: [16, 272, 266, 288], group: LABEL, text: 'Rental Fee : 500 Penya' },
];

/** APP_POST_READ (resdata.inc:25539-25649); the penya field widened by 32 px (WndField.cpp:14599-14601). */
export const POST_READ: ResLayout = {
  title: 'Check Post Box', width: 288, height: 336, modal: true,
  controls: [
    { kind: 'static', id: 'WIDC_STATIC1', rect: [12, 18, 76, 34], group: LABEL, text: 'Sender' },
    { kind: 'static', id: 'WIDC_STATIC2', rect: [12, 46, 82, 62], group: LABEL, text: 'Title' },
    { kind: 'edit', id: 'WIDC_EDIT1', rect: [78, 18, 254, 36], tile: EDIT, readOnly: true },
    { kind: 'edit', id: 'WIDC_EDIT2', rect: [78, 46, 258, 64], tile: EDIT, readOnly: true },
    { kind: 'text', id: 'WIDC_TEXT1', rect: [14, 76, 262, 212], tile: EDIT, scroll: true },
    { kind: 'custom', id: 'WIDC_STATIC3', rect: [16, 224, 48, 256] },
    { kind: 'custom', id: 'WIDC_STATIC4', rect: [78, 234, 98, 254] },
    { kind: 'edit', id: 'WIDC_EDIT3', rect: [102, 236, 225, 255], tile: EDIT, readOnly: true },
    button('WIDC_BUTTON1', [16, 270, 88, 290], 'ButtDelete.tga', 'Delete'),
    button('WIDC_BUTTON2', [102, 270, 174, 290], 'ButtReply.tga', 'Reply'),
    button('WIDC_BUTTON3', [188, 270, 262, 290], 'ButtClose.tga', 'Close'),
  ],
};

/** APP_POST_DELETE_CONFIRM (resdata.inc:2429-2467): no title. */
export const POST_DELETE: ResLayout = {
  title: '', width: 256, height: 144, modal: true,
  controls: [
    { kind: 'text', id: 'WIDC_TEXT1', rect: [8, 8, 240, 82], tile: EDIT },
    button('WIDC_YES', [46, 86, 118, 106], 'ButtYes.tga', 'Yes'),
    button('WIDC_NO', [128, 86, 200, 106], 'ButtNo.tga', 'No'),
  ],
};

/** APP_QUEITMWARNING (resdata.inc:23229-23276), the post's storage-fee warning. */
export const POST_WARNING: ResLayout = {
  title: 'Warning', width: 320, height: 160, modal: true,
  controls: [
    { kind: 'static', id: 'WIDC_WARNING', rect: [8, 18, 72, 82], picture: 'WndQueItmwarning.tga' },
    { kind: 'text', id: 'WIDC_CONTEXT', rect: [72, 8, 300, 88], tile: EDIT },
    button('WIDC_BTN_YES', [72, 96, 144, 116], 'ButtYes.tga', 'Yes'),
    button('WIDC_BTN_NO', [164, 96, 236, 116], 'ButtNo.tga', 'No'),
  ],
};

/** APP_REQUESTING_POST (resdata.inc:6605-6634): no close box (`m_bNoCloseButton`), not movable. */
export const MAIL_REQUEST: ResLayout = {
  title: 'Mail Request', width: 192, height: 192, modal: true, frame: { closeButton: false },
  controls: [
    { kind: 'static', id: 'WIDC_STATIC_REQUEST', rect: [28, 44, 156, 60], text: 'Requesting the post...' },
    button('WIDC_BUTTON_REQUEST', [60, 82, 124, 122], 'ButtSend.bmp', 'Request', 64),
  ],
};

/** A slot's item: its icon, and a stack's count at the bottom right (0xffb0b0f0 over 0xff0000ff). */
function fillSlot(doc: Document, art: UiArt, slot: HTMLElement, item: InventoryItem | undefined, prop: WebItemProp | undefined, count: number): void {
  slot.replaceChildren();
  slot.dataset.filled = String(item !== undefined);
  if (item === undefined) { slot.removeAttribute('aria-label'); return; }
  slot.setAttribute('aria-label', `${prop?.name ?? `Item ${item.itemId}`} ×${count}`);
  const icon = itemIconOf(item, prop);
  if (icon !== null) {
    const img = doc.createElement('img');
    img.src = art.url(icon);
    img.alt = '';
    slot.append(img);
  }
  if ((prop?.packMax ?? 1) > 1) {
    const span = doc.createElement('span');
    span.textContent = String(count);
    slot.append(span);
  }
}

/** One inbox row as `CWndPostReceive::OnDraw` writes it. */
export interface InboxRow {
  id: number;
  item?: InventoryItem;
  prop?: WebItemProp;
  /** The penya seed (`itm_GolGolSeed.dds`) for a mail with penya and no item. */
  penyaOnly: boolean;
  read: boolean;
  sender: string;
  time: string;
  color: [number, number, number];
  /** At most 0 days: the time 3 px further left (:15223-15226). */
  late: boolean;
  title: string;
  /** The received date's tooltip. */
  tip: string;
}

/** What the Send page holds. */
export interface SendForm {
  receiver: string;
  title: string;
  text: string;
  penya: string;
}

/** CWndPost with its two pages. */
export class PostWindow {
  readonly window: ResWindow;
  readonly phone: boolean;
  /** A tab chosen by a press (`WNM_SELCHANGE`): 0 Send Mail, 1 Inbox. */
  onTab: (tab: number) => void = () => {};
  onSend: (form: SendForm) => void = () => {};
  /** A bag item dropped on the item slot (desktop). */
  onAttach: (objectId: number) => void = () => {};
  /** The item slot right-clicked (the attachment off, :14376-14394), or tapped on the phone. */
  onDetach: () => void = () => {};
  /** The phone's tap on the penya field: the number pad. */
  onPenyaTap: () => void = () => {};
  /** An inbox row double-clicked (tapped on the phone): read it. */
  onRead: (id: number) => void = () => {};
  /** The attachment hovered: its tooltip, or none. */
  onSlotHover: (anchor: HTMLElement | null) => void = () => {};
  private tab = 1;
  private readonly pages: [HTMLElement, HTMLElement];
  private readonly strip: HTMLElement;
  readonly receiver: HTMLInputElement;
  readonly title: HTMLInputElement;
  readonly body: HTMLTextAreaElement;
  readonly penya: HTMLInputElement;
  readonly slot: HTMLElement;
  private readonly list: HTMLElement;
  private readonly scroll: { draw(): void };
  private selected = -1;
  private titles: [string, string] = ['Send Mail', 'Inbox'];

  constructor(private readonly art: UiArt, private readonly doc: Document = document) {
    this.phone = isPhone(doc);
    const window = new ResWindow({ ...POST, controls: [...POST.controls, ...POST_SEND] }, art, doc);
    window.frame.element.classList.add('hud-post');
    const tabs = window.control('WIDC_TABCTRL1');
    tabs.classList.add('hud-post-tabs');
    const send = doc.createElement('div');
    send.className = 'hud-post-page';
    send.dataset.page = 'send';
    const inbox = doc.createElement('div');
    inbox.className = 'hud-post-page';
    inbox.dataset.page = 'inbox';
    for (const page of [send, inbox]) place(page, { left: 0, top: 0, width: PAGE.width, height: PAGE.height });
    // the Send page's controls into its page (their rects are the page's)
    for (const control of POST_SEND) send.append(window.control(control.id).closest<HTMLElement>('[data-control]') ?? window.control(control.id));
    this.strip = doc.createElement('div');
    this.strip.className = 'hud-post-strip';
    place(this.strip, { left: 0, top: STRIP_TOP, width: PAGE.width, height: 20 });
    tabs.append(send, inbox, this.strip);
    this.pages = [send, inbox];

    this.receiver = window.input('WIDC_COMBOBOX1');
    this.receiver.setAttribute('aria-label', 'Receiver');
    this.receiver.enterKeyHint = 'next';
    this.title = window.input('WIDC_EDIT2');
    this.title.setAttribute('aria-label', 'Title');
    this.title.enterKeyHint = 'next';
    // the text: EBS_WANTRETURN, Enter a new line (WndField.cpp:14190-14199)
    const body = doc.createElement('textarea');
    body.className = 'hud-post-text';
    body.maxLength = 255;
    body.spellcheck = false;
    body.setAttribute('aria-label', 'Mail text');
    body.addEventListener('keydown', (event) => event.stopPropagation());
    body.addEventListener('keyup', (event) => event.stopPropagation());
    window.control('WIDC_EDIT3').append(body);
    this.body = body;
    this.penya = window.input('WIDC_EDIT4');
    this.penya.inputMode = 'numeric';
    this.penya.setAttribute('aria-label', 'Penya');
    this.penya.value = '0';
    if (this.phone) {
      // the phone's number pad, not its keyboard
      this.penya.readOnly = true;
      this.penya.addEventListener('click', () => this.onPenyaTap());
    }
    window.button('WIDC_SEND').addEventListener('click', () => this.onSend(this.form()));

    const slot = window.control('WIDC_STATIC3');
    slot.classList.add('hud-post-slot');
    slot.style.backgroundImage = themeUrl(art, 'WndChgElemItem.bmp');
    slot.setAttribute('role', 'button');
    slot.addEventListener('dragover', (event) => { if (event.dataTransfer?.types.includes(BAG_DRAG) === true) event.preventDefault(); });
    slot.addEventListener('drop', (event) => {
      if (event.dataTransfer?.types.includes(BAG_DRAG) !== true) return;
      event.preventDefault();
      this.onAttach(Number(event.dataTransfer.getData(BAG_DRAG)));
    });
    slot.addEventListener('contextmenu', (event) => { event.preventDefault(); this.onDetach(); });
    slot.addEventListener('click', () => { if (this.phone && slot.dataset.filled === 'true') this.onDetach(); });
    slot.addEventListener('mouseenter', () => { if (slot.dataset.filled === 'true') this.onSlotHover(slot); });
    slot.addEventListener('mouseleave', () => this.onSlotHover(null));
    this.slot = slot;

    // the inbox: WndPostTable.tga at (13, 26), alpha 150, and the rows over it
    const table = doc.createElement('div');
    table.className = 'hud-post-table';
    table.style.backgroundImage = themeUrl(art, 'WndPostTable.tga');
    place(table, { left: 13, top: 26, width: 242, height: 240 });
    const list = doc.createElement('div');
    list.className = 'hud-post-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Inbox');
    place(list, { left: 13, top: 26, width: 236, height: 240 });
    const scroll = textScrollBar(doc, art, list, { left: 0, top: 0, width: 266 - 13 + 16, height: 240 });
    scroll.element.classList.add('hud-post-scroll');
    const box = doc.createElement('div');
    box.className = 'hud-post-inbox';
    place(box, { left: 0, top: 0, width: PAGE.width, height: PAGE.height });
    box.append(table, list, scroll.element);
    inbox.append(box);
    this.list = list;
    this.scroll = scroll;
    this.window = window;
    this.showTab(1);
  }

  get frame(): ResWindow['frame'] {
    return this.window.frame;
  }

  get currentTab(): number {
    return this.tab;
  }

  /** The page shown, and the strip drawn with it chosen (`SetCurSel`, no notice). */
  showTab(tab: number): void {
    this.tab = tab;
    this.pages.forEach((page, i) => { page.hidden = i !== tab; });
    this.frame.element.dataset.tab = tab === 0 ? 'send' : 'inbox';
    this.strip.replaceChildren(tabStrip(this.doc, this.art, PAGE.width, this.titles, tab, (chosen) => {
      if (chosen === this.tab) return;
      this.showTab(chosen);
      this.onTab(chosen);
    }));
    this.scroll.draw();
  }

  /** The tab titles from the texts (`TID_APP_POST_SEND`, `TID_APP_POST_RECEIVE`). */
  setTabTitles(titles: [string, string]): void {
    this.titles = titles;
    this.showTab(this.tab);
  }

  /** `EnableWindow`: the window takes no press while the box is asked for (WndField.cpp:13854). */
  setEnabled(enabled: boolean): void {
    this.frame.element.classList.toggle('is-waiting', !enabled);
  }

  form(): SendForm {
    return { receiver: this.receiver.value.trim(), title: this.title.value, text: this.body.value, penya: this.penya.value.trim() };
  }

  /** The friends for the receiver's list (`m_RTMessenger`, :14209-14232). */
  setFriends(names: readonly string[]): void {
    this.window.setChoices('WIDC_COMBOBOX1', names);
  }

  /** The attachment, its count (the stack's `Extra`) drawn (`OnDraw`, :14144-14185). */
  drawSlot(item: InventoryItem | undefined, prop: WebItemProp | undefined, count: number): void {
    fillSlot(this.doc, this.art, this.slot, item, prop, count);
  }

  /** The inbox's rows (`CWndPostReceive::OnDraw`). */
  drawInbox(rows: readonly InboxRow[]): void {
    const top = this.list.scrollTop;
    if (this.selected >= rows.length) this.selected = -1;
    this.list.replaceChildren(...rows.map((row, i) => this.row(row, i)));
    this.list.scrollTop = top;
    this.scroll.draw();
  }

  private row(row: InboxRow, index: number): HTMLElement {
    const doc = this.doc;
    const element = doc.createElement('div');
    element.className = 'hud-post-row';
    element.setAttribute('role', 'option');
    element.dataset.mailId = String(row.id);
    element.setAttribute('aria-selected', String(index === this.selected));
    element.title = row.tip;
    const icon = doc.createElement('div');
    icon.className = 'hud-post-row-icon';
    const iconKey = row.item !== undefined ? itemIconOf(row.item, row.prop) : row.penyaOnly ? 'ui/item/itm_golgolseed.png' : null;
    if (iconKey !== null) {
      const img = doc.createElement('img');
      img.src = this.art.url(iconKey);
      img.alt = '';
      icon.append(img);
    }
    if (row.item !== undefined && (row.prop?.packMax ?? 1) > 1) {
      const count = doc.createElement('span');
      count.textContent = String(row.item.count);
      icon.append(count);
    }
    if (row.read) {
      const mark = doc.createElement('i');
      mark.className = 'hud-post-row-read';
      mark.style.backgroundImage = themeUrl(this.art, 'WndNotUse.tga');
      icon.append(mark);
    }
    const sender = doc.createElement('div');
    sender.className = 'hud-post-row-sender';
    sender.textContent = row.sender;
    const time = doc.createElement('div');
    time.className = 'hud-post-row-time';
    if (row.late) time.dataset.late = '';
    time.style.color = cssRgb(0xff000000 | (row.color[0] << 16) | (row.color[1] << 8) | row.color[2]);
    time.textContent = row.time;
    const title = doc.createElement('div');
    title.className = 'hud-post-row-title';
    title.textContent = row.title;
    element.append(icon, sender, time, title);
    element.addEventListener('click', () => {
      this.selected = index;
      for (const other of this.list.children) other.setAttribute('aria-selected', String(other === element));
      if (this.phone) this.onRead(row.id);
    });
    element.addEventListener('dblclick', () => { if (!this.phone) this.onRead(row.id); });
    return element;
  }
}

/** CWndPostRead. */
export class PostReadWindow {
  readonly window: ResWindow;
  readonly phone: boolean;
  onDelete: () => void = () => {};
  onReply: () => void = () => {};
  /** The item or the penya taken: a right click (a tap on the phone) or a drag onto the bag (`MailReceiveItem`, `MailReceiveGold`). */
  onTakeItem: () => void = () => {};
  onTakeGold: () => void = () => {};
  onSlotHover: (anchor: HTMLElement | null) => void = () => {};
  private readonly slot: HTMLElement;
  private readonly coin: HTMLElement;

  constructor(private readonly art: UiArt, private readonly doc: Document = document) {
    this.phone = isPhone(doc);
    const window = new ResWindow(POST_READ, art, doc);
    window.frame.element.classList.add('hud-post-read');
    window.button('WIDC_BUTTON1').addEventListener('click', () => this.onDelete());
    window.button('WIDC_BUTTON2').addEventListener('click', () => this.onReply());
    window.button('WIDC_BUTTON3').addEventListener('click', () => window.close());
    const slot = window.control('WIDC_STATIC3');
    slot.classList.add('hud-post-slot');
    slot.style.backgroundImage = themeUrl(art, 'WndChgElemItem.bmp');
    slot.setAttribute('role', 'button');
    slot.draggable = !this.phone;
    slot.addEventListener('dragstart', (event) => {
      if (slot.dataset.filled !== 'true') { event.preventDefault(); return; }
      this.onSlotHover(null);
      event.dataTransfer?.setData(MAIL_DRAG, '1');
    });
    slot.addEventListener('contextmenu', (event) => { event.preventDefault(); if (slot.dataset.filled === 'true') this.onTakeItem(); });
    slot.addEventListener('click', () => { if (this.phone && slot.dataset.filled === 'true') this.onTakeItem(); });
    slot.addEventListener('mouseenter', () => { if (slot.dataset.filled === 'true') this.onSlotHover(slot); });
    slot.addEventListener('mouseleave', () => this.onSlotHover(null));
    const coin = window.control('WIDC_STATIC4');
    coin.classList.add('hud-post-coin');
    coin.style.backgroundImage = themeUrl(art, 'ButtMoney.tga');
    coin.setAttribute('role', 'button');
    coin.setAttribute('aria-label', 'Take the penya');
    coin.draggable = !this.phone;
    coin.addEventListener('dragstart', (event) => {
      if (coin.dataset.filled !== 'true') { event.preventDefault(); return; }
      event.dataTransfer?.setData(MAIL_PENYA_DRAG, '1');
    });
    const takeGold = (event: Event): void => { event.preventDefault(); if (coin.dataset.filled === 'true') this.onTakeGold(); };
    coin.addEventListener('contextmenu', takeGold);
    window.control('WIDC_EDIT3').parentElement!.addEventListener('contextmenu', takeGold);
    for (const target of [coin, window.control('WIDC_EDIT3').parentElement!]) {
      target.addEventListener('click', (event) => { if (this.phone) takeGold(event); });
    }
    this.slot = slot;
    this.coin = coin;
    this.window = window;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  /** `SetValue` (:14663-14733): the sender, the title, the text, the item and the penya (with commas, "0" for none). */
  show(view: { sender: string; title: string; text: string; item?: InventoryItem; prop?: WebItemProp; gold: string; hasGold: boolean }): void {
    this.window.setText('WIDC_EDIT1', view.sender);
    this.window.setText('WIDC_EDIT2', view.title);
    this.window.setText('WIDC_TEXT1', view.text);
    this.window.setText('WIDC_EDIT3', view.gold);
    fillSlot(this.doc, this.art, this.slot, view.item, view.prop, view.item?.count ?? 0);
    this.coin.dataset.filled = String(view.hasGold);
  }

  /** The item and penya as the box now has them (REMOVEMAIL), the texts kept. */
  update(view: { item?: InventoryItem; prop?: WebItemProp; gold: string; hasGold: boolean }): void {
    fillSlot(this.doc, this.art, this.slot, view.item, view.prop, view.item?.count ?? 0);
    this.window.setText('WIDC_EDIT3', view.gold);
    this.coin.dataset.filled = String(view.hasGold);
  }

  open(): void {
    this.window.open();
  }

  close(): void {
    this.window.close();
  }
}

/** A modal box of the post with two buttons: the delete confirm, the fee warning. */
export class PostQuestionBox {
  readonly window: ResWindow;
  onYes: () => void = () => {};

  constructor(layout: ResLayout, art: UiArt, private readonly text: string, private readonly yes: string, no: string, doc: Document = document) {
    const window = new ResWindow(layout, art, doc);
    window.frame.element.classList.add('hud-post-question');
    window.button(yes).addEventListener('click', () => { this.onYes(); window.close(); });
    window.button(no).addEventListener('click', () => window.close());
    this.window = window;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  open(words: string): void {
    this.window.setText(this.text, words);
    this.window.open();
    this.window.button(this.yes).focus();
  }

  close(): void {
    this.window.close();
  }
}

/** CWndMailRequestingBox: the Request button waits 5 s after the box opens and after each press. */
export class MailRequestBox {
  readonly window: ResWindow;
  onRequest: () => void = () => {};

  constructor(art: UiArt, doc: Document = document) {
    const window = new ResWindow(MAIL_REQUEST, art, doc);
    window.frame.element.classList.add('hud-post-request');
    window.frame.movable = false;
    window.frame.escapeCloses = false;
    window.button('WIDC_BUTTON_REQUEST').addEventListener('click', () => this.onRequest());
    this.window = window;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  setRequestEnabled(enabled: boolean): void {
    this.window.button('WIDC_BUTTON_REQUEST').disabled = !enabled;
  }

  open(): void {
    this.window.open();
  }

  close(): void {
    this.window.close();
  }
}

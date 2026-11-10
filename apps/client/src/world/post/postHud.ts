// The post's windows joined to its rules and the session (2026-11-10, docs/superpowers/specs/2026-11-10-bank-mail-research.md
// §2; B-mail.md), so that the world screen only routes messages, presses and the frame to it:
//
//   CWndWorld MMI_POST               _Interface/WndWorld.cpp:4525-4612    the checks, then the bag and CWndPost
//   CWndPost::OnInitialUpdate        _Interface/WndField.cpp:13850-13900  disabled, on Inbox, QUERYMAILBOX, the request box
//   CWndPost::OnChildNotify          WndField.cpp:13921-13940             Inbox chosen: QUERYMAILBOX
//   CWndMailRequestingBox            _Interface/WndMailRequestingBox.cpp  Request after 5 s; gone 5 s after the third press
//   CWndManager::Process             _Interface/WndManager.cpp:3273-3280  QUERYMAILBOX every 5 s while waiting for the box
//   CDPClient::OnMailBox / Req       Neuz/DPClient.cpp:15982-16078        the box: the window enabled, the request box gone
//   CWndPostSend                     WndField.cpp:14101-14508             attach (one bag item, a stack's count), Send's checks
//   CWndPostSendMessageBox           WndField.cpp:14028-14087             OK: QUERYPOSTMAIL, the attachment dropped
//   CWndPostReceive                  WndField.cpp:15032-15432             the rows; a double-click reads
//   CWndPostRead                     WndField.cpp:14522-14939             READMAIL; take the item (the fee's warning after 7
//                                                                         days) or the penya; Delete; Reply
//   CDPClient::OnRemoveMail          DPClient.cpp:15924-15980             0 the mail, 1 its item, 2 its penya, 3 read
//   CWndWorld::Process               WndWorld.cpp:8383-8394               any move: the post's windows go (the bag stays)

import type { InventoryItem, PostMessage } from '@flyffweb/protocol';
import {
  NO_MAIL_ITEM, encodeQueryGetMailGold, encodeQueryGetMailItem, encodeQueryMailBox, encodeQueryPostMail,
  encodeQueryRemoveMail, encodeReadMail,
} from '@flyffweb/protocol';
import type { WebItemProp } from '@flyffweb/formats';
import type { Texts } from '../gameData';
import type { UiArt } from '../hud/art';
import { AmountBox } from '../hud/amountBox';
import { formatText } from '../hud/format';
import { MailRequestBox, POST_DELETE, POST_WARNING, PostQuestionBox, PostReadWindow, PostWindow } from '../hud/post/postWindows';
import type { InboxRow } from '../hud/post/postWindows';
import { withCommas } from '../vendor/vendorRules';
import {
  MAX_KEEP_BASIC_DAY, MAX_KEEP_MAX_DAY, PostBox, itemCost, mailInfo, receivedDate, sendCheck, senderText, storageFee,
  timeLeftColor, timeLeftText, titleText,
} from './postBox';
import type { KeptMail } from './postBox';

const WHITE = 0xffffffff;
/** `REQUEST_BUTTON_WAITING_TIME` (WndMailRequestingBox.h:9) and the waiting re-ask (WndManager.cpp:3273-3280), in ms. */
const REQUEST_WAIT = 5000;
/** `DESTRUCTION_TIME` (WndMailRequestingBox.h:10): the presses after which the box goes. */
const REQUEST_PRESSES = 3;
/** `II_SYS_SYS_SCR_SEALCHARACTER` (Resource/defineItem.h:4907): its mail cannot be deleted (WndField.cpp:14880-14883). */
const SEAL_CHARACTER = 26476;
/** The client's limit on the penya sent (WndField.cpp:14454-14459). */
const MAX_SEND_GOLD = 1_000_000_000;

/** What the post needs of the world screen. */
export interface PostHudScreen {
  send(bytes: Uint8Array): void;
  say(text: string, color: number): void;
  /** `OpenMessageBoxUpper( text )`: an OK box. */
  box(text: string): void;
  /** The send's OK / Cancel box (`CWndPostSendMessageBox`). */
  confirm(text: string, onOk: () => void): void;
  bagItems(): ReadonlyMap<number, InventoryItem> | null;
  ownGold(): number;
  worn(objectId: number): boolean;
  prop(itemId: number): WebItemProp | undefined;
  /** `CPlayerDataCenter::GetPlayerString`: '' while unknown (and asked for). */
  playerName(playerId: number): string;
  /** The friends' names for the receiver's list, in player id order. */
  friends(): string[];
  tradeOpen(): boolean;
  /** The bank window open, or one of its PIN windows. */
  bankOpen(): boolean;
  bankPinOpen(): boolean;
  npcShopOpen(): boolean;
  openInventory(): void;
  /** The attached bag item held (`SetExtra`): faded in the bag, not used. */
  reserve(objectId: number, on: boolean): void;
  showTooltip(item: InventoryItem | null, anchor: HTMLElement | null, host: HTMLElement): void;
  /** The clock, in ms. */
  now(): number;
}

export class PostHud {
  readonly box = new PostBox();
  readonly window: PostWindow;
  readonly read: PostReadWindow;
  readonly remove: PostQuestionBox;
  readonly warning: PostQuestionBox;
  readonly request: MailRequestBox;
  readonly amount: AmountBox;
  /** The bag item attached and its count (`m_nItem`, its `Extra`). */
  private attachment: { objectId: number; count: number } | null = null;
  /** A stack dropped on the slot, waiting for its count. */
  private pendingStack: number | null = null;
  /** The amount box is for the penya (the phone), not a stack. */
  private amountFor: 'stack' | 'penya' = 'stack';
  /** `m_bWaitRequestMail`: the box is coming (QUERYMAILBOX_REQ TRUE), asked again every 5 s. */
  private waiting = false;
  private waitingSince = 0;
  private requestSince = 0;
  private requestPresses = 0;
  /** The mail the read window shows, and the mail the fee's warning is for. */
  private reading: number | null = null;
  private feeFor: number | null = null;
  private drawn = -1;
  private drawnAt = 0;

  constructor(art: UiArt, private readonly texts: Texts, private readonly screen: PostHudScreen, doc: Document = document) {
    this.window = new PostWindow(art, doc);
    this.read = new PostReadWindow(art, doc);
    this.remove = new PostQuestionBox(POST_DELETE, art, 'WIDC_TEXT1', 'WIDC_YES', 'WIDC_NO', doc);
    this.warning = new PostQuestionBox(POST_WARNING, art, 'WIDC_CONTEXT', 'WIDC_BTN_YES', 'WIDC_BTN_NO', doc);
    this.request = new MailRequestBox(art, doc);
    this.amount = new AmountBox(art, doc);
    this.window.setTabTitles([this.text('TID_APP_POST_SEND', 'Send Mail'), this.text('TID_APP_POST_RECEIVE', 'Inbox')]);

    this.window.onTab = (tab) => { if (tab === 1) this.query(); };
    this.window.onSend = (form) => this.sendMail(form);
    this.window.onAttach = (objectId) => this.attach(objectId);
    this.window.onDetach = () => this.detach();
    this.window.onPenyaTap = () => {
      this.amountFor = 'penya';
      this.amount.open('Penya', this.text('TID_GAME_MOVEPENYA', 'How many do you want to move?'),
        this.text('TID_GAME_PENYACOUNT', 'Penya:'), Math.min(screen.ownGold(), MAX_SEND_GOLD), 0);
    };
    this.window.onRead = (id) => this.openMail(id);
    this.window.onSlotHover = (anchor) => {
      const item = this.attachment === null ? undefined : screen.bagItems()?.get(this.attachment.objectId);
      screen.showTooltip(item ?? null, item === undefined ? null : anchor, this.window.frame.element);
    };
    this.window.window.onClose = () => {
      screen.showTooltip(null, null, this.window.frame.element);
      this.detach();
      this.read.close();
      this.request.close();
      this.amount.close();
      this.waiting = false;
    };
    this.read.onDelete = () => this.askDelete();
    this.read.onReply = () => this.reply();
    this.read.onTakeItem = () => this.takeItem();
    this.read.onTakeGold = () => this.takeGold();
    this.read.onSlotHover = (anchor) => {
      const item = this.reading === null ? undefined : this.box.find(this.reading)?.item;
      screen.showTooltip(item ?? null, item === undefined ? null : anchor, this.read.window.frame.element);
    };
    this.read.window.onClose = () => {
      screen.showTooltip(null, null, this.read.window.frame.element);
      this.reading = null;
      this.remove.close();
      this.warning.close();
    };
    this.remove.onYes = () => {
      const id = this.reading;
      if (id === null) return;
      screen.send(encodeQueryRemoveMail(id));
      this.read.close();
    };
    this.warning.onYes = () => { if (this.feeFor !== null) screen.send(encodeQueryGetMailItem(this.feeFor)); this.feeFor = null; };
    this.request.onRequest = () => {
      this.requestPresses++;
      this.request.setRequestEnabled(false);
      this.requestSince = screen.now();
      this.query();
    };
    this.amount.onOk = (amount) => {
      if (this.amountFor === 'penya') { this.window.penya.value = String(amount); return; }
      const objectId = this.pendingStack;
      this.pendingStack = null;
      const item = objectId === null ? undefined : screen.bagItems()?.get(objectId);
      if (objectId !== null && item !== undefined) this.setAttachment(objectId, Math.max(1, Math.min(amount, item.count)));
    };
    this.amount.onClose = () => { this.pendingStack = null; this.amountFor = 'stack'; };
  }

  /** The elements for the windows' layer. */
  get elements(): HTMLElement[] {
    return [this.window.frame.element, this.read.window.element, this.remove.window.element, this.warning.window.element,
      this.request.window.element, this.amount.element];
  }

  /** The modal ones, whose backdrops hold the game's input. */
  get modals() {
    return [this.read.window.modal!, this.remove.window.modal!, this.warning.window.modal!, this.request.window.modal!, this.amount.modal];
  }

  /** The post window is open (`GetWndBase( APP_POST )`). */
  get isOpen(): boolean {
    return this.window.frame.isOpen;
  }

  /** The Send page is shown: a bag item tapped on the phone is attached. */
  get sending(): boolean {
    return this.isOpen && this.window.currentTab === 0;
  }

  private text(tid: string, fallback: string): string {
    return (this.texts.get(tid)?.text || fallback).replace(/\\n/g, '\n');
  }

  private line(tid: string, fallback: string): void {
    this.screen.say(this.text(tid, fallback), this.texts.get(tid)?.color ?? WHITE);
  }

  private query(): void {
    this.screen.send(encodeQueryMailBox());
  }

  /** The Post Box's Mailbox (`MMI_POST`, WndWorld.cpp:4525-4612): the checks in their order, then the bag and the post. */
  open(): void {
    const s = this.screen;
    if (s.tradeOpen()) { this.line('TID_GAME_TRADENOTPOST', 'You cannot use the Mailbox while trading.'); return; }
    if (this.isOpen) { this.line('TID_MAIL_OTHERWORK', 'Not available'); return; }
    if (s.bankOpen()) { this.line('TID_GAME_BANKTRADESELF', 'You cannot trade while using the bank.'); return; }
    if (s.bankPinOpen()) { this.line('TID_GAME_BANKSTILLUSING', 'You are already using the bank.'); return; }
    if (s.npcShopOpen()) { this.line('TID_GAME_TRADENOTBEAUTYSHOP', 'You cannot use the beauty shop while trading.'); return; }
    // the repair, beauty shop and summon angel windows of the checks are not the browser's
    s.openInventory();
    this.window.setFriends(s.friends());
    this.window.showTab(1);
    this.window.window.open();
    this.window.setEnabled(false);
    this.query();
    this.requestPresses = 0;
    this.requestSince = s.now();
    this.request.setRequestEnabled(false);
    this.request.open();
    this.drawn = -1;
  }

  /** A post snapshot. */
  handle(message: PostMessage): void {
    switch (message.type) {
      case 'mailBox':
        this.box.replace(message.mails, this.screen.now());
        // still waiting with an empty box: asked once more (post.cpp:367-370)
        if (this.waiting && message.mails.length === 0) this.query();
        if (this.isOpen) this.boxCame();
        return;
      case 'mailBoxReq':
        if (message.hasMail) {
          this.waiting = true;
          this.waitingSince = this.screen.now();
          return;
        }
        this.box.clear();
        if (this.isOpen) this.boxCame();
        return;
      case 'removeMail':
        this.box.remove(message.mailId, message.kind);
        if (this.reading === message.mailId) this.drawRead(false);
        return;
      case 'postMail':
        // never sent by the V15 server (B-mail.md §2.3); kept as OnPostMail keeps it
        this.box.replace([...this.box.mails.map(({ created, ...mail }) => ({ ...mail, age: Math.round((this.screen.now() - created) / 1000) })), message.mail], this.screen.now());
        return;
    }
  }

  /** The box came: the window enabled, the request box gone, no more waiting. */
  private boxCame(): void {
    this.window.setEnabled(true);
    this.request.close();
    this.waiting = false;
    this.drawn = -1;
  }

  /** Every frame: the request box's button and re-asks; the rows again when the box changed or once a second (the time left). */
  update(): void {
    if (!this.isOpen) return;
    const now = this.screen.now();
    if (this.request.isOpen) {
      if (now - this.requestSince >= REQUEST_WAIT) {
        // gone 5 s after the third press, the window still waiting (WndMailRequestingBox.cpp:40-58)
        if (this.requestPresses >= REQUEST_PRESSES) this.request.close();
        else this.request.setRequestEnabled(true);
      }
    }
    if (this.waiting && now - this.waitingSince >= REQUEST_WAIT) {
      this.waitingSince = now;
      this.query();
    }
    if (this.box.revision === this.drawn && now - this.drawnAt < 1000) return;
    this.drawn = this.box.revision;
    this.drawnAt = now;
    this.window.drawInbox(this.box.mails.map((mail) => this.rowOf(mail, now)));
    this.drawSlot();
  }

  private rowOf(mail: KeptMail, now: number): InboxRow {
    const info = mailInfo(mail.created, now);
    const name = mail.senderId === 0 ? '' : this.screen.playerName(mail.senderId);
    const sender = senderText(mail.senderId, name);
    return {
      id: mail.id, ...(mail.item !== undefined ? { item: mail.item, prop: this.screen.prop(mail.item.itemId) } : {}),
      penyaOnly: mail.item === undefined && mail.gold > 0, read: mail.read, sender,
      time: timeLeftText(info, this.text('TID_PK_LIMIT_DAY', '%.1dday'), this.text('TID_PK_LIMIT_HOUR', '%.1dhr')),
      color: timeLeftColor(info.days), late: info.days <= 0,
      // with no sender name the title is drawn empty (:15228-15234)
      title: mail.senderId !== 0 && name === '' ? '' : titleText(mail.title),
      tip: formatText(this.text('TID_GAME_MAIL_RECEIVE_DATE', 'The received date : %s'), [receivedDate(mail.created)]),
    };
  }

  // --- the Send page ---

  /** A bag item dropped on the slot (`OnDropIcon`, :14287-14374), or tapped on the phone with the Send page shown. */
  attach(objectId: number): void {
    const item = this.screen.bagItems()?.get(objectId);
    if (item === undefined || !this.isOpen) return;
    if (this.screen.worn(objectId)) { this.line('TID_GAME_EQUIPPUT', 'Please unequip the item first.'); return; }
    // `IsCharged`: m_bCharged == 1 (the resist card's id is not kept by the browser)
    if (item.charged === 1) { this.line('TID_GAME_CHARGED_NOTUSE', 'You can not use the premium items.'); return; }
    this.detach();
    // the title becomes the item's name (:14350-14356, :14363-14369)
    const name = this.screen.prop(item.itemId)?.name;
    if (name !== undefined && this.window.title.value !== name) this.window.title.value = name;
    if (item.count > 1) {
      this.pendingStack = objectId;
      this.amountFor = 'stack';
      this.amount.open('', this.text('TID_GAME_MOVECOUNT', 'Move how many items?'), this.text('TID_GAME_NUMCOUNT', 'Number:'), item.count);
      return;
    }
    this.setAttachment(objectId, 1);
  }

  private setAttachment(objectId: number, count: number): void {
    this.detach();
    this.attachment = { objectId, count };
    this.screen.reserve(objectId, true);
    this.drawSlot();
  }

  /** The attachment off (right click, `SetItemId( 0xff )`), the title kept. */
  detach(): void {
    if (this.attachment !== null) this.screen.reserve(this.attachment.objectId, false);
    this.attachment = null;
    this.drawSlot();
  }

  private drawSlot(): void {
    const at = this.attachment;
    const item = at === null ? undefined : this.screen.bagItems()?.get(at.objectId);
    if (at !== null && item === undefined) { this.attachment = null; }
    this.window.drawSlot(item, item === undefined ? undefined : this.screen.prop(item.itemId), at?.count ?? 0);
  }

  /** Send (:14404-14508): the checks, then the confirm box; its OK sends QUERYPOSTMAIL and drops the attachment. */
  private sendMail(form: { receiver: string; title: string; text: string; penya: string }): void {
    const check = sendCheck(form);
    if (check.kind === 'none') return;
    if (check.kind === 'box') {
      const fallback: Record<string, string> = {
        TID_GAME_LIMITPENYA: 'You can not send that much Penya.', TID_DIAG_0057: 'That name is too long.  Please try again.',
        TID_GAME_MAILBOX_TEXT_MAX: 'The text should be under %d letters.', TID_GAME_MAILBOX_TITLE_MAX: 'The title should be under %d letters.',
      };
      this.screen.box(formatText(this.text(check.tid, fallback[check.tid] ?? ''), check.args ?? []));
      return;
    }
    const at = this.attachment;
    const question = formatText(this.text('TID_MAIL_SEND_CONFIRM', 'Would you like to send mail?\n Received mail will be deleted after %d days.'), [MAX_KEEP_MAX_DAY]);
    this.screen.confirm(question, () => {
      this.screen.send(encodeQueryPostMail({
        itemObjectId: at?.objectId ?? NO_MAIL_ITEM, count: at?.count ?? 0, receiver: form.receiver, gold: check.gold,
        title: form.title, text: form.text,
      }));
      // ClearData: only the attachment (the texts stay, :14101-14125)
      this.detach();
    });
  }

  // --- reading ---

  /** A row double-clicked (tapped): the read window, and READMAIL every time (:14663-14733). */
  openMail(id: number): void {
    const mail = this.box.find(id);
    if (mail === undefined) return;
    this.read.close();
    this.reading = id;
    this.drawRead(true);
    this.read.open();
    this.screen.send(encodeReadMail(id));
  }

  private drawRead(full: boolean): void {
    const mail = this.reading === null ? undefined : this.box.find(this.reading);
    if (mail === undefined) return;
    const prop = mail.item === undefined ? undefined : this.screen.prop(mail.item.itemId);
    const gold = mail.gold > 0 ? withCommas(mail.gold) : '0';
    const view = { ...(mail.item !== undefined ? { item: mail.item, prop } : {}), gold, hasGold: mail.gold > 0 };
    if (!full) { this.read.update(view); return; }
    const name = mail.senderId === 0 ? '' : this.screen.playerName(mail.senderId);
    const empty = mail.senderId !== 0 && name === '';
    this.read.show({ ...view, sender: senderText(mail.senderId, name), title: empty ? '' : titleText(mail.title), text: empty ? '' : mail.text });
  }

  /** `MailReceiveItem` (:14794-14839): after 7 days the fee's warning first. */
  private takeItem(): void {
    const mail = this.reading === null ? undefined : this.box.find(this.reading);
    if (mail?.item === undefined) return;
    const fee = storageFee(mailInfo(mail.created, this.screen.now()), itemCost(mail.item, this.screen.prop(mail.item.itemId)));
    if (fee === null) {
      this.screen.send(encodeQueryGetMailItem(mail.id));
      return;
    }
    this.feeFor = mail.id;
    this.warning.open(formatText(this.text('TID_GAME_MAILBOX_KEEP_PAY',
      'The time %d for basic custody expired. Therefore you should pay %d penya as charges for custody.'), [MAX_KEEP_BASIC_DAY, fee]));
  }

  /** `MailReceiveGold` (:14840-14858): the field shows 0 at once. */
  private takeGold(): void {
    const mail = this.reading === null ? undefined : this.box.find(this.reading);
    if (mail === undefined || mail.id <= 0 || mail.gold <= 0) return;
    this.screen.send(encodeQueryGetMailGold(mail.id));
    this.read.window.setText('WIDC_EDIT3', '0');
  }

  /** Delete (:14876-14893): nothing for a Sealed Character's mail, else the confirm. */
  private askDelete(): void {
    const mail = this.reading === null ? undefined : this.box.find(this.reading);
    if (mail === undefined || mail.item?.itemId === SEAL_CHARACTER) return;
    this.remove.open(this.text('TID_MAIL_DELETE_CONFIRM',
      'Do you want to delete this mail? \nIf you do, items and penya in this mail will be deleted as well.'));
  }

  /** Reply (:14894-14939): the Send page, the receiver the sender, the title "Re:" + the shown title; the read window goes. */
  private reply(): void {
    const mail = this.reading === null ? undefined : this.box.find(this.reading);
    if (mail === undefined) return;
    const name = mail.senderId === 0 ? '' : this.screen.playerName(mail.senderId);
    this.detach();
    this.window.receiver.value = senderText(mail.senderId, name);
    this.window.title.value = `Re:${mail.senderId !== 0 && name === '' ? '' : titleText(mail.title)}`;
    this.window.body.value = '';
    this.window.showTab(0);
    this.read.close();
  }

  /** The phone's tap on a bag item: attached while the Send page is shown. */
  tapItem(objectId: number): void {
    if (this.sending) this.attach(objectId);
  }

  /**
   * A mail's item or penya dragged from the read window onto the bag (`CWndInventory`, WndField.cpp:2015-2032).
   */
  dropOnBag(what: 'item' | 'gold'): void {
    if (!this.read.isOpen) return;
    if (what === 'item') this.takeItem(); else this.takeGold();
  }

  /** The player moved, or accepted a duel (WndWorld.cpp:8383-8394): the post's windows go, the bag stays. */
  moved(): void {
    if (this.isOpen) this.window.frame.close();
  }

  /** The world left: every post window closed (the box is asked for again next time). */
  reset(): void {
    this.amount.close();
    this.remove.close();
    this.warning.close();
    this.read.close();
    this.request.close();
    if (this.isOpen) this.window.frame.close();
    this.waiting = false;
  }
}

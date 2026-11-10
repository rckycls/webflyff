// The own mailbox and the post's sums (2026-11-10, docs/superpowers/specs/2026-11-10-bank-mail-research.md §2; B-mail.md §5-§7):
//
//   CMailBox::Serialize      _Common/post.cpp:360-381          QUERYMAILBOX replaces the whole box; each mail's m_tmCreate
//                                                              = the client's now less the age the server sent (:129-131)
//   CMailBox::Remove*        post.cpp:408-485                  REMOVEMAIL: 0 the mail, 1 its item, 2 its penya, 3 read
//   CMail::GetMailInfo       post.cpp:61-87                    the days and hours left, from the day of the month only
//   CWndPostReceive::OnDraw  _Interface/WndField.cpp:15089-15258  the sender ("FLYFF", 16 letters + "...", "Unknown"), the
//                                                              days' text and colour, the title (13 letters + "...")
//   CWndPostRead::MailReceiveItem  WndField.cpp:14794-14839    the storage fee after 7 days (the server's sum too,
//                                                              DPSrvr.cpp:5197-5218)
//   CItemBase::GetCost       _Common/Item.cpp:123-145          the item's cost with its upgrade level

import type { Mail, InventoryItem } from '@flyffweb/protocol';
import { RemoveMailType } from '@flyffweb/protocol';
import type { WebItemProp } from '@flyffweb/formats';

/** `MAX_KEEP_MAX_DAY`, `MAX_KEEP_BASIC_DAY` (`_Common/post.h:14-22`, the main server's): kept 15 days, the first 7 free. */
export const MAX_KEEP_MAX_DAY = 15;
export const MAX_KEEP_BASIC_DAY = 7;
/** `MAX_MAIL_LIST_PER_PAGE` (WndField.cpp:63): the inbox's rows. */
export const MAIL_ROWS = 6;
/** The game's own mail (`idSender` 0) and a sender whose name is not known yet. */
export const SYSTEM_SENDER = 'FLYFF';
export const UNKNOWN_SENDER = 'Unknown';

/** A mail as the client keeps it: the server's, with when it was sent by the client's clock. */
export interface KeptMail extends Mail {
  created: number;
}

export class PostBox {
  mails: KeptMail[] = [];
  /** Bumped on every change, for the inbox to redraw. */
  revision = 0;

  /** QUERYMAILBOX: the box replaced, each mail made `age` seconds before `now` (ms). */
  replace(mails: readonly Mail[], now: number): void {
    this.mails = mails.map((mail) => ({ ...mail, created: now - mail.age * 1000 }));
    this.revision++;
  }

  /** QUERYMAILBOX_REQ FALSE: the box is empty. */
  clear(): void {
    this.mails = [];
    this.revision++;
  }

  find(id: number): KeptMail | undefined {
    return this.mails.find((mail) => mail.id === id);
  }

  /** REMOVEMAIL: the mail gone, its item or penya taken, or read. */
  remove(id: number, kind: number): void {
    const at = this.mails.findIndex((mail) => mail.id === id);
    if (at < 0) return;
    const mail = this.mails[at]!;
    switch (kind) {
      case RemoveMailType.MAIL: this.mails.splice(at, 1); break;
      case RemoveMailType.ITEM: { const { item: _item, ...rest } = mail; this.mails[at] = rest; break; }
      case RemoveMailType.GOLD: this.mails[at] = { ...mail, gold: 0 }; break;
      case RemoveMailType.READ: this.mails[at] = { ...mail, read: true }; break;
      default: return;
    }
    this.revision++;
  }
}

/**
 * `CMail::GetMailInfo`: the span from the mail's day of the month, hour, minute and second to now's (the month and the year
 * are not used, so it is wrong across a month change, as in Neuz, whose server sums the fee the same way), then
 * `nDay = (int)( 16 - totalDays )` and `hoursLeft = (DWORD)( 360 - totalHours )`. Local time, as `COleDateTime`.
 */
export function mailInfo(created: number, now: number): { days: number; hours: number } {
  const a = new Date(created), b = new Date(now);
  const seconds = (b.getDate() - a.getDate()) * 86400 + (b.getHours() - a.getHours()) * 3600
    + (b.getMinutes() - a.getMinutes()) * 60 + (b.getSeconds() - a.getSeconds());
  const days = Math.trunc(MAX_KEEP_MAX_DAY + 1 - seconds / 86400);
  const hours = Math.trunc(MAX_KEEP_MAX_DAY * 24 - seconds / 3600) >>> 0;
  return { days, hours };
}

/** The inbox's time left (WndField.cpp:15210-15218): hours (`TID_PK_LIMIT_HOUR` "%.1dhr") at a day or less, else days. */
export function timeLeftText(info: { days: number; hours: number }, dayFormat: string, hourFormat: string): string {
  const value = info.days <= 1 ? info.hours | 0 : info.days;
  return (info.days <= 1 ? hourFormat : dayFormat).replace(/%\.?\d*d/, String(value));
}

/**
 * The time left's colour (:15114-15117, 15220-15226): `f = nDay / 7.0`, red `255 - 255 f`, green `150 f`, kept to their low 8
 * bits by `D3DCOLOR_XRGB` and not clamped, so past 7 days they wrap.
 */
export function timeLeftColor(days: number): [number, number, number] {
  const f = Math.fround(days / 7);
  return [Math.trunc(255 - 255 * f) & 0xff, Math.trunc(150 * f) & 0xff, 0];
}

/** `GetCost`: `dwCost`, raised by an upgrade level `a` to `dwCost + dwCost (0.1 + a²/18)`; -1 for 0xFFFFFFFF. */
export function itemCost(item: InventoryItem, prop: WebItemProp | undefined): number {
  const cost = prop?.cost ?? 0;
  if (cost === 0xffffffff) return -1;
  const level = (item.abilityOption ?? 0) & 0xff;
  return level > 0 ? Math.trunc(cost + cost * (0.1 + (level * level) / 18)) : cost;
}

/**
 * The storage fee of taking the item (`MailReceiveItem`, WndField.cpp:14807-14837): only when `(360 - hoursLeft) > 168`
 * (unsigned: more than 7 days old), `cost * (15 - 7 - nDay) / (15 - 7)`, at least 0; null when there is none to ask.
 */
export function storageFee(info: { days: number; hours: number }, cost: number): number | null {
  if (((MAX_KEEP_MAX_DAY * 24 - info.hours) >>> 0) <= MAX_KEEP_BASIC_DAY * 24) return null;
  const fee = (cost * (MAX_KEEP_MAX_DAY - MAX_KEEP_BASIC_DAY - info.days)) / (MAX_KEEP_MAX_DAY - MAX_KEEP_BASIC_DAY);
  return fee < 0 ? 0 : Math.trunc(fee);
}

/** The sender as the inbox and the read window write it (:15173-15202, :14682-14707). */
export function senderText(senderId: number, name: string): string {
  if (senderId === 0) return SYSTEM_SENDER;
  if (name === '') return UNKNOWN_SENDER;
  return name.length > 16 ? `${name.slice(0, 16)}...` : name;
}

/** The title as the inbox and the read window write it: 13 letters and "..." when it has 13 or more (:15228-15234). */
export function titleText(title: string): string {
  return title.length >= 13 ? `${title.slice(0, 13)}...` : title;
}

/** `COleDateTime( m_tmCreate ).Format()`: the date and time in the en-US form ("11/10/2026 3:42:11 PM"). */
export function receivedDate(created: number): string {
  const d = new Date(created);
  const hour = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
  const two = (n: number): string => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()} ${hour}:${two(d.getMinutes())}:${two(d.getSeconds())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}

/**
 * `CWndPostSend`'s Send checks, in order (WndField.cpp:14404-14508), lengths in bytes (the code page's one byte a letter):
 * null when nothing happens (an empty receiver or title, penya not all digits), a TID box, or the mail to confirm.
 */
export function sendCheck(form: { receiver: string; title: string; text: string; penya: string }):
  | { kind: 'none' } | { kind: 'box'; tid: string; args?: number[] } | { kind: 'ok'; gold: number } {
  if (form.receiver === '' || form.title === '') return { kind: 'none' };
  // the "no item and no penya" check never runs (a BYTE compared with NULL_ID, :14427-14430)
  const penya = form.penya === '' ? '0' : form.penya;
  if (!/^[0-9]+$/.test(penya)) return { kind: 'none' };
  if (Number(penya) > 1_000_000_000) return { kind: 'box', tid: 'TID_GAME_LIMITPENYA' };
  if (form.receiver.length < 3 || form.receiver.length > 16) return { kind: 'box', tid: 'TID_DIAG_0057' };
  if (form.text.length > 255) return { kind: 'box', tid: 'TID_GAME_MAILBOX_TEXT_MAX', args: [256] };
  if (form.title.length > 31) return { kind: 'box', tid: 'TID_GAME_MAILBOX_TITLE_MAX', args: [32] };
  return { kind: 'ok', gold: Number.parseInt(penya, 10) };
}

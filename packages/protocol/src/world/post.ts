// The post's packets (2026-11-10, docs/superpowers/specs/2026-11-10-bank-mail-research.md §2; B-mail.md §10), both ways. The
// reads copy Neuz's handlers, the writes its senders; the world server writes the snapshots (`WORLDSERVER/User.cpp:6739-6780`).
//
//   snapshots   CDPClient::OnMailBox      Neuz/DPClient.cpp:15982-16024   QUERYMAILBOX 0x00e9: u_long idReceiver, int n, n mails
//               OnMailBoxReq              :16026-16078                    QUERYMAILBOX_REQ 0x8860: BOOL the box has mail
//               OnRemoveMail              :15924-15980                    REMOVEMAIL 0x00e7: u_long nMail, int type
//               OnPostMail                :15903-15922                    POSTMAIL 0x00e6: one mail (never sent by the server)
//   CMail::Serialize( ar, TRUE )          _Common/post.cpp:89-136         u_long nMail, u_long idSender, BYTE has item [+
//                                                                         CItemElem], DWORD penya, time_t age (seconds), BYTE
//                                                                         read, String title, String text
//   senders     SendQueryPostMail ... SendQueryReadMail   DPClient.cpp:15840-15901

import type { ArReader } from '../ar/ArReader';
import { encodeGameText } from '../text';
import { clientPacket } from './packet';
import { readInventoryItem } from './own';
import type { InventoryItem } from './types';

/** The post's packet types, client to world (`Source/_Network/MsgHdr.h:31-37`). */
export const PostPacket = {
  QUERYPOSTMAIL: 0x0000001a,
  QUERYREMOVEMAIL: 0x0000001b,
  QUERYGETMAILITEM: 0x0000001c,
  QUERYMAILBOX: 0x0000001d,
  QUERYGETMAILGOLD: 0x0000001f,
  READMAIL: 0x00000024,
} as const;

/** The post's snapshot types (`MsgHdr.h:1142-1144, 1332`). */
export const PostMessageType = {
  POSTMAIL: 0x00e6,
  REMOVEMAIL: 0x00e7,
  QUERYMAILBOX: 0x00e9,
  QUERYMAILBOX_REQ: 0x8860,
} as const;

/** `MAX_MAILTITLE`, `MAX_MAILTEXT` (`_Common/post.h:8-12`): the buffers, so at most 31 and 255 bytes. */
export const MAX_MAILTITLE = 32;
export const MAX_MAILTEXT = 256;
/** `MAX_PLAYER` (the server's buffer for the receiver's name, `DPSrvr.cpp:4972-4984`). */
const MAX_RECEIVER = 42;
/** `nItem` of a mail with no item: a BYTE 0xff (`CWndPostSend::m_nItem`). */
export const NO_MAIL_ITEM = 0xff;

/** `REMOVEMAIL`'s `nType` (`CMail::Remove*`, post.cpp:408-485). */
export const RemoveMailType = { MAIL: 0, ITEM: 1, GOLD: 2, READ: 3 } as const;

/** One mail as `CMail::Serialize` sends it. `age` is the seconds since it was sent, by the server's clock. */
export interface Mail {
  id: number;
  /** `idSender`: 0 for the game's own mail ("FLYFF"). */
  senderId: number;
  item?: InventoryItem;
  gold: number;
  age: number;
  read: boolean;
  title: string;
  text: string;
}

export type PostMessage =
  /** The whole box, replacing the one the client had. */
  | { type: 'mailBox'; receiverId: number; mails: Mail[] }
  /** FALSE: the box is empty (the request box closes); TRUE: wait, the box follows. */
  | { type: 'mailBoxReq'; hasMail: boolean }
  | { type: 'removeMail'; mailId: number; kind: number }
  | { type: 'postMail'; mail: Mail };

/** `CMail::Serialize( ar, TRUE )`, the loading side. */
export function readMail(r: ArReader): Mail {
  const id = r.u32(), senderId = r.u32();
  const item = r.u8() !== 0 ? readInventoryItem(r) : undefined;
  const gold = r.u32(), age = r.i32(), read = r.u8() !== 0;
  const title = r.string(MAX_MAILTITLE), text = r.string(MAX_MAILTEXT);
  return { id, senderId, ...(item !== undefined ? { item } : {}), gold, age, read, title, text };
}

export function readMailBox(r: ArReader): PostMessage {
  const receiverId = r.u32();
  const count = r.i32();
  const mails: Mail[] = [];
  for (let i = 0; i < count; i++) mails.push(readMail(r));
  return { type: 'mailBox', receiverId, mails };
}

/** The snapshot readers of the post, for `WORLD_READERS`. */
export const POST_READERS: ReadonlyArray<[number, (r: ArReader) => PostMessage]> = [
  [PostMessageType.QUERYMAILBOX, readMailBox],
  [PostMessageType.QUERYMAILBOX_REQ, (r) => ({ type: 'mailBoxReq', hasMail: r.i32() !== 0 })],
  [PostMessageType.REMOVEMAIL, (r) => { const mailId = r.u32(); return { type: 'removeMail', mailId, kind: r.i32() }; }],
  [PostMessageType.POSTMAIL, (r) => ({ type: 'postMail', mail: readMail(r) })],
];

const POST_TYPES: ReadonlySet<string> = new Set(['mailBox', 'mailBoxReq', 'removeMail', 'postMail']);

/** Whether a world message is one of the post's. */
export function isPostMessage(message: { type: string }): message is PostMessage {
  return POST_TYPES.has(message.type);
}

// --- the client's packets ---

/** What `SendQueryPostMail` sends: the bag object (`NO_MAIL_ITEM` for none) and its count, then the texts and the penya. */
export interface MailToSend {
  itemObjectId: number;
  count: number;
  receiver: string;
  gold: number;
  title: string;
  text: string;
}

/**
 * `SendQueryPostMail( nItem, nItemNum, lpszReceiver, nGold, lpszTitle, lpszText )` (`DPClient.cpp:15840-15852`): BYTE, short,
 * String, int, String, String. The texts in the game's code page; the window checks their lengths first (`CWndPostSend`).
 */
export function encodeQueryPostMail(mail: MailToSend): Uint8Array {
  const w = clientPacket(PostPacket.QUERYPOSTMAIL).u8(mail.itemObjectId).i16(mail.count);
  const text = (value: string, max: number, lineBreaks = false): void => {
    const bytes = encodeGameText(value, max, lineBreaks);
    w.i32(bytes.length).bytes(bytes);
  };
  text(mail.receiver, MAX_RECEIVER - 1);
  w.i32(mail.gold);
  text(mail.title, MAX_MAILTITLE - 1);
  text(mail.text, MAX_MAILTEXT - 1, true);
  return w.toBytes();
}

/** `SendQueryRemoveMail( nMail )` (:15854-15862). */
export const encodeQueryRemoveMail = (mailId: number): Uint8Array =>
  clientPacket(PostPacket.QUERYREMOVEMAIL).u32(mailId).toBytes();

/** `SendQueryGetMailItem( nMail )` (:15864-15872). */
export const encodeQueryGetMailItem = (mailId: number): Uint8Array =>
  clientPacket(PostPacket.QUERYGETMAILITEM).u32(mailId).toBytes();

/** `SendQueryGetMailGold( nMail )` (:15874-15882). */
export const encodeQueryGetMailGold = (mailId: number): Uint8Array =>
  clientPacket(PostPacket.QUERYGETMAILGOLD).u32(mailId).toBytes();

/** `SendQueryReadMail( nMail )` (:15884-15892). */
export const encodeReadMail = (mailId: number): Uint8Array => clientPacket(PostPacket.READMAIL).u32(mailId).toBytes();

/** `SendQueryMailBox()` (:15894-15901): the type alone. */
export const encodeQueryMailBox = (): Uint8Array => clientPacket(PostPacket.QUERYMAILBOX).toBytes();

/** For the pretend servers: a client packet of the post after its type. */
export type PostRequestPacket =
  | ({ type: 'queryPostMailRequest' } & MailToSend)
  | { type: 'queryRemoveMailRequest'; mailId: number }
  | { type: 'queryGetMailItemRequest'; mailId: number }
  | { type: 'queryGetMailGoldRequest'; mailId: number }
  | { type: 'readMailRequest'; mailId: number }
  | { type: 'queryMailBoxRequest' };

export function readPostRequestPacket(packetType: number, r: ArReader): PostRequestPacket | null {
  switch (packetType) {
    case PostPacket.QUERYPOSTMAIL: {
      const itemObjectId = r.u8(), count = r.i16(), receiver = r.string(MAX_RECEIVER), gold = r.i32();
      const title = r.string(MAX_MAILTITLE), text = r.string(MAX_MAILTEXT);
      return { type: 'queryPostMailRequest', itemObjectId, count, receiver, gold, title, text };
    }
    case PostPacket.QUERYREMOVEMAIL: return { type: 'queryRemoveMailRequest', mailId: r.u32() };
    case PostPacket.QUERYGETMAILITEM: return { type: 'queryGetMailItemRequest', mailId: r.u32() };
    case PostPacket.QUERYGETMAILGOLD: return { type: 'queryGetMailGoldRequest', mailId: r.u32() };
    case PostPacket.READMAIL: return { type: 'readMailRequest', mailId: r.u32() };
    case PostPacket.QUERYMAILBOX: return { type: 'queryMailBoxRequest' };
    default: return null;
  }
}

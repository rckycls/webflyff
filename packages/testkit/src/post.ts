// 2026-11-10 (bank-mail): the post's snapshots as the world server writes them (`CUser::AddPostMail` ... `SendCheckMailBoxReq`,
// `WORLDSERVER/User.cpp:6739-6780`), and MODIFYMODE (`CUserMng::AddModifyMode`, User.cpp:5158-5169), in the order of the
// readers (`@flyffweb/protocol` world/post.ts).

import { ArWriter, MessageType, PostMessageType, encodeGameText } from '@flyffweb/protocol';
import type { Mail } from '@flyffweb/protocol';
import { writeItemElem } from './world';
import type { ScriptMessage } from './world';

const scripted = (objectId: number, type: number, w: ArWriter = new ArWriter()): ScriptMessage =>
  ({ objectId, type, fields: w.toBytes() });

/** `CMail::Serialize( ar, TRUE )` (`_Common/post.cpp:89-136`), the storing side. */
export function writeMail(w: ArWriter, mail: Mail): void {
  w.u32(mail.id).u32(mail.senderId);
  if (mail.item === undefined) w.u8(0);
  else {
    w.u8(1);
    writeItemElem(w, mail.item);
  }
  w.u32(mail.gold).i32(mail.age).u8(mail.read ? 1 : 0);
  for (const [text, max] of [[mail.title, 31], [mail.text, 255]] as const) {
    const bytes = encodeGameText(text, max, true);
    w.i32(bytes.length).bytes(bytes);
  }
}

/** QUERYMAILBOX (`AddMailBox`, :6761-6770): the receiver's id and every mail. */
export function writeMailBox(selfId: number, receiverId: number, mails: readonly Mail[]): ScriptMessage {
  const w = new ArWriter().u32(receiverId).i32(mails.length);
  for (const mail of mails) writeMail(w, mail);
  return scripted(selfId, PostMessageType.QUERYMAILBOX, w);
}

/** QUERYMAILBOX_REQ (`SendCheckMailBoxReq`, :6772-6780): FALSE when the box is empty. */
export const writeMailBoxReq = (selfId: number, hasMail: boolean): ScriptMessage =>
  scripted(selfId, PostMessageType.QUERYMAILBOX_REQ, new ArWriter().i32(hasMail ? 1 : 0));

/** REMOVEMAIL (`AddRemoveMail`, :6750-6759): the mail and what went (0 it, 1 its item, 2 its penya, 3 read). */
export const writeRemoveMail = (selfId: number, mailId: number, kind: number): ScriptMessage =>
  scripted(selfId, PostMessageType.REMOVEMAIL, new ArWriter().u32(mailId).i32(kind));

/** MODIFYMODE (`AddModifyMode`): a mover's `m_dwMode` (MODE_MAILBOX 0x8000 for an unread mail). */
export const writeModifyMode = (objectId: number, mode: number): ScriptMessage =>
  scripted(objectId, MessageType.MODIFYMODE, new ArWriter().u32(mode));

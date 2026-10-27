import type { ArReader } from '../ar/ArReader';
import type { ArWriter } from '../ar/ArWriter';
import {
  MAX_SHORTCUT_STRING, MAX_SLOT_APPLET, MAX_SLOT_ITEM, MAX_SLOT_ITEM_COUNT, MAX_SLOT_QUEUE, PacketType, ShortcutKind,
} from '../constants';
import { ProtocolError } from '../errors';
import { clientPacket } from './packet';
import type { MessageOf, Shortcut } from './types';

/**
 * A slot index the message names: an `int` that Neuz uses to index `m_aSlotApplet`, `m_aSlotItem` or `m_aSlotQueue`
 * with no check (`CWndTaskBar::Serialize`, `_Interface/WndTaskBar.cpp:322`, :363, :388), so a value outside the array
 * would write past its end. The world server only sends the slots it holds (`CUserTaskBar::Serialize`,
 * `_Interface/UserTaskBar.cpp:68`, :87, :109); anything else is not a TASKBAR message and the reader refuses it.
 */
function readSlot(r: ArReader, what: string, count: number): number {
  const at = r.position();
  const slot = r.i32();
  if (slot < 0 || slot >= count) throw new ProtocolError(`${what} ${slot} is outside 0..${count - 1}`, at);
  return slot;
}

/**
 * One shortcut: `ar >> m_dwShortcut >> m_dwId >> m_dwType; ar >> m_dwIndex >> m_dwUserId >> m_dwData;` and, for an
 * applet or an item entry that is a chat shortcut, `ar.ReadString( m_szString, MAX_SHORTCUT_STRING )`
 * (`WndTaskBar.cpp:323-326`, :363-367). A queue entry has no string (:389-390): `hasText` is false for it. The string
 * is a `char[128]`, so `ArReader.string` takes at most 127 bytes; `CAr::ReadString` would clear the buffer and drop the
 * rest of the packet for a longer one, and the reader drops the message instead.
 */
function readShortcut(r: ArReader, hasText: boolean): Shortcut {
  const kind = r.u32();
  const id = r.u32();
  const type = r.u32();
  const index = r.u32();
  const userId = r.u32();
  const data = r.u32();
  const text = hasText && kind === ShortcutKind.CHAT ? r.string(MAX_SHORTCUT_STRING) : '';
  return { kind, id, type, index, userId, data, text };
}

/** A slot nothing was read into: `InitTaskBar` leaves the whole `SHORTCUT` zero (`memset`, `WndTaskBar.cpp:317`). */
function emptyShortcut(): Shortcut {
  return { kind: ShortcutKind.NONE, id: 0, type: 0, index: 0, userId: 0, data: 0, text: '' };
}

/**
 * TASKBAR: `CDPClient::OnTaskBar` (`Neuz/DPClient.cpp:4285`) passes the body to `CWndTaskBar::Serialize`
 * (`_Interface/WndTaskBar.cpp:315-400`), which reads what `CUserTaskBar::Serialize`
 * (`_Interface/UserTaskBar.cpp:63-125`) writes, `CUser::AddTaskBar` (`WORLDSERVER/User.cpp:1232`) sending it after the
 * own ADD_OBJ:
 * - the applet count (`int`), then per entry the slot (`int`) and a shortcut;
 * - the item count, then per entry the bar and the slot (`int` each) and a shortcut;
 * - the queue count, then per entry the slot (`int`) and a shortcut without a string;
 * - `m_nActionPoint` (`int`), after the queue entries (the server writes the queue count into its place afterwards).
 * Each count is of the entries that follow, and the loops run `i < nCount`, so a count of 0 or less reads none.
 *
 * Neuz keeps `m_nCurQueueNum = nCount` (:399); here `queue` runs to the last slot listed, which is the same length
 * when the skills fill the slots from 0 on, as the server keeps them. The icon textures, the inventory lookups of an
 * item shortcut (`m_dwItemId`, :347-355, :370-378) and the emptying of an applet skill that is not a `CT_STEP` or
 * `CT_GENERAL` one (:330-343) need the game's tables and are left to the code that draws the bar.
 */
export function readTaskBar(r: ArReader): MessageOf<'taskBar'> {
  const applets: MessageOf<'taskBar'>['taskBar']['applets'] = [];
  const appletCount = r.i32();
  for (let i = 0; i < appletCount; i++) {
    const slot = readSlot(r, 'applet slot', MAX_SLOT_APPLET);
    applets.push({ slot, shortcut: readShortcut(r, true) });
  }

  const items: MessageOf<'taskBar'>['taskBar']['items'] = [];
  const itemCount = r.i32();
  for (let i = 0; i < itemCount; i++) {
    const bar = readSlot(r, 'item bar', MAX_SLOT_ITEM_COUNT);
    const slot = readSlot(r, 'item slot', MAX_SLOT_ITEM);
    items.push({ bar, slot, shortcut: readShortcut(r, true) });
  }

  const queue: Shortcut[] = [];
  const queueCount = r.i32();
  for (let i = 0; i < queueCount; i++) {
    const slot = readSlot(r, 'queue slot', MAX_SLOT_QUEUE);
    const shortcut = readShortcut(r, false);
    while (queue.length <= slot) queue.push(emptyShortcut());
    queue[slot] = shortcut;
  }

  const actionPoint = r.i32();
  return { type: 'taskBar', taskBar: { applets, items, queue, actionPoint } };
}

// The packets the browser sends to edit the bars, which the world server answers with no message (bar the text for an
// 11th chat shortcut, below): Neuz's `CDPClient::Send*TaskBar` write them and `CDPSrvr::On*TaskBar` read them.

/**
 * A slot the server takes as a `BYTE` and tests against the size of the array (`if( nSlotIndex >= MAX_SLOT_ITEM_COUNT
 * || nIndex >= MAX_SLOT_ITEM ) return;`, `WORLDSERVER/DPSrvr.cpp:12433-12434`, :12482-12483): it drops the packet with no
 * reply, so the encoder refuses a slot outside the array instead of sending a packet that is lost.
 */
function checkEditSlot(what: string, slot: number, count: number): void {
  if (!Number.isInteger(slot) || slot < 0 || slot >= count) {
    throw new ProtocolError(`${what} ${slot} is outside 0..${count - 1}`);
  }
}

/** A `BYTE` slot of a packet the browser sent, with the check the server makes (`checkEditSlot`'s). */
function readByteSlot(r: ArReader, what: string, count: number): number {
  const at = r.position();
  const slot = r.u8();
  if (slot >= count) throw new ProtocolError(`${what} ${slot} is outside 0..${count - 1}`, at);
  return slot;
}

/** The six `DWORD`s of a `SHORTCUT` in the order the senders write them (`Neuz/DPClient.cpp:10980-10981`, :11018-11019). */
function writeShortcutFields(w: ArWriter, s: Shortcut): ArWriter {
  return w.u32(s.kind).u32(s.id).u32(s.type).u32(s.index).u32(s.userId).u32(s.data);
}

/**
 * ADDITEMTASKBAR: `CDPClient::SendAddItemTaskBar` (`Neuz/DPClient.cpp:11014`): the item bar and the slot on it
 * (`BYTE` each), the shortcut's six `DWORD`s and, for `SHORTCUT_CHAT` alone, `WriteString( m_szString )`, in the
 * order `CDPSrvr::OnAddItemTaskBar` (`WORLDSERVER/DPSrvr.cpp:12428`) reads them. The server sets the slot and sends no
 * reply, except that an 11th chat shortcut gets a DEFINEDTEXT1 `TID_GAME_MAX_SHORTCUT_CHAT` and is not set
 * (`DPSrvr.cpp:12456-12460`). A chat text is a `char[128]`, so it holds at most 127 bytes; the text of any other kind
 * is not written.
 * Neuz sends it when a shortcut is dropped on an item bar (`CWndTaskBar::SetShortcut`, `_Interface/WndTaskBar.cpp:1664`).
 */
export function encodeAddItemTaskBar(bar: number, slot: number, shortcut: Shortcut): Uint8Array {
  checkEditSlot('item bar', bar, MAX_SLOT_ITEM_COUNT);
  checkEditSlot('item slot', slot, MAX_SLOT_ITEM);
  const w = writeShortcutFields(clientPacket(PacketType.ADDITEMTASKBAR).u8(bar).u8(slot), shortcut);
  if (shortcut.kind === ShortcutKind.CHAT) {
    if (shortcut.text.length >= MAX_SHORTCUT_STRING) {
      throw new ProtocolError(
        `a chat shortcut's text of ${shortcut.text.length} characters does not fit a char[${MAX_SHORTCUT_STRING}]`,
      );
    }
    w.string(shortcut.text);
  }
  return w.toBytes();
}

/**
 * REMOVEITEMTASKBAR: `CDPClient::SendRemoveItemTaskBar` (`Neuz/DPClient.cpp:11008`): the item bar and the slot
 * (`BYTE` each), as `CDPSrvr::OnRemoveItemTaskBar` (`WORLDSERVER/DPSrvr.cpp:12477`) reads them; the server empties the
 * slot and sends no reply.
 */
export function encodeRemoveItemTaskBar(bar: number, slot: number): Uint8Array {
  checkEditSlot('item bar', bar, MAX_SLOT_ITEM_COUNT);
  checkEditSlot('item slot', slot, MAX_SLOT_ITEM);
  return clientPacket(PacketType.REMOVEITEMTASKBAR).u8(bar).u8(slot).toBytes();
}

/**
 * SKILLTASKBAR: `CDPClient::SendSkillTaskBar` (`Neuz/DPClient.cpp:10972`): the count as an `int` (written as 0 and
 * patched to `MAX_SLOT_QUEUE` after the loop, so always 5), then for each of the 5 slots its index (`BYTE`) and the
 * shortcut's six `DWORD`s, with no string. `CDPSrvr::OnSkillTaskBar` (`WORLDSERVER/DPSrvr.cpp:12363`) overwrites only
 * the slots it is sent, so a skill taken out of the action slot is sent as all five slots, the rest shifted left and the
 * emptied ones last. `queue[i]` is slot `i`; a slot given `null`, or left out because the list is shorter than 5, is an
 * empty shortcut: `m_dwShortcut` 0 is all the server tests (`IsEmpty()`, `_Interface/UserTaskBar.cpp:217`), and Neuz
 * leaves the other fields of an emptied slot as they were, which nothing reads, so they are written as 0.
 */
export function encodeSkillTaskBar(queue: ReadonlyArray<Shortcut | null>): Uint8Array {
  if (queue.length > MAX_SLOT_QUEUE) {
    throw new ProtocolError(`the action slot holds at most ${MAX_SLOT_QUEUE} skills, not ${queue.length}`);
  }
  const w = clientPacket(PacketType.SKILLTASKBAR).i32(MAX_SLOT_QUEUE);
  for (let i = 0; i < MAX_SLOT_QUEUE; i++) writeShortcutFields(w.u8(i), queue[i] ?? emptyShortcut());
  return w.toBytes();
}

/**
 * The fields of a browser ADDITEMTASKBAR after its type, in the order `CDPSrvr::OnAddItemTaskBar`
 * (`WORLDSERVER/DPSrvr.cpp:12428`) reads them. The server drops a bar or a slot outside the arrays without a word;
 * here that is a `ProtocolError`, as for a packet that is not one.
 */
export function readAddItemTaskBar(r: ArReader): { bar: number; slot: number; shortcut: Shortcut } {
  const bar = readByteSlot(r, 'item bar', MAX_SLOT_ITEM_COUNT);
  const slot = readByteSlot(r, 'item slot', MAX_SLOT_ITEM);
  return { bar, slot, shortcut: readShortcut(r, true) };
}

/** The fields of a browser REMOVEITEMTASKBAR after its type (`CDPSrvr::OnRemoveItemTaskBar`, `DPSrvr.cpp:12477`). */
export function readRemoveItemTaskBar(r: ArReader): { bar: number; slot: number } {
  const bar = readByteSlot(r, 'item bar', MAX_SLOT_ITEM_COUNT);
  const slot = readByteSlot(r, 'item slot', MAX_SLOT_ITEM);
  return { bar, slot };
}

/**
 * The fields of a browser SKILLTASKBAR after its type: the slots it names, in the order sent (`CDPSrvr::OnSkillTaskBar`,
 * `WORLDSERVER/DPSrvr.cpp:12363`). The server returns at once for a count over `MAX_SLOT_QUEUE` and at a slot outside
 * the array; here both are a `ProtocolError`. A count of 0 or less reads no slot, as the C++ loop does.
 */
export function readSkillTaskBar(r: ArReader): Array<{ slot: number; shortcut: Shortcut }> {
  const at = r.position();
  const count = r.i32();
  if (count > MAX_SLOT_QUEUE) throw new ProtocolError(`skill task bar count ${count} is over ${MAX_SLOT_QUEUE}`, at);
  const entries: Array<{ slot: number; shortcut: Shortcut }> = [];
  for (let i = 0; i < count; i++) {
    const slot = readByteSlot(r, 'queue slot', MAX_SLOT_QUEUE);
    entries.push({ slot, shortcut: readShortcut(r, false) });
  }
  return entries;
}

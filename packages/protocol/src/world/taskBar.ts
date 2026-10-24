import type { ArReader } from '../ar/ArReader';
import {
  MAX_SHORTCUT_STRING, MAX_SLOT_APPLET, MAX_SLOT_ITEM, MAX_SLOT_ITEM_COUNT, MAX_SLOT_QUEUE, ShortcutKind,
} from '../constants';
import { ProtocolError } from '../errors';
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

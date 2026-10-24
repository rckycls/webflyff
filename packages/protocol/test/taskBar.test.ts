import { describe, expect, it } from 'vitest';
import {
  ArWriter, BUNDLE_MARKER, MAX_SHORTCUT_STRING, MAX_SLOT_APPLET, MAX_SLOT_ITEM, MAX_SLOT_ITEM_COUNT, MAX_SLOT_QUEUE,
  MessageType, PacketType, ShortcutKind, WORLD_READERS, readBundle,
} from '../src';
import type { Shortcut, TaskBar, WorldMessage } from '../src';

const PLAYER = 0x1234;

interface Msg { objectId: number; type: number; fields: Uint8Array }

/** A SNAPSHOT body written by hand: the 10-byte header, the messages, and (by default) the table of contents. */
function body(messages: Msg[], indexed = true): Uint8Array {
  const w = new ArWriter().u32(PacketType.SNAPSHOT).u32(PLAYER).u16(messages.length);
  const starts: number[] = [];
  let at = 0;
  for (const m of messages) {
    starts.push(at);
    w.u32(m.objectId).u16(m.type).bytes(m.fields);
    at += 6 + m.fields.byteLength;
  }
  if (indexed) {
    for (const s of starts) w.u32(s);
    w.u16(messages.length).u32(BUNDLE_MARKER);
  }
  return w.toBytes();
}

/** The TASKBAR message about the player, from its fields. */
const taskBarMessage = (fields: Uint8Array): Msg => ({ objectId: PLAYER, type: MessageType.TASKBAR, fields });

/**
 * Reads a bundle of this one TASKBAR message, with and without the table of contents, and returns the bar the reader
 * made of it: nothing skipped or mismatched, and the same value both ways.
 */
function readBar(fields: Uint8Array): TaskBar {
  const values: WorldMessage[] = [];
  for (const indexed of [true, false]) {
    const result = readBundle(body([taskBarMessage(fields)], indexed), WORLD_READERS);
    expect(result.skipped).toEqual([]);
    expect(result.mismatched).toEqual([]);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({ objectId: PLAYER, type: MessageType.TASKBAR });
    values.push(result.messages[0].value);
  }
  expect(values[1]).toEqual(values[0]);
  const message = values[0];
  if (message.type !== 'taskBar') throw new Error(`expected a taskBar, got ${message.type}`);
  return message.taskBar;
}

/** Whether the reader drops this TASKBAR message, as it does one whose layout it cannot read to the end. */
function isDropped(fields: Uint8Array): boolean {
  const result = readBundle(body([taskBarMessage(fields)]), WORLD_READERS);
  if (result.mismatched.length === 0) return false;
  expect(result.mismatched).toEqual([MessageType.TASKBAR]);
  expect(result.messages).toEqual([]);
  return true;
}

/** A shortcut in wire order: `m_dwShortcut`, `m_dwId`, `m_dwType`, `m_dwIndex`, `m_dwUserId`, `m_dwData`. */
const shortcut = (
  kind: number, id: number, type: number, index: number, userId: number, data: number, text = '',
): Shortcut => ({ kind, id, type, index, userId, data, text });

/** What `CUserTaskBar::Serialize` writes for a shortcut: its six `DWORD`s, then (only a chat shortcut's) the string. */
function writeShortcut(w: ArWriter, s: Shortcut, withText = true): ArWriter {
  w.u32(s.kind).u32(s.id).u32(s.type).u32(s.index).u32(s.userId).u32(s.data);
  if (withText && s.kind === ShortcutKind.CHAT) w.string(s.text);
  return w;
}

/** The fields of a TASKBAR message, laid out as `CUserTaskBar::Serialize` (`UserTaskBar.cpp:63-125`) does. */
function barFields(bar: {
  applets?: Array<[number, Shortcut]>;
  items?: Array<[number, number, Shortcut]>;
  queue?: Array<[number, Shortcut]>;
  actionPoint?: number;
}): ArWriter {
  const w = new ArWriter();
  const applets = bar.applets ?? [];
  w.i32(applets.length);
  for (const [slot, s] of applets) writeShortcut(w.i32(slot), s);
  const items = bar.items ?? [];
  w.i32(items.length);
  for (const [barIndex, slot, s] of items) writeShortcut(w.i32(barIndex).i32(slot), s);
  const queue = bar.queue ?? [];
  w.i32(queue.length);
  for (const [slot, s] of queue) writeShortcut(w.i32(slot), s, false);
  return w.i32(bar.actionPoint ?? 0);
}

describe('the values copied from the C++ headers', () => {
  it('the shortcut kinds are those of ProjectCmn.h:910-923', () => {
    expect(ShortcutKind).toEqual({
      NONE: 0, ETC: 1, APPLET: 2, MOTION: 3, SCRIPT: 4, ITEM: 5, SKILL: 6, OBJECT: 7, CHAT: 8, SKILLFUN: 9,
      EMOTICON: 10, LORDSKILL: 11,
    });
  });

  it('the slot counts are those of ProjectCmn.h:899-906 (__VER >= 11) and DefineCommon.h:10', () => {
    expect([MAX_SLOT_APPLET, MAX_SLOT_ITEM_COUNT, MAX_SLOT_ITEM, MAX_SLOT_QUEUE, MAX_SHORTCUT_STRING])
      .toEqual([18, 8, 9, 5, 128]);
  });
});

describe('TASKBAR', () => {
  it("the new character's task bar is read: the applets, the item bar, an empty queue and no action point", () => {
    // BASE_VALUE_TBL (Database.sql:2741-2742), both sexes: m_aSlotApplet, m_aSlotItem, m_aSlotQueue (empty) and
    // m_SkillBar 0, each entry as `slot,kind,id,type,index,userId,data` (an item entry starts with its bar).
    const applets: Array<[number, Shortcut]> = [
      [0, shortcut(ShortcutKind.APPLET, 400, 0, 0, 0, 0)],
      [1, shortcut(ShortcutKind.APPLET, 398, 0, 1, 0, 0)],
      [2, shortcut(ShortcutKind.APPLET, 2010, 0, 2, 0, 0)],
      [3, shortcut(ShortcutKind.APPLET, 581, 0, 3, 0, 0)],
      [4, shortcut(ShortcutKind.MOTION, 25, 0, 4, 0, 0)],
    ];
    const items: Array<[number, number, Shortcut]> = [
      [0, 0, shortcut(ShortcutKind.ITEM, 45, 0, 0, 0, 1)],
      [0, 1, shortcut(ShortcutKind.ITEM, 1, 0, 1, 0, 1)],
      [0, 2, shortcut(ShortcutKind.MOTION, 3, 0, 2, 0, 1)],
      [0, 8, shortcut(ShortcutKind.MOTION, 2, 0, 8, 0, 1)],
    ];
    expect(readBar(barFields({ applets, items }).toBytes())).toEqual({
      applets: applets.map(([slot, s]) => ({ slot, shortcut: s })),
      items: items.map(([bar, slot, s]) => ({ bar, slot, shortcut: s })),
      queue: [],
      actionPoint: 0,
    });
  });

  it('reads the fields of an entry in the order of the C++: kind, ID, type, index, user ID, data', () => {
    // ar >> m_dwShortcut >> m_dwId >> m_dwType; ar >> m_dwIndex >> m_dwUserId >> m_dwData;
    const fields = new ArWriter().i32(1).i32(7).u32(6).u32(5).u32(4).u32(3).u32(2).u32(1).i32(0).i32(0).i32(0);
    expect(readBar(fields.toBytes()).applets).toEqual([{
      slot: 7, shortcut: { kind: 6, id: 5, type: 4, index: 3, userId: 2, data: 1, text: '' },
    }]);
  });

  it('reads an item entry as its bar, then its slot, then the shortcut', () => {
    // ar >> nIndex >> nIndex2; then the six DWORDs.
    const fields = new ArWriter().i32(0).i32(1).i32(7).i32(8).u32(6).u32(5).u32(4).u32(3).u32(2).u32(1).i32(0).i32(0);
    expect(readBar(fields.toBytes()).items).toEqual([{
      bar: 7, slot: 8, shortcut: { kind: 6, id: 5, type: 4, index: 3, userId: 2, data: 1, text: '' },
    }]);
  });

  it('a chat shortcut carries its text, in an applet slot and on an item bar, and the entries after it read', () => {
    // if( m_dwShortcut == SHORTCUT_CHAT ) ar.ReadString( m_szString, MAX_SHORTCUT_STRING );
    const applets: Array<[number, Shortcut]> = [
      [2, shortcut(ShortcutKind.CHAT, 0, 0, 2, 0, 0, '/s Hello there')],
      [3, shortcut(ShortcutKind.APPLET, 400, 0, 3, 0, 0)],
    ];
    const items: Array<[number, number, Shortcut]> = [
      [1, 4, shortcut(ShortcutKind.CHAT, 0, 0, 4, 0, 1, '/p Party up?')],
      [1, 5, shortcut(ShortcutKind.ITEM, 9, 0, 5, 0, 1)],
    ];
    const bar = readBar(barFields({ applets, items, actionPoint: 3 }).toBytes());
    expect(bar.applets).toEqual(applets.map(([slot, s]) => ({ slot, shortcut: s })));
    expect(bar.items).toEqual(items.map(([b, slot, s]) => ({ bar: b, slot, shortcut: s })));
    expect(bar.applets[0].shortcut.text).toBe('/s Hello there');
    expect(bar.items[0].shortcut.text).toBe('/p Party up?');
    expect(bar.actionPoint).toBe(3);
  });

  it('reads an empty text for a chat shortcut with no characters', () => {
    const applets: Array<[number, Shortcut]> = [[0, shortcut(ShortcutKind.CHAT, 0, 0, 0, 0, 0, '')]];
    expect(readBar(barFields({ applets }).toBytes()).applets).toEqual([{ slot: 0, shortcut: applets[0][1] }]);
  });

  it('only a chat shortcut has a string: the other kinds read none', () => {
    // Kinds 0 to 11 other than 8: if a string were read for them, the next entry would be misread.
    for (let kind = 0; kind <= 11; kind++) {
      if (kind === ShortcutKind.CHAT) continue;
      const applets: Array<[number, Shortcut]> = [
        [0, shortcut(kind, 11, 22, 0, 33, 44)],
        [1, shortcut(ShortcutKind.APPLET, 400, 0, 1, 0, 0)],
      ];
      const bar = readBar(barFields({ applets }).toBytes());
      expect(bar.applets, `kind ${kind}`).toEqual(applets.map(([slot, s]) => ({ slot, shortcut: s })));
    }
  });

  it('the text may fill the char[128] but its terminator: 127 bytes are read, 128 drop the message', () => {
    const longest = 'c'.repeat(127);
    const at = (text: string) => barFields({ applets: [[0, shortcut(ShortcutKind.CHAT, 0, 0, 0, 0, 0, text)]] });
    expect(readBar(at(longest).toBytes()).applets[0].shortcut.text).toBe(longest);
    expect(isDropped(at('c'.repeat(128)).toBytes())).toBe(true);
    // A chat string on an item bar is bounded the same way.
    const onBar = (text: string) => barFields({ items: [[0, 0, shortcut(ShortcutKind.CHAT, 0, 0, 0, 0, 1, text)]] });
    expect(readBar(onBar(longest).toBytes()).items[0].shortcut.text).toBe(longest);
    expect(isDropped(onBar('c'.repeat(128)).toBytes())).toBe(true);
  });

  it('the queue reads six DWORDs per entry and no string, then the action point after the entries', () => {
    // The skills of the action slot: kind SKILL (6), type 0 (own skill), ID the index into m_aJobSkill, data 2.
    const queue: Array<[number, Shortcut]> = [
      [0, shortcut(ShortcutKind.SKILL, 0, 0, 0, 0, 2)],
      [1, shortcut(ShortcutKind.SKILL, 1, 0, 1, 0, 2)],
      [2, shortcut(ShortcutKind.SKILL, 2, 0, 2, 0, 2)],
    ];
    const bar = readBar(barFields({ queue, actionPoint: 25 }).toBytes());
    expect(bar.queue).toEqual(queue.map(([, s]) => s));
    expect(bar.actionPoint).toBe(25);
    // A queue entry of the kind that has a string elsewhere has none here (UserTaskBar.cpp:116-119 writes no string).
    const chat: Array<[number, Shortcut]> = [[0, shortcut(ShortcutKind.CHAT, 5, 6, 0, 7, 8)]];
    expect(readBar(barFields({ queue: chat, actionPoint: 9 }).toBytes())).toMatchObject({
      queue: [{ kind: ShortcutKind.CHAT, id: 5, text: '' }], actionPoint: 9,
    });
  });

  it('a queue slot the message does not list is empty, as Neuz clears the bar before it reads', () => {
    // InitTaskBar: memset( m_aSlotQueue, 0 ); only the listed slots are written.
    const queue: Array<[number, Shortcut]> = [
      [0, shortcut(ShortcutKind.SKILL, 0, 0, 0, 0, 2)],
      [2, shortcut(ShortcutKind.SKILL, 2, 0, 2, 0, 2)],
    ];
    expect(readBar(barFields({ queue }).toBytes()).queue).toEqual([
      queue[0][1], shortcut(0, 0, 0, 0, 0, 0), queue[1][1],
    ]);
  });

  it('keeps the index the message carries, which Neuz overwrites with the slot after it reads', () => {
    // m_aSlotApplet[nIndex].m_dwIndex = nIndex; (WndTaskBar.cpp:327, :381, :392): the wire's value is the
    // shortcut's own.
    const applets: Array<[number, Shortcut]> = [[4, shortcut(ShortcutKind.APPLET, 400, 0, 17, 0, 0)]];
    expect(readBar(barFields({ applets }).toBytes()).applets).toEqual([{ slot: 4, shortcut: applets[0][1] }]);
  });

  it('keeps the numbers whole: a DWORD above 2^31 stays unsigned and the action point is signed', () => {
    const applets: Array<[number, Shortcut]> = [
      [0, shortcut(ShortcutKind.ITEM, 0xfffffff0, 0xfffffff1, 0, 0xfffffff2, 0xfffffff3)],
    ];
    const bar = readBar(barFields({ applets, actionPoint: -4 }).toBytes());
    expect(bar.applets[0].shortcut).toEqual(applets[0][1]);
    expect(bar.actionPoint).toBe(-4);
  });

  it('reads the highest slot of each array', () => {
    const last = shortcut(ShortcutKind.ITEM, 3, 0, 8, 0, 1);
    const bar = readBar(barFields({
      applets: [[MAX_SLOT_APPLET - 1, last]],
      items: [[MAX_SLOT_ITEM_COUNT - 1, MAX_SLOT_ITEM - 1, last]],
      queue: [[MAX_SLOT_QUEUE - 1, last]],
    }).toBytes());
    expect(bar.applets).toEqual([{ slot: 17, shortcut: last }]);
    expect(bar.items).toEqual([{ bar: 7, slot: 8, shortcut: last }]);
    expect(bar.queue).toHaveLength(5);
    expect(bar.queue[4]).toEqual(last);
    expect(bar.queue.slice(0, 4).every((s) => s.kind === ShortcutKind.NONE)).toBe(true);
  });

  it('reads a bar with nothing on it: three counts and the action point', () => {
    expect(readBar(new ArWriter().i32(0).i32(0).i32(0).i32(0).toBytes()))
      .toEqual({ applets: [], items: [], queue: [], actionPoint: 0 });
  });

  it('reads no entry for a count of 0 or less, as the loop `i < nCount` does', () => {
    expect(readBar(new ArWriter().i32(-3).i32(0).i32(-1).i32(5).toBytes()))
      .toEqual({ applets: [], items: [], queue: [], actionPoint: 5 });
  });

  it('applies a slot the message lists twice in the order it lists it, as Neuz assigns it', () => {
    // The server writes each slot once; Neuz would assign twice and keep the later one, so the later one comes last.
    const first = shortcut(ShortcutKind.APPLET, 400, 0, 0, 0, 0);
    const second = shortcut(ShortcutKind.APPLET, 398, 0, 0, 0, 0);
    expect(readBar(barFields({ applets: [[0, first], [0, second]] }).toBytes()).applets)
      .toEqual([{ slot: 0, shortcut: first }, { slot: 0, shortcut: second }]);
  });

  it('a queue slot listed twice holds the later entry', () => {
    const first = shortcut(ShortcutKind.SKILL, 0, 0, 0, 0, 2);
    const second = shortcut(ShortcutKind.SKILL, 1, 0, 0, 0, 2);
    expect(readBar(barFields({ queue: [[0, first], [0, second]] }).toBytes()).queue).toEqual([second]);
  });

  it('drops a slot outside the arrays, which Neuz would write past the end of', () => {
    const s = shortcut(ShortcutKind.APPLET, 400, 0, 0, 0, 0);
    for (const fields of [
      barFields({ applets: [[MAX_SLOT_APPLET, s]] }),
      barFields({ applets: [[-1, s]] }),
      barFields({ items: [[MAX_SLOT_ITEM_COUNT, 0, s]] }),
      barFields({ items: [[-1, 0, s]] }),
      barFields({ items: [[0, MAX_SLOT_ITEM, s]] }),
      barFields({ items: [[0, -1, s]] }),
      barFields({ queue: [[MAX_SLOT_QUEUE, s]] }),
      barFields({ queue: [[-1, s]] }),
    ]) {
      expect(isDropped(fields.toBytes())).toBe(true);
    }
  });

  it('drops a message that promises more entries than it holds', () => {
    // An applet count of 3 with one entry, and an item count of 2 with none.
    const s = shortcut(ShortcutKind.APPLET, 400, 0, 0, 0, 0);
    expect(isDropped(writeShortcut(new ArWriter().i32(3).i32(0), s).i32(0).i32(0).i32(0).toBytes())).toBe(true);
    expect(isDropped(new ArWriter().i32(0).i32(2).i32(0).i32(0).toBytes())).toBe(true);
    expect(isDropped(new ArWriter().i32(0x7fffffff).i32(0).i32(0).i32(0).toBytes())).toBe(true);
  });

  it('drops a message with a byte more or less than the layout reads', () => {
    const fields = barFields({
      applets: [[0, shortcut(ShortcutKind.CHAT, 0, 0, 0, 0, 0, 'hi')]],
      items: [[0, 0, shortcut(ShortcutKind.ITEM, 45, 0, 0, 0, 1)]],
      queue: [[0, shortcut(ShortcutKind.SKILL, 0, 0, 0, 0, 2)]],
      actionPoint: 6,
    }).toBytes();
    expect(isDropped(fields)).toBe(false);
    const longer = new Uint8Array(fields.byteLength + 1);
    longer.set(fields);
    expect(isDropped(longer)).toBe(true);
    expect(isDropped(fields.subarray(0, fields.byteLength - 1))).toBe(true);
    expect(isDropped(new Uint8Array(0))).toBe(true);
  });

  it('is in WORLD_READERS and reads in a bundle among other messages', () => {
    expect(WORLD_READERS.has(MessageType.TASKBAR)).toBe(true);
    const messages: Msg[] = [
      { objectId: 5, type: MessageType.ENVIRONMENTALL, fields: new ArWriter().i32(2).toBytes() },
      taskBarMessage(
        barFields({ applets: [[0, shortcut(ShortcutKind.APPLET, 400, 0, 0, 0, 0)]], actionPoint: 1 }).toBytes(),
      ),
      { objectId: 5, type: MessageType.ENVIRONMENTALL, fields: new ArWriter().i32(3).toBytes() },
    ];
    for (const indexed of [true, false]) {
      const result = readBundle(body(messages, indexed), WORLD_READERS);
      expect(result.mismatched).toEqual([]);
      expect(result.skipped).toEqual([]);
      expect(result.messages.map((m) => m.value.type)).toEqual(['environmentSetting', 'taskBar', 'environmentSetting']);
    }
  });
});

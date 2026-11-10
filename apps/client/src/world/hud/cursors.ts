// The V15 mouse cursors (2026-11-11): the files of Client/Cursor as `CNeuzApp::OneTimeSceneInit` loads them
// (`Source/Neuz/Neuz.cpp:284-299`, the ids of `Neuz.h:7-25`), shown with CSS `cursor: url(...) x y` on a computer; a phone
// shows none. The converter makes each a PNG (`ui/<name>.png`, its 1-bit mask the transparency, `uiStage.ts`
// `CURSOR_FILES`); the hotspots are the files' own (their ICONDIRENTRY, as `d3dutil.cpp:330-331` reads them).
//
// Which one shows:
//   - every window and control: CUR_BASE (`CWndBase::OnSetCursor`, `_Interface/WndBase.cpp:2270-2273`); an edit box CUR_EDIT
//     unless read-only (`WndEditCtrl.cpp:1333-1342`); a resizable window's edges CUR_RESIZE_* (`CWndNeuz::OnSetCursor`,
//     `WndNeuz.cpp:680-730`; `frame.ts`); the bag in the upgrade mode CUR_HAMMER (`WndField.cpp:2811-2829`; `inventoryWindow.ts`);
//     the NPC dialog's answers and keys CUR_SELECT, its context words CUR_HELP (`WndDialog.cpp:161-232`);
//   - the world: `worldCursor` (`CWndWorld::OnSetCursor`, `WndWorld.cpp:2562-2660`); a dropped item CUR_GETITEM (:2592-2593);
//   - waiting: CUR_DELAY, which Neuz shows as it starts (`Neuz.cpp:1563`): here while the world loads.
// Not used: CUR_CAMERA (the middle button's camera, :2568-2571: the browser turns the camera with the right button, as
// Neuz's default interface does, which keeps the cursor) and CUR_CONTROL (the world's controls, chests and levers, are not
// in the browser).

/** A cursor: its picture's key (the converter's), its hotspot, and the browser's own cursor when the picture is missing. */
export interface CursorFile {
  key: string;
  hotspot: readonly [number, number];
  fallback: string;
}

export const CURSORS = {
  attack: { key: 'ui/curattack.png', hotspot: [0, 0], fallback: 'pointer' }, // CUR_ATTACK, Neuz.cpp:284
  base: { key: 'ui/curbase.png', hotspot: [1, 1], fallback: 'default' }, // CUR_BASE, :285
  camera: { key: 'ui/curcamera.png', hotspot: [16, 19], fallback: 'move' }, // CUR_CAMERA, :286
  control: { key: 'ui/curcontrol.png', hotspot: [12, 13], fallback: 'pointer' }, // CUR_CONTROL, :287
  edit: { key: 'ui/edit.png', hotspot: [5, 9], fallback: 'text' }, // CUR_EDIT, :288
  getItem: { key: 'ui/curgetitem.png', hotspot: [2, 9], fallback: 'pointer' }, // CUR_GETITEM, :289
  help: { key: 'ui/curhelp.png', hotspot: [1, 1], fallback: 'help' }, // CUR_HELP, :290
  no: { key: 'ui/curno.png', hotspot: [13, 12], fallback: 'not-allowed' }, // CUR_NO, :291
  npc: { key: 'ui/curnpc.png', hotspot: [15, 9], fallback: 'pointer' }, // CUR_NPC, :292 (curNPC.cur on disk)
  select: { key: 'ui/curselect.png', hotspot: [0, 0], fallback: 'pointer' }, // CUR_SELECT, :293
  resizeHori: { key: 'ui/hori.png', hotspot: [15, 16], fallback: 'ew-resize' }, // CUR_RESIZE_HORI, :294
  resizeVert: { key: 'ui/resize_h.png', hotspot: [15, 14], fallback: 'ns-resize' }, // CUR_RESIZE_VERT, :295
  resizeHv1: { key: 'ui/cur00001.png', hotspot: [12, 12], fallback: 'nwse-resize' }, // CUR_RESIZE_HV1, :296
  resizeHv2: { key: 'ui/cur00002.png', hotspot: [13, 14], fallback: 'nesw-resize' }, // CUR_RESIZE_HV2, :297
  hammer: { key: 'ui/anvil.png', hotspot: [0, 0], fallback: 'crosshair' }, // CUR_HAMMER, :298
  delay: { key: 'ui/curdelay.png', hotspot: [8, 15], fallback: 'wait' }, // CUR_DELAY, :299
} as const satisfies Record<string, CursorFile>;

export type CursorId = keyof typeof CURSORS;

/** The CSS custom property that holds a cursor's value: `--cur-attack`, `--cur-get-item`, `--cur-resize-hv1` ... */
export const cursorVar = (id: CursorId): string => `--cur-${id.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

/**
 * The CSS custom properties of every cursor whose picture `url` finds (`url(...) x y, fallback`); a missing one is left
 * out, so the stylesheet's own fallback (the browser's cursor) shows.
 */
export function cursorProperties(url: (key: string) => string): Map<string, string> {
  const properties = new Map<string, string>();
  for (const [id, file] of Object.entries(CURSORS) as Array<[CursorId, CursorFile]>) {
    const at = url(file.key);
    if (at === '') continue;
    properties.set(cursorVar(id), `url(${JSON.stringify(at)}) ${file.hotspot[0]} ${file.hotspot[1]}, ${file.fallback}`);
  }
  return properties;
}

/** What the mouse is over in the world (`m_pSelectObj`, the highlighted object): a mover, peaceful or not; or nothing. */
export type WorldHover = { peaceful: boolean; player: boolean } | null;

/**
 * `CWndWorld::OnSetCursor` (`WndWorld.cpp:2562-2660`) without the middle button: over a peaceful mover CUR_NPC, but CUR_BASE
 * for a player (:2581-2585; players are peaceful, `propMover.txt`); over any other mover CUR_ATTACK (:2588-2589). Over
 * nothing, CUR_NO where the world takes no press (`noAction`: the own shop up or the shop window open, Jewel Setting open,
 * :2629-2652), else CUR_BASE. A dead player highlights nothing (:1084-1085): the caller gives null.
 */
export function worldCursor(hover: WorldHover, noAction: boolean): CursorId {
  if (hover !== null) return hover.peaceful ? (hover.player ? 'base' : 'npc') : 'attack';
  return noAction ? 'no' : 'base';
}

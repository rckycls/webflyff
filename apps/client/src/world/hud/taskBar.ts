// The task bar (spec §3.9, §3.11): Neuz's `CWndTaskBar` along the bottom of the screen, with its Start button and menu
// (`TaskMenu`), the applet row, the F1-F9 slots of the bar shown, the bar's arrows and number, and the action slot with its
// button; the keys Neuz reads for it; and, from milestone 2, the bar's edits: a skill of the skill window placed on a slot of
// the bar or of the action slot, a shortcut moved or taken off. It draws what the TASKBAR message put on the bars
// (`OwnState.taskBar`) with the own inventory and the catalogs, and asks its owner (`TaskBarActions`) to do what a press means
// and to send what an edit changed.
//
//   CWndTaskBar::Initialize        _Interface/WndTaskBar.cpp:1232-1312  the window by the screen's width: 5, 10 or 18 applets
//   APP_TASKBAR800 ... 1680W        Resource/resdata.inc:9077-11666      its picture and its controls' rectangles
//   CWndTaskBar::OnInitialUpdate   WndTaskBar.cpp:1148-1199             the rows from WIDC_CUSTOM1-3; the windows' layout
//                                                                       ends above the bar (:1176-1178); icon_ActionSkill.dds
//   CWndTaskBar::Serialize (load)  WndTaskBar.cpp:315-400               the bars read anew; a stackable item's m_dwItemId;
//                                                                       an applet-row skill not CT_STEP or CT_GENERAL emptied
//   CWndTaskBar::SetTaskBarTexture WndTaskBar.cpp:403-476               the picture of each kind of shortcut
//   CWndTaskBar::PutTooTip         WndTaskBar.cpp:547-684               what a slot is called (its applet's description ...)
//   CWndTaskBar::OnDraw            WndTaskBar.cpp:746-1090              the rows a carried shortcut may go to (:769-819), the
//                                                                       slots, a stackable item's count, the applets'
//                                                                       hotkeys, the action slot's button and points, the bar
//                                                                       number
//   CWndTaskBar::UpdateItem        WndTaskBar.cpp:1092-1143             an item shortcut whose object is gone
//   CWndTaskBar::OnChildNotify     WndTaskBar.cpp:1344-1419             the arrows, the Start button, a slot pressed
//   CWndTaskBar::RemoveSkillQueue  WndTaskBar.cpp:1446-1472             a skill taken out of the action slot, and the ones
//                                                                       that can no longer follow; SKILLTASKBAR
//   CWndTaskBar::OnRButtonUp       WndTaskBar.cpp:1473-1512             a right click takes a shortcut off
//   CWndTaskBar::SetShortcut       WndTaskBar.cpp:1514-1667             a shortcut put on an item slot; ADDITEMTASKBAR
//   CWndTaskBar::SetSkillQueue     WndTaskBar.cpp:1787-1872             a skill put in the action slot; SKILLTASKBAR
//   CWndTaskBar::OnDropIcon        WndTaskBar.cpp:1874-2093             a carried shortcut let go on the bar, or off it
//   CWndTaskBar::OnMouseMove ...   WndTaskBar.cpp:2143-2188             a slot dragged, or pressed (OnLButtonUp)
//   CWndTaskBar::Process           WndTaskBar.cpp:2325-2427             the applets' hotkeys, F1-F9, none while carrying
//   CWndMgr::ObjectExecutor        _Interface/WndManager.cpp:2566-2700  an applet pressed opens its window, Log out
//   CWndMgr::Process               WndManager.cpp:3541-3582             the keys 1-8
//   CWndWorld::OnKeyUp             _Interface/WndWorld.cpp:7712-7729    C, the action slot
//
// Piece 4 uses no item (Piece 5): an item shortcut shows its icon, and a stackable item its count, greyed. Skills come from
// the skills catalog of milestone 2 (`TaskBarData.skills`), and without it a skill is a plain greyed slot, as every other
// kind is (motions, chat lines ...). The applet row is not edited: the browser has no ADDAPPLETTASKBAR or
// REMOVEAPPLETTASKBAR (see `dropOn`).
//
// The edits, for a mouse and for a finger (spec §3.11): with the mouse a shortcut is dragged (from the skill window, or from
// a slot of the item row or the action slot) and let go on a slot, or off the bar to take it off, as Neuz does, and a right
// click takes one off; with a finger a skill of the skill window is tapped, then a slot (`carrySkill` with no event), and a
// long press on a slot offers to take it off (`LONG_PRESS_MS`). Neither of the finger's ways is Neuz's, which has no touch.

import { MAX_SLOT_APPLET, MAX_SLOT_ITEM, MAX_SLOT_ITEM_COUNT, MAX_SLOT_QUEUE, ShortcutKind } from '@flyffweb/protocol';
import type { InventoryItem, Shortcut, TaskBar as TaskBarMessage } from '@flyffweb/protocol';
import type { WebItemProp, WebSkill } from '@flyffweb/formats';
import { watchTouch } from '@flyffweb/scene';
import type { TouchWatch } from '@flyffweb/scene';
import type { OwnState } from '../OwnState';
import { canPlaceInQueue, canPlaceOnBar, checkAddSkill, checkSkill, isBarStyle } from '../skills/skillRules';
import { APPLETS, AppId, appletText } from './applets';
import { themeKey, themeUrl } from './art';
import type { UiArt } from './art';
import { formatText } from './format';
import { setLayoutBottom } from './frame';
import { TaskMenu } from './taskMenu';

/** The windows of Piece 4 a press on the task bar opens. */
export type TaskBarWindow = 'character' | 'status' | 'skills';

/**
 * The applets whose window Piece 4 has, which `ObjectExecutor` opens (or closes) when they are pressed: from the Start
 * menu, a slot or their hotkey. The skill window (`APP_SKILL3`, K) is milestone 2's.
 */
const WINDOWS: ReadonlyMap<number, TaskBarWindow> = new Map([
  [AppId.STATUS1, 'status'],
  [AppId.CHARACTER3, 'character'],
  [AppId.SKILL3, 'skills'],
]);

/**
 * The hotkeys the task bar reads (`CWndTaskBar::Process`, `WndTaskBar.cpp:2359-2388`): those of the applets of `WINDOWS`,
 * by the letter of their key (`KeyH`, `KeyK`). APP_STATUS1's T is the status window's own (`Hud`), so it is not read twice.
 */
const HOTKEYS: ReadonlyMap<string, number> = new Map(
  [...WINDOWS.keys()]
    .filter((id) => id !== AppId.STATUS1)
    .map((id) => [APPLETS.get(id)!.hotkey!, id] as const),
);

/**
 * The lines of `CWndTaskMenu` (`WndTaskBar.cpp:2595-2641`) that Piece 4 has, in its order, with the plan's texts (Neuz's
 * are `TID_APP_STATUS`, `TID_APP_CHARACTER`, `TID_APP_SKILL` and `TID_APP_LOGOUT`). A line whose window Piece 4 lacks is
 * greyed.
 */
const MENU: ReadonlyArray<{ id: number; text: string }> = [
  { id: AppId.STATUS1, text: 'Status' },
  { id: AppId.CHARACTER3, text: 'Character' },
  { id: AppId.SKILL3, text: 'Skills' },
  { id: AppId.LOGOUT, text: 'Log out' },
];

/**
 * The Start button's name for a screen reader: its picture says "Start" (ButtStart.bmp), and no text of the catalogs does
 * (resdata.inc names the button "Button"), so it is one of the plan's own texts.
 */
const START_LABEL = 'Start';

/** What a press on the task bar asks its owner for, and where its edits go. */
export interface TaskBarActions {
  /** Opens a window of Piece 4, or closes it if it is open (`ObjectExecutor` on an applet). */
  open(window: TaskBarWindow): void;
  /** Logs out (the Start menu's Log out, an APP_LOGOUT applet): its owner asks first, as `CWndLogOut` does. */
  logOut(): void;
  /**
   * Uses slot `slot` (0-8) of bar `bar` (0-7), which holds `shortcut`, an item or a skill (not an applet, which the bar runs
   * itself): F1-F9 or a press on it (`ObjectExecutor( lpShortcut )`).
   */
  useSlot(bar: number, slot: number, shortcut: Shortcut): void;
  /** Uses slot `slot` of the applet row, which holds `shortcut`, a skill or an item (not an applet): a press on it. */
  useAppletSlot(slot: number, shortcut: Shortcut): void;
  /** Uses the action slot: its button, or C (`CWndWorld::UseSkill`). */
  useActionSlot(): void;
  /** ADDITEMTASKBAR (`CDPClient::SendAddItemTaskBar`): `shortcut` put on slot `slot` of item bar `bar`. */
  sendAddItemTaskBar(bar: number, slot: number, shortcut: Shortcut): void;
  /** REMOVEITEMTASKBAR (`CDPClient::SendRemoveItemTaskBar`): slot `slot` of item bar `bar` emptied. */
  sendRemoveItemTaskBar(bar: number, slot: number): void;
  /** SKILLTASKBAR (`CDPClient::SendSkillTaskBar`): the action slot's 5 slots, `null` for an empty one. */
  sendSkillTaskBar(queue: ReadonlyArray<Shortcut | null>): void;
  /** `CWndTaskBar::m_nExecute != 0`: the action slot's chain runs (`SkillUse.execute`), and the action slot takes no edit. */
  queueRunning(): boolean;
  /** `g_WndMng.PutString( text, NULL, color )`: a line of the server messages (`TID_GAME_SKILLLNOTUSE`). */
  say(text: string, color: number): void;
}

/** The catalogs the bar draws and edits with. */
export interface TaskBarData {
  /** The item catalog: an item shortcut's icon, name and `dwPackMax` (`WebItemProp`). */
  itemProps: ReadonlyMap<number, Pick<WebItemProp, 'icon' | 'name' | 'packMax'>>;
  /**
   * The skills catalog of milestone 2 (`GameData.skills`, by skill id): a skill's icon, name, combo style and the rules'
   * columns. Without it a skill is a plain slot, and no skill goes on the bar.
   */
  skills?: ReadonlyMap<number, WebSkill>;
  /** The texts catalog: the applets' descriptions, the action slot's button name, the bar's texts and their colours. */
  texts?: ReadonlyMap<string, { text: string; color?: number }>;
}

/**
 * What the pointer or a finger carries to the bar (`m_GlobalShortcut`): a skill of the skill window, by its slot of
 * `m_aJobSkill` (`CWndSkillTreeEx::OnMouseMove`, `WndField.cpp:7438-7463`: `SHORTCUT_SKILL`, type 0, `m_dwId` the slot), or
 * the shortcut of a slot of an item bar or of the action slot (`CWndTaskBar::OnMouseMove`, `WndTaskBar.cpp:2143-2168`).
 */
export type Carried =
  | { from: 'skills'; skillIndex: number }
  | { from: 'item'; bar: number; slot: number }
  | { from: 'queue'; slot: number };

/**
 * Where a carried shortcut is let go: a slot of the item row or of the action slot, the applet row, elsewhere on the bar,
 * or off it (null).
 */
type DropTarget = { row: 'item' | 'queue'; slot: number } | 'applet' | 'bar' | null;

/** `ICON_SIZE` and `SKILL_SIZE` (`WndTaskBar.cpp:183-184`): the slots of the applet row and the bars, and the action slot's. */
const ICON_SIZE = 32;
const SKILL_SIZE = 28;
/** `TASKBAR_HEIGHT` (`WndTaskBar.cpp:24`) and every task bar window's height (resdata.inc). */
const TASKBAR_HEIGHT = 48;
/** The top of WIDC_CUSTOM1 to WIDC_CUSTOM3 in every task bar window: `POINT_APPLET_Y`, `POINT_ITEM_Y`, `POINT_QUEUE_Y`. */
const SLOT_TOP = 10;
/** WIDC_BUTTON1, the Start button (`ButtStart.bmp`, 26 14 90 34 in every task bar window); its picture's four states are 64 px. */
const START = { left: 26, top: 14, width: 64, height: 20 } as const;
/**
 * The most a touch screen draws the Start menu at (ruling R27): its 20 px lines at 40 px, a finger's, where the room above
 * the bar allows (a landscape phone's 300 to 340 px holds the 164 px menu about twice).
 */
const TOUCH_MENU_SCALE = 2;
/** `LV2MAXAP` ... `LV5MAXAP` (`WndTaskBar.cpp:1037-1040`): the action points that light the 2nd to 5th action slot. */
const AP_STEPS = [10, 25, 50, 100] as const;
/**
 * The rows a carried shortcut may go to, lit under them (`OnDraw`, :769-819): WIDC_CUSTOM2 (290 px wide in every task bar
 * window) and WIDC_CUSTOM3 (140), from y 42 to 47, 6 px wider each side for the item row, 3 and 4 for the action slot.
 */
const ITEM_ROW_WIDTH = 290;
const QUEUE_ROW_WIDTH = 140;
const LIT = { top: 42, height: 5 } as const;
/**
 * How far the mouse goes with its button down before a press on a slot becomes a drag. Neuz drags at the first move
 * (`OnMouseMove`); a few pixels let a press whose mouse shakes stay a press.
 */
const DRAG_START = 4;
/** A finger held on a slot this long (ms), and moved no more than `LONG_PRESS_SLOP` px, offers to take its shortcut off. */
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 10;
/**
 * The text of the long press's line, a text of the catalog: "Remove", a line of Neuz's own pop-up menu over a mover
 * (`m_wndMenuMover.AppendMenu( ..., MMI_GHOUSE_RECALL, GETTEXT( TID_MMI_GHOUSE_RECALL ) )`, `WndWorld.cpp:11478`).
 */
const REMOVE_TEXT = 'TID_MMI_GHOUSE_RECALL';

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** The task bar window of a screen width (`TaskBarLayout`), as `CWndTaskBar::Initialize` picks it. */
export interface TaskBarLayout {
  /** The window's width, and its picture (resdata.inc's file name). */
  width: number;
  picture: string;
  /** `m_nMaxSlotApplet`: the applet slots drawn. */
  applets: number;
  /** The left of WIDC_CUSTOM1, WIDC_CUSTOM2 and WIDC_CUSTOM3: the applet row, the bar and the action slot. */
  appletX: number;
  itemX: number;
  queueX: number;
  /** WIDC_UP and WIDC_DOWN, the bar's arrows. */
  up: Rect;
  down: Rect;
  /** Under 1 where the screen is narrower than the window, which is drawn that much smaller. */
  scale: number;
}

const rect = (left: number, top: number, right: number, bottom: number): Rect => ({ left, top, right, bottom });

/** The controls of the windows (resdata.inc: APP_TASKBAR800 :9995, APP_TASKBAR1024 :9929, APP_TASKBAR1280 :9863). */
const CONTROLS_800 = { appletX: 106, itemX: 286, queueX: 638, up: rect(584, 8, 598, 20), down: rect(584, 32, 598, 44) };
const CONTROLS_1024 = { appletX: 106, itemX: 446, queueX: 798, up: rect(744, 8, 758, 20), down: rect(744, 32, 758, 44) };
/** The wide windows (APP_TASKBAR1360W :9077, 1400 :11600, 1440W :11666, 1600 :9143, 1680W :10592) have the 1280 one's. */
const CONTROLS_1280 = { appletX: 106, itemX: 702, queueX: 1054, up: rect(1000, 8, 1014, 20), down: rect(1000, 32, 1014, 44) };

/** `CWndTaskBar::Initialize`'s windows (`WndTaskBar.cpp:1264-1306`), by `g_Option.m_nResWidth`. */
const WINDOWS_BY_WIDTH = [
  { width: 800, picture: 'wndTaskBar800.bmp', applets: 5, ...CONTROLS_800 },
  { width: 1024, picture: 'wndTaskBar1024.bmp', applets: 10, ...CONTROLS_1024 },
  { width: 1280, picture: 'wndTaskBar1280.bmp', applets: MAX_SLOT_APPLET, ...CONTROLS_1280 },
  { width: 1360, picture: 'WndTaskBar1360Wide.bmp', applets: MAX_SLOT_APPLET, ...CONTROLS_1280 },
  { width: 1400, picture: 'WndTaskBar1400.bmp', applets: MAX_SLOT_APPLET, ...CONTROLS_1280 },
  { width: 1440, picture: 'WndTaskBar1440Wide.bmp', applets: MAX_SLOT_APPLET, ...CONTROLS_1280 },
  { width: 1600, picture: 'WndTaskBar1600.bmp', applets: MAX_SLOT_APPLET, ...CONTROLS_1280 },
  { width: 1680, picture: 'WndTaskBar1680Wide.bmp', applets: MAX_SLOT_APPLET, ...CONTROLS_1280 },
] as const;

/**
 * The task bar window for a screen `width` CSS px wide: Neuz has one per resolution it offers (`CWndTaskBar::Initialize`,
 * `WndTaskBar.cpp:1264-1306`), with 5, 10 or 18 applet slots; the browser takes the widest one that fits, and the 800 one
 * drawn smaller on a narrower screen. A width of 0 (not laid out yet) is the 800 one as it is.
 */
export function taskBarLayout(width: number): TaskBarLayout {
  let chosen: (typeof WINDOWS_BY_WIDTH)[number] = WINDOWS_BY_WIDTH[0];
  for (const window of WINDOWS_BY_WIDTH) if (window.width <= width) chosen = window;
  const scale = width > 0 && width < chosen.width ? width / chosen.width : 1;
  return { ...chosen, scale };
}

/**
 * How much of the action slot the action points light, after its first slot (`CWndTaskBar::OnDraw`,
 * `WndTaskBar.cpp:1042-1060`, `nAP2Size`, in int arithmetic): `SKILL_SIZE` (28 px) for each of `LV2MAXAP` 10, `LV3MAXAP` 25,
 * `LV4MAXAP` 50 and `LV5MAXAP` 100, and the part of the next step between. The rest of the four slots after the first is
 * shaded; the server keeps the points at 100 or under (`CMover::ProcessActionPoint`).
 */
export function actionPointLit(actionPoint: number): number {
  const [lv2, lv3, lv4, lv5] = AP_STEPS;
  if (actionPoint >= lv4) return SKILL_SIZE * 3 + Math.trunc(((actionPoint - lv4) * SKILL_SIZE) / (lv5 - lv4));
  if (actionPoint >= lv3) return SKILL_SIZE * 2 + Math.trunc(((actionPoint - lv3) * SKILL_SIZE) / (lv4 - lv3));
  if (actionPoint >= lv2) return SKILL_SIZE + Math.trunc(((actionPoint - lv2) * SKILL_SIZE) / (lv3 - lv2));
  return Math.trunc((actionPoint * SKILL_SIZE) / lv2);
}

/**
 * What a slot shows: its kind ('' for an empty one), greyed or not, its icon (an asset key), its count and hotkey, and its
 * name (for a screen reader: what `PutTooTip` would say first; '' for none).
 */
interface SlotView {
  kind: '' | 'item' | 'skill' | 'applet' | 'plain';
  greyed: boolean;
  icon: string | null;
  count: string;
  hotkey: string;
  name: string;
}

const EMPTY_VIEW: SlotView = { kind: '', greyed: false, icon: null, count: '', hotkey: '', name: '' };
/** A shortcut Piece 4 has nothing to draw with: a plain greyed slot. */
const PLAIN_VIEW: SlotView = { kind: 'plain', greyed: true, icon: null, count: '', hotkey: '', name: '' };

/** A slot on screen, and the view it shows (as a string, to redraw it only when it changes). */
interface SlotElement {
  element: HTMLButtonElement;
  icon: HTMLElement;
  count: HTMLElement;
  hotkey: HTMLElement;
  shown: string | null;
}

/** An empty shortcut (`InitTaskBar`'s `memset`, `WndTaskBar.cpp:530-532`). */
const EMPTY: Shortcut = { kind: ShortcutKind.NONE, id: 0, type: 0, index: 0, userId: 0, data: 0, text: '' };

/** `m_dwData` of a shortcut: where it is, the applet row 0, an item bar 1, the action slot 2 (`SetShortcut`, `SetSkillQueue`). */
const WHERE_ITEM = 1;
const WHERE_QUEUE = 2;

/**
 * The bars as `CWndTaskBar::Serialize` loads them (`WndTaskBar.cpp:315-400`) and the edits change them: the applet row, the
 * 8 bars of 9 slots and the action slot's 5 slots (`m_aSlotQueue`) with `m_nCurQueueNum` (`queueCount`), each stackable
 * item's shortcut with `m_dwItemId` (`itemIds`, by the same place).
 */
interface LoadedBars {
  applets: Shortcut[];
  items: Shortcut[][];
  queue: Shortcut[];
  queueCount: number;
  itemIds: Map<Shortcut[], Array<number | null>>;
}

/** A press on a slot that may become a drag: what it carries, the pointer and where it went down; `ghost` once dragged. */
interface Drag {
  carried: Carried;
  pointerId: number;
  x: number;
  y: number;
  ghost: HTMLElement | null;
}

/** `dwPackMax > 1`: the item stacks (`WndTaskBar.cpp:352`, :375, :836, :946). An item the catalog lacks does not. */
function stacks(itemId: number, data: Pick<TaskBarData, 'itemProps'>): boolean {
  return (data.itemProps.get(itemId)?.packMax ?? 1) > 1;
}

/** Whether the key comes from a field being typed in, which the game's keys leave alone. */
function typing(target: EventTarget | null): boolean {
  const tag = (target as { tagName?: string } | null)?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA';
}

/** A finger's press (or a pen's): jsdom's mouse events under the pointer events' names carry no `pointerType`, a mouse's. */
const byFinger = (event: Event): boolean => {
  const type = (event as { pointerType?: string }).pointerType;
  return type === 'touch' || type === 'pen';
};

/**
 * The task bar. Its `element` goes in the windows' layer, at whose bottom it lays the bar out for the layer's width
 * (`taskBarLayout`, again when the window is resized); it sets the layer's `--hud-taskbar-height` to the bar's height on
 * screen and keeps the windows above it (`setLayoutBottom`); the Start menu opens above the bar's left end, over the
 * windows. `update` draws the own character's bars each frame (redrawing only what changed). It reads the keys of the
 * window it is in until `dispose`: F1-F9 (with F5's reload, and the browser's other uses of them, prevented), 1-8, the
 * hotkeys of the applets of Piece 4's windows (H, K) and C. Escape is its owner's (`escapeStep`). Its buttons take no
 * focus: Space and Enter never press one again.
 *
 * The bars it edits are the own character's: each edit puts them back in `OwnState.taskBar` (which the skill use and the
 * owner read), as Neuz's `CWndTaskBar` keeps its own and the server sends none back, and sends what changed.
 */
export class TaskBar {
  /** Holds the bar (`.hud-taskbar-strip`), the Start menu and the long press's line; takes no press itself. */
  readonly element: HTMLElement;
  /** The Start menu (`CWndTaskMenu`). */
  readonly menu: TaskMenu;
  /** Called as the Start menu opens (true) or closes (false). */
  onMenuChange?: (open: boolean) => void;
  private readonly strip: HTMLElement;
  private readonly doc: Document;
  private readonly view: Window;
  private readonly start: HTMLButtonElement;
  private readonly up: HTMLButtonElement;
  private readonly down: HTMLButtonElement;
  private readonly number: HTMLElement;
  private readonly action: HTMLButtonElement;
  private readonly shade: HTMLElement;
  /** The rows a carried shortcut may go to, lit (`OnDraw`, :769-819). */
  private readonly litItem: HTMLElement;
  private readonly litQueue: HTMLElement;
  /** The long press's line over a slot, and the slot it is about. */
  private readonly slotMenu: HTMLElement;
  private readonly removeLine: HTMLButtonElement;
  private menuFor: { row: 'item' | 'queue'; slot: number } | null = null;
  private appletSlots: SlotElement[] = [];
  private itemSlots: SlotElement[] = [];
  private queueSlots: SlotElement[] = [];
  /** `m_nSlotIndex`: the bar shown, 0 to 7; 0 on every entry (`CWndTaskBar::CWndTaskBar`, :506). */
  private slotIndex = 0;
  /** The TASKBAR message the bars were loaded from (or the bars as the last edit put them back), and the bars. */
  private loadedFrom: TaskBarMessage | null = null;
  private loaded: LoadedBars = TaskBar.load(null, null, { itemProps: new Map() });
  /** The own numbers and the catalogs of the last `update`, which the edits read. */
  private own: OwnState | undefined;
  private data: TaskBarData = { itemProps: new Map() };
  private layout: TaskBarLayout = taskBarLayout(0);
  /** The window was resized (or the bar not yet laid out in a layer with a width): `update` lays it out again. */
  private dirty = true;
  /** The touch rule (`watchTouch`): the Start menu is drawn for a finger on a touch screen, from a first touch on. */
  private readonly touch: TouchWatch;
  /** A press on a slot or a skill that may become a drag, or the drag (`m_GlobalShortcut` with a mouse). */
  private drag: Drag | null = null;
  /** The skill a finger picked in the skill window, which the next slot tapped takes. */
  private picked: number | null = null;
  /** The click that ends a slot's drag back onto itself, or its long press, is not a press on the slot. */
  private swallowClick = false;
  /** A finger held on a slot, until `LONG_PRESS_MS`. */
  private hold: { timer: ReturnType<typeof setTimeout>; pointerId: number; x: number; y: number } | null = null;
  /** The rows lit, as a string, to touch the DOM only when it changes. */
  private litShown = '';

  constructor(
    private readonly art: UiArt,
    private readonly actions: TaskBarActions,
    doc: Document = document,
  ) {
    this.doc = doc;
    this.view = doc.defaultView ?? window;
    const element = doc.createElement('div');
    element.className = 'hud-taskbar';
    this.element = element;
    const strip = doc.createElement('div');
    strip.className = 'hud-taskbar-strip';
    strip.style.height = `${TASKBAR_HEIGHT}px`;
    this.strip = strip;

    this.start = this.button('hud-taskbar-start', () => this.menu.toggle());
    this.start.setAttribute('aria-label', START_LABEL);
    this.start.setAttribute('aria-haspopup', 'menu');
    this.start.setAttribute('aria-expanded', 'false');
    this.place(this.start, START.left, START.top, START.width, START.height);
    this.start.style.backgroundImage = themeUrl(art, 'ButtStart.bmp');

    this.up = this.button('hud-taskbar-up', () => this.setBar((this.slotIndex + MAX_SLOT_ITEM_COUNT - 1) % MAX_SLOT_ITEM_COUNT));
    this.up.style.backgroundImage = themeUrl(art, 'ButtQuickListUp.tga');
    this.down = this.button('hud-taskbar-down', () => this.setBar((this.slotIndex + 1) % MAX_SLOT_ITEM_COUNT));
    this.down.style.backgroundImage = themeUrl(art, 'ButtQuickListDn.tga');
    this.number = doc.createElement('span');
    this.number.className = 'hud-taskbar-number';

    // the action slot's button (SHORTCUT_SKILLFUN, `m_pTexture`, :1196): ObjectExecutor calls CWndWorld::UseSkill
    this.action = this.button('hud-taskbar-action', () => this.actions.useActionSlot());
    this.action.style.backgroundImage = themeUrl(art, 'icon_ActionSkill.dds');
    this.shade = doc.createElement('div');
    this.shade.className = 'hud-taskbar-ap';
    this.litItem = doc.createElement('div');
    this.litQueue = doc.createElement('div');
    for (const [lit, row] of [[this.litItem, 'item'], [this.litQueue, 'queue']] as const) {
      lit.className = 'hud-taskbar-lit';
      lit.dataset.row = row;
      lit.hidden = true;
    }

    const lines = MENU.map(({ id, text }) => ({ id, text, enabled: id === AppId.LOGOUT || WINDOWS.has(id) }));
    this.menu = new TaskMenu(art, lines, (id) => this.execute(id), () => this.start, doc);
    this.menu.onChange = (open) => {
      this.start.setAttribute('aria-expanded', String(open));
      this.onMenuChange?.(open);
    };

    this.slotMenu = doc.createElement('div');
    this.slotMenu.className = 'hud-slot-menu';
    this.slotMenu.setAttribute('role', 'menu');
    this.slotMenu.hidden = true;
    this.removeLine = doc.createElement('button');
    this.removeLine.type = 'button';
    this.removeLine.className = 'hud-slot-menu-line';
    this.removeLine.setAttribute('role', 'menuitem');
    this.removeLine.tabIndex = -1;
    this.removeLine.addEventListener('mousedown', (event) => event.preventDefault());
    this.removeLine.addEventListener('click', () => {
      const at = this.menuFor;
      this.closeSlotMenu();
      if (at !== null) this.removeAt(at.row, at.slot);
    });
    this.slotMenu.append(this.removeLine);

    strip.append(this.start, this.up, this.down, this.number, this.action);
    // a new press on the bar: a click left over from a drag or a long press that made none is no longer awaited
    strip.addEventListener('pointerdown', () => {
      this.swallowClick = false;
    }, true);
    // the menus beside the bar, not in it: a bar drawn smaller is a layer of its own, which would keep them under the
    // windows
    element.append(strip, this.menu.element, this.slotMenu);

    this.view.addEventListener('keydown', this.onKeyDown);
    this.view.addEventListener('keyup', this.onKeyUp);
    this.view.addEventListener('resize', this.onResize);
    this.touch = watchTouch(this.view, () => {
      this.dirty = true;
    });
  }

  /** `m_nSlotIndex`: the bar shown (0 to 7), whose slots F1-F9 use; keys 1-8 and the arrows switch it. */
  get bar(): number {
    return this.slotIndex;
  }

  /** `SetItemSlot` (`WndTaskBar.cpp:1339-1343`): shows bar `bar` (0 to 7); any other number is ignored. */
  setBar(bar: number): void {
    if (!Number.isInteger(bar) || bar < 0 || bar >= MAX_SLOT_ITEM_COUNT || bar === this.slotIndex) return;
    this.slotIndex = bar;
    for (const slot of this.itemSlots) slot.shown = null;
  }

  /** Whether the Start menu is open. */
  get menuOpen(): boolean {
    return this.menu.isOpen;
  }

  /** Opens the Start menu (`OpenMenu`: Escape with nothing else to do, `WndManager.cpp:3421-3427`). */
  openMenu(): void {
    this.menu.open();
  }

  /** Closes the Start menu. */
  closeMenu(): void {
    this.menu.close();
  }

  /**
   * `!m_GlobalShortcut.IsEmpty()`: a shortcut is being dragged, or a finger has picked a skill. Meanwhile the bar reads
   * none of its hotkeys but the digits (`Process`, :2331-2338), and Escape closes no window (`CWndMgr::Process`, :3383).
   */
  get carrying(): boolean {
    return this.picked !== null || this.dragged !== null;
  }

  /** What a drag carries once the mouse has moved (its picture at the pointer), or null. */
  private get dragged(): Carried | null {
    return this.drag !== null && this.drag.ghost !== null ? this.drag.carried : null;
  }

  /** The skill (its slot of `m_aJobSkill`) a finger picked in the skill window, or null. */
  get pickedSkill(): number | null {
    return this.picked;
  }

  /**
   * A skill of the skill window carried to the bar: with the mouse (`event`, the press on the skill), a drag that begins
   * once the mouse moves (`CWndSkillTreeEx::OnMouseMove`) and ends where the button is let go; with a finger (no `event`),
   * the skill is picked, and the next slot of the bar tapped takes it (picked again, it is let go).
   */
  carrySkill(skillIndex: number, event?: PointerEvent): void {
    if (event !== undefined) {
      this.press({ from: 'skills', skillIndex }, event);
      return;
    }
    this.picked = this.picked === skillIndex ? null : skillIndex;
    this.drawLit();
  }

  /** Lets go of the skill a finger picked (the skill window closed). */
  dropPick(): void {
    if (this.picked === null) return;
    this.picked = null;
    this.drawLit();
  }

  /**
   * The skill window's double click on skill slot `skillIndex` (`CWndSkillTreeEx::OnLButtonDblClk`, `WndField.cpp:8318-8393`):
   * `SetSkillQueue( m_nCurQueueNum, 0, i )`, the skill after the last one of the action slot, unless the chain runs.
   */
  queueSkill(skillIndex: number): void {
    this.setSkillQueue(this.loaded.queueCount, skillIndex, this.skillOf(skillIndex)?.name ?? '');
  }

  /**
   * Draws the own character's bars: the TASKBAR it last had (`OwnState.taskBar`; the bars are loaded anew when a new one
   * comes), with its inventory and skills and `data`'s catalogs. Before any TASKBAR, or with no own numbers (`own`
   * undefined), the bars are empty (`InitTaskBar`), and the rest of the bar is drawn all the same.
   */
  update(own: OwnState | undefined, data: TaskBarData): void {
    this.own = own;
    this.data = data;
    if (this.dirty) this.relayout();
    const message = own?.taskBar ?? null;
    if (message !== this.loadedFrom) {
      this.loadedFrom = message;
      this.loaded = TaskBar.load(own ?? null, message, data);
    }
    const { applets, items, queue, queueCount } = this.loaded;
    const view = (row: Shortcut[], i: number): SlotView => (own === undefined ? EMPTY_VIEW : this.slotView(row, i, own, data));
    this.appletSlots.forEach((slot, i) => this.draw(slot, view(applets, i)));
    const bar = items[this.slotIndex]!;
    this.itemSlots.forEach((slot, i) => this.draw(slot, view(bar, i)));
    // m_nCurQueueNum slots of the action slot (:1017-1032)
    this.queueSlots.forEach((slot, i) => this.draw(slot, i < queueCount ? view(queue, i) : EMPTY_VIEW));
    const number = String(this.slotIndex + 1);
    if (this.number.textContent !== number) this.number.textContent = number;
    this.drawActionPoints(message?.actionPoint ?? 0);
    // the action slot's button is called what its tooltip says (`PutTooTip`'s SHORTCUT_SKILLFUN, :678-682)
    const actionName = data.texts?.get('TID_GAME_SKILLSHORTCUT')?.text ?? '';
    if (actionName !== '' && this.action.getAttribute('aria-label') !== actionName) {
      this.action.setAttribute('aria-label', actionName);
    }
    const remove = data.texts?.get(REMOVE_TEXT)?.text ?? '';
    if (this.removeLine.textContent !== remove) this.removeLine.textContent = remove;
    this.drawLit();
  }

  /** Takes the bar off and lets go of the keys. */
  dispose(): void {
    this.menu.dispose();
    this.endDrag();
    this.cancelHold();
    this.closeSlotMenu();
    this.view.removeEventListener('keydown', this.onKeyDown);
    this.view.removeEventListener('keyup', this.onKeyUp);
    this.view.removeEventListener('resize', this.onResize);
    this.touch.dispose();
    this.element.remove();
  }

  /**
   * `CWndTaskBar::Serialize`'s loading (`WndTaskBar.cpp:315-400`) of `message` (none: `InitTaskBar`'s empty bars):
   * - an applet-row skill that is not `CT_STEP` or `CT_GENERAL` (`isBarStyle`), or whose skill the catalog lacks, is
   *   emptied (:330-343); this needs the skills catalog, and without it (milestone 1) the skill stays, drawn plain; a party
   *   skill (`m_dwType` 2) has no row there and stays;
   * - an item shortcut whose object is a stackable item (`dwPackMax > 1`) keeps that item's ID, `m_dwItemId` (:345-357,
   *   :368-380), which finds another stack of it when the object goes (`itemView`);
   * - the action slot holds the queue's entries, `m_nCurQueueNum` of them (:399).
   * The entries are applied in order, a later one for the same slot replacing the first.
   */
  private static load(own: OwnState | null, message: TaskBarMessage | null, data: Omit<TaskBarData, 'texts'>): LoadedBars {
    const applets = Array.from({ length: MAX_SLOT_APPLET }, () => EMPTY);
    const items = Array.from({ length: MAX_SLOT_ITEM_COUNT }, () => Array.from({ length: MAX_SLOT_ITEM }, () => EMPTY));
    const itemIds = new Map<Shortcut[], Array<number | null>>();
    const bars: LoadedBars = { applets, items, queue: [], queueCount: 0, itemIds };
    for (const { slot, shortcut } of message?.applets ?? []) {
      applets[slot] = TaskBar.appletRowSkillKept(own, shortcut, data) ? shortcut : EMPTY;
      TaskBar.remember(bars, own, data, applets, slot, shortcut);
    }
    for (const { bar, slot, shortcut } of message?.items ?? []) {
      items[bar]![slot] = shortcut;
      TaskBar.remember(bars, own, data, items[bar]!, slot, shortcut);
    }
    const queue = (message?.queue ?? []).slice(0, MAX_SLOT_QUEUE);
    bars.queueCount = queue.length;
    bars.queue = [...queue, ...Array.from({ length: MAX_SLOT_QUEUE - queue.length }, () => EMPTY)];
    return bars;
  }

  /** `m_dwItemId` of a stackable item's shortcut in slot `i` of `row` (:347-357, :1648-1653); any other shortcut keeps none. */
  private static remember(
    bars: LoadedBars, own: OwnState | null | undefined, data: Pick<TaskBarData, 'itemProps'>, row: Shortcut[], i: number,
    shortcut: Shortcut,
  ): void {
    const ids = bars.itemIds.get(row);
    if (ids !== undefined) ids[i] = null;
    if (shortcut.kind !== ShortcutKind.ITEM) return;
    const item = own?.inventory?.get(shortcut.id);
    if (item === undefined || !stacks(item.itemId, data)) return;
    if (!bars.itemIds.has(row)) bars.itemIds.set(row, []);
    bars.itemIds.get(row)![i] = item.itemId;
  }

  /** `:330-343`: a skill of the applet row stays only as a `CT_STEP` or `CT_GENERAL` one (see `load`). */
  private static appletRowSkillKept(own: OwnState | null, shortcut: Shortcut, data: Pick<TaskBarData, 'skills'>): boolean {
    if (shortcut.kind !== ShortcutKind.SKILL || shortcut.type === 2 || data.skills === undefined) return true;
    const skillId = own?.skills[shortcut.id]?.skill;
    const prop = skillId === undefined ? undefined : data.skills.get(skillId);
    return prop !== undefined && isBarStyle(prop);
  }

  /**
   * What slot `i` of `row` shows (`SetTaskBarTexture`, `WndTaskBar.cpp:403-476`, and `OnDraw`, :821-1009), and what it is
   * called (`PutTooTip`, :547-684):
   * - an applet: its icon (none for an id the live build does not register, as `GetAppletFunc` finds nothing), and its
   *   hotkey over it (:889-896); called its description (`m_pAppletDesc`);
   * - an item: see `itemView`;
   * - a skill: its icon and name from the skills catalog (milestone 2), a plain greyed slot without it;
   * - anything else (motions, chat lines ...): a plain greyed slot.
   */
  private slotView(row: Shortcut[], i: number, own: OwnState, data: TaskBarData): SlotView {
    const shortcut = row[i]!;
    switch (shortcut.kind) {
      case ShortcutKind.NONE:
        return EMPTY_VIEW;
      case ShortcutKind.APPLET: {
        const found = APPLETS.get(shortcut.id);
        return {
          kind: 'applet', greyed: false, icon: found?.icon ? themeKey(found.icon) : null, count: '', hotkey: found?.hotkey ?? '',
          name: found === undefined ? '' : appletText(found.desc, data.texts ?? new Map()),
        };
      }
      case ShortcutKind.ITEM:
        return this.itemView(row, i, own, data);
      case ShortcutKind.SKILL: {
        const skillId = shortcut.type === 2 ? undefined : own.skills[shortcut.id]?.skill;
        const skill = skillId === undefined ? undefined : data.skills?.get(skillId);
        if (skill === undefined || skill.icon === null) return PLAIN_VIEW;
        return { kind: 'skill', greyed: false, icon: skill.icon, count: '', hotkey: '', name: skill.name };
      }
      default:
        return PLAIN_VIEW;
    }
  }

  /**
   * An item shortcut's view: its icon, greyed until items are used (Piece 5), called the item's name (`PutToolTip_Item`),
   * and for a stackable item (`dwPackMax > 1`) `m_Inventory.GetItemCount( m_dwItemId )`, every stack of it (:836-847,
   * :946-957, `Item.h:378-389`). An object that is gone takes the first other stack of the stackable item it was loaded
   * with (`m_Inventory.Find`, :859-881 and `UpdateItem`, :1114-1138); a slot with no such stack, or that held a
   * non-stackable item, empties. Neuz tells the server either way, which comes with Piece 5's items. With no inventory (it
   * could not be read) an item is a plain greyed slot.
   */
  private itemView(row: Shortcut[], i: number, own: OwnState, data: TaskBarData): SlotView {
    const inventory = own.inventory;
    if (inventory === null) return PLAIN_VIEW;
    let item: InventoryItem | undefined = inventory.get(row[i]!.id);
    if (item === undefined) {
      const itemId = this.loaded.itemIds.get(row)?.[i] ?? null;
      item = itemId === null ? undefined : [...inventory.values()].find((other) => other.itemId === itemId);
      row[i] = item === undefined ? EMPTY : { ...row[i]!, id: item.objectId };
      if (item === undefined) return EMPTY_VIEW;
    }
    const itemId = item.itemId;
    const prop = data.itemProps.get(itemId);
    let count = '';
    if (stacks(itemId, data)) {
      let total = 0;
      for (const other of inventory.values()) if (other.itemId === itemId) total += other.count;
      count = String(total);
    }
    return { kind: 'item', greyed: true, icon: prop?.icon ?? null, count, hotkey: '', name: prop?.name ?? '' };
  }

  /** Puts `view` in `slot`, if it is not what it shows. */
  private draw(slot: SlotElement, view: SlotView): void {
    const shown = `${view.kind}|${view.greyed}|${view.icon ?? ''}|${view.count}|${view.hotkey}|${view.name}`;
    if (slot.shown === shown) return;
    slot.shown = shown;
    if (view.kind === '') delete slot.element.dataset.kind;
    else slot.element.dataset.kind = view.kind;
    slot.element.toggleAttribute('data-greyed', view.greyed);
    if (view.name === '') slot.element.removeAttribute('aria-label');
    else slot.element.setAttribute('aria-label', view.name);
    slot.icon.style.backgroundImage = view.icon === null ? '' : `url(${JSON.stringify(this.art.url(view.icon))})`;
    slot.count.textContent = view.count;
    slot.hotkey.textContent = view.hotkey;
  }

  /**
   * The action points over the action slot (`OnDraw`, `WndTaskBar.cpp:1035-1060`): from its second slot on, what
   * `actionPointLit` leaves unlit is shaded with `ARGB( 0x7f, 0, 0, 0 )`, `SKILL_SIZE + 2` px high.
   */
  private drawActionPoints(actionPoint: number): void {
    const lit = actionPointLit(actionPoint);
    const width = `${Math.max(0, SKILL_SIZE * 4 - lit)}px`;
    const left = `${this.layout.queueX + SKILL_SIZE + lit}px`;
    if (this.shade.style.width !== width) this.shade.style.width = width;
    if (this.shade.style.left !== left) this.shade.style.left = left;
  }

  /**
   * The rows the shortcut carried may go to, lit (`OnDraw`, :769-819, `D3DCOLOR_ARGB( m_dwHighAlpha..., 0, 0, 255 )`, the
   * style sheet's pulse): for a job skill (type 0) the action slot, and the item row when it is a `CT_STEP` or `CT_GENERAL`
   * one; for a party skill the item row; for an applet, item or motion the item row (and the applet row, which the browser
   * does not edit). Nothing else lights a row.
   */
  private drawLit(): void {
    const picked: Carried | null = this.picked === null ? null : { from: 'skills', skillIndex: this.picked };
    const carried = this.dragged ?? picked;
    const shortcut = carried === null ? null : this.carriedShortcut(carried);
    let item = false;
    let queue = false;
    if (shortcut !== null) {
      if (shortcut.kind === ShortcutKind.SKILL && shortcut.type === 0) {
        const skill = this.skillOf(shortcut.id);
        item = skill !== undefined && isBarStyle(skill);
        queue = true;
      } else {
        item = shortcut.kind === ShortcutKind.SKILL || shortcut.kind === ShortcutKind.APPLET || shortcut.kind === ShortcutKind.ITEM ||
          shortcut.kind === ShortcutKind.MOTION;
      }
    }
    const shown = `${item}|${queue}`;
    if (shown === this.litShown) return;
    this.litShown = shown;
    this.litItem.hidden = !item;
    this.litQueue.hidden = !queue;
  }

  /**
   * Lays the bar out for its layer's width (`taskBarLayout`): its picture, its controls, its slots; the layout of the
   * windows ends above it (`setLayoutBottom`, `WndTaskBar.cpp:1176-1178`); and the Start menu stands above its left end,
   * at its own scale, not the bar's (it is 192 px wide: a narrow screen, which draws the bar smaller, leaves it room). With
   * a mouse that is 1, and on a touch screen up to `TOUCH_MENU_SCALE` (its lines a finger's); either is smaller where
   * the room above the bar is too short for the menu (`TaskMenu.height`).
   */
  private relayout(): void {
    const parent = this.element.parentElement;
    const width = parent?.clientWidth ?? 0;
    // a layer not laid out yet is tried again at the next update
    this.dirty = width === 0;
    const layout = taskBarLayout(width);
    this.layout = layout;
    const strip = this.strip;
    const height = TASKBAR_HEIGHT * layout.scale;
    strip.style.width = `${layout.width}px`;
    strip.style.backgroundImage = themeUrl(this.art, layout.picture);
    strip.style.transform = layout.scale === 1 ? '' : `scale(${layout.scale})`;
    strip.dataset.layout = String(layout.width);
    const room = (parent?.clientHeight ?? 0) - height;
    const most = this.touch() ? TOUCH_MENU_SCALE : 1;
    this.menu.place(room > 0 ? Math.min(most, room / this.menu.height) : layout.scale, height);
    if (parent !== null) {
      parent.style.setProperty('--hud-taskbar-height', `${height}px`);
      setLayoutBottom(parent, height);
    }
    this.closeSlotMenu();

    this.placeRect(this.up, layout.up);
    this.placeRect(this.down, layout.down);
    // the bar's number at the up arrow's left, 2 px over its bottom (:1085-1088)
    this.number.style.left = `${layout.up.left}px`;
    this.number.style.top = `${layout.up.bottom - 2}px`;
    // the action slot's button left of it, 5 px apart (:1011-1012)
    this.place(this.action, layout.queueX - ICON_SIZE - 5, SLOT_TOP, ICON_SIZE, ICON_SIZE);
    this.shade.style.top = `${SLOT_TOP}px`;
    this.shade.style.height = `${SKILL_SIZE + 2}px`;
    this.place(this.litItem, layout.itemX - 6, LIT.top, ITEM_ROW_WIDTH + 12, LIT.height);
    this.place(this.litQueue, layout.queueX - 3, LIT.top, QUEUE_ROW_WIDTH + 7, LIT.height);

    for (const slot of [...this.appletSlots, ...this.itemSlots, ...this.queueSlots]) slot.element.remove();
    this.appletSlots = this.makeSlots('applet', layout.applets, layout.appletX, ICON_SIZE, (i) => this.pressApplet(i));
    this.itemSlots = this.makeSlots('item', MAX_SLOT_ITEM, layout.itemX, ICON_SIZE, (i) => this.pressItemSlot(i));
    this.queueSlots = this.makeSlots('queue', MAX_SLOT_QUEUE, layout.queueX, SKILL_SIZE, (i) => this.pressQueueSlot(i));
    for (const [row, slots] of [['item', this.itemSlots], ['queue', this.queueSlots]] as const) {
      slots.forEach((slot, i) => this.editable(slot.element, row, i));
    }
    // the lit rows, then the shade over the action slot
    strip.append(...[...this.appletSlots, ...this.itemSlots, ...this.queueSlots].map((slot) => slot.element), this.litItem,
      this.litQueue, this.shade);
  }

  /** `count` slots of `size` px from `left`, `size` apart, at the rows' top. */
  private makeSlots(row: string, count: number, left: number, size: number, press: (i: number) => void): SlotElement[] {
    return Array.from({ length: count }, (_, i) => {
      const element = this.button('hud-slot', () => {
        if (this.swallowClick) {
          this.swallowClick = false;
          return;
        }
        press(i);
      });
      element.dataset.row = row;
      element.dataset.slot = String(i);
      this.place(element, left + i * size, SLOT_TOP, size, size);
      const icon = this.doc.createElement('span');
      icon.className = 'hud-slot-icon';
      const count = this.doc.createElement('span');
      count.className = 'hud-slot-count';
      const hotkey = this.doc.createElement('span');
      hotkey.className = 'hud-slot-hotkey';
      hotkey.setAttribute('aria-hidden', 'true');
      element.append(icon, count, hotkey);
      return { element, icon, count, hotkey, shown: null };
    });
  }

  /**
   * The edits' presses on slot `i` of the item row or the action slot: the mouse's button down, which a move makes a drag
   * of its shortcut (`OnLButtonDown`, `OnMouseMove`, :2143-2176); a finger held on it, which offers to take the shortcut
   * off; a right click, which takes it off (`OnRButtonUp`, :1473-1512; a finger's long press makes a `contextmenu` too,
   * which is the long press's).
   */
  private editable(element: HTMLElement, row: 'item' | 'queue', i: number): void {
    element.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || this.shortcutAt(row, i) === null) return;
      if (byFinger(event)) this.startHold(event, row, i);
      else this.press(row === 'item' ? { from: 'item', bar: this.slotIndex, slot: i } : { from: 'queue', slot: i }, event);
    });
    element.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      if (byFinger(event) || this.hold !== null || this.menuFor !== null) return;
      this.rightClick(row, i);
    });
  }

  /** The shortcut in slot `i` of `row` of the bar shown, or null for an empty one. */
  private shortcutAt(row: 'item' | 'queue', i: number): Shortcut | null {
    const { items, queue, queueCount } = this.loaded;
    const shortcut = row === 'item' ? items[this.slotIndex]![i]! : i < queueCount ? queue[i]! : EMPTY;
    return shortcut.kind === ShortcutKind.NONE ? null : shortcut;
  }

  /**
   * `ObjectExecutor( SHORTCUT_APPLET, id )` (`WndManager.cpp:2566-2700`) for Piece 4: an applet of its windows opens (or
   * closes) it, `APP_LOGOUT` asks the owner to log out (`CWndLogOut`, :2610-2621), and the others do nothing.
   */
  private execute(id: number): void {
    const window = WINDOWS.get(id);
    if (window !== undefined) this.actions.open(window);
    else if (id === AppId.LOGOUT) this.actions.logOut();
  }

  /**
   * A press on applet slot `i` (`OnLButtonUp`'s `ObjectExecutor`, :2178-2188): an applet runs, an empty slot is nothing, and
   * any other shortcut is the owner's (a skill of the applet row is used as a bar's is).
   */
  private pressApplet(i: number): void {
    const shortcut = this.loaded.applets[i]!;
    if (shortcut.kind === ShortcutKind.APPLET) this.execute(shortcut.id);
    else if (shortcut.kind !== ShortcutKind.NONE) this.actions.useAppletSlot(i, shortcut);
  }

  /** A press on slot `i` of the bar shown: with a skill picked by a finger, the skill goes there; else it is used. */
  private pressItemSlot(i: number): void {
    if (this.placePicked({ row: 'item', slot: i })) return;
    this.useItemSlot(i);
  }

  /** A press on slot `i` of the action slot: only a picked skill goes there; a slot of it is not used (`m_dwData != 2`, :2183). */
  private pressQueueSlot(i: number): void {
    this.placePicked({ row: 'queue', slot: i });
  }

  /** The skill a finger picked goes to `target`, as a drop there would take it, and is let go whatever came of it. */
  private placePicked(target: DropTarget): boolean {
    const picked = this.picked;
    if (picked === null) return false;
    this.picked = null;
    this.dropOn({ from: 'skills', skillIndex: picked }, target);
    this.drawLit();
    return true;
  }

  /**
   * Slot `i` of the bar shown, pressed or by its F-key (`ObjectExecutor( lpShortcut )`, :2409-2427): an applet runs, an empty
   * slot is nothing, and the rest is the owner's (`useSlot`), with the shortcut the slot holds.
   */
  private useItemSlot(i: number): void {
    const shortcut = this.loaded.items[this.slotIndex]![i]!;
    if (shortcut.kind === ShortcutKind.NONE) return;
    if (shortcut.kind === ShortcutKind.APPLET) this.execute(shortcut.id);
    else this.actions.useSlot(this.slotIndex, i, shortcut);
  }

  // ---- the edits ---------------------------------------------------------------------------------------------------

  /** The catalog's skill in skill slot `skillIndex` of the own character (`GetSkill( 0, dwId )->GetProp()`), or undefined. */
  private skillOf(skillIndex: number): WebSkill | undefined {
    const slot = this.own?.skills[skillIndex];
    return slot === undefined ? undefined : this.data.skills?.get(slot.skill);
  }

  /** The shortcut `carried` stands for: a job skill of the skill window, as `OnMouseMove` makes it, or the slot's. */
  private carriedShortcut(carried: Carried): Shortcut | null {
    if (carried.from === 'skills') {
      // m_dwShortcut SHORTCUT_SKILL, m_dwType 0, m_dwId the slot, m_dwIndex the skill, m_dwData 0, m_szString its name
      const slot = this.own?.skills[carried.skillIndex];
      return {
        kind: ShortcutKind.SKILL, id: carried.skillIndex, type: 0, index: slot?.skill ?? 0, userId: 0, data: 0,
        text: this.skillOf(carried.skillIndex)?.name ?? '',
      };
    }
    if (carried.from === 'item') {
      const shortcut = this.loaded.items[carried.bar]![carried.slot]!;
      return shortcut.kind === ShortcutKind.NONE ? null : shortcut;
    }
    return carried.slot < this.loaded.queueCount && this.loaded.queue[carried.slot]!.kind !== ShortcutKind.NONE
      ? this.loaded.queue[carried.slot]!
      : null;
  }

  /**
   * `CMover::CheckSkill( dwSkill )` (`MoverParam.cpp:117-156`) of the own character: the skill of the catalog with ID
   * `skillId` is open at the character's level and the player's own levels of its prerequisites (`GetSkill( dwSkill )`, the
   * first slot with it). A skill the catalog lacks is not (`pSkillProp == NULL`).
   */
  private playerHasSkillOpen(skillId: number): boolean {
    const own = this.own;
    const skill = this.data.skills?.get(skillId);
    if (own === undefined || skill === undefined) return false;
    return checkSkill(skill, own.level, (id) => own.skills.find((slot) => slot.skill === id)?.level);
  }

  /**
   * `CWndTaskBar::OnDropIcon( pShortcut, point )` (`WndTaskBar.cpp:1874-2093`): `carried` let go on `target`.
   * - From the bar, off it (`!GetClientRect().PtInRect( point )`, the bar holding the mouse since the press): the shortcut
   *   comes off its slot (REMOVEITEMTASKBAR, or `RemoveSkillQueue`).
   * - A job skill of level 0, or one that `CMover::CheckSkill` turns away on the player's own levels (:1920-1928), goes
   *   nowhere; nor a shortcut with `m_dwId` 0 and no text (:1934-1938: Neuz's empty shortcut, which a skill of slot 0 from a
   *   TASKBAR also is, its text being read for chat lines only, so Clean Hit loaded from the server does not move on the
   *   bar; one placed from the skill window carries its name).
   * - On a slot of the item row: a skill only if `CT_STEP` or `CT_GENERAL` (`canPlaceOnBar`, :2026-2041), else it is refused
   *   and stays where it was; let go on its own slot, nothing. It goes there (`SetShortcut`, ADDITEMTASKBAR).
   * - On a slot of the action slot: a job skill only (`SetSkillQueue`, :2043-2066); one moved within the action slot is
   *   taken out first, unsent (`RemoveSkillQueue( i, FALSE )`), and put back where it is let go.
   * - From the bar, once it has gone somewhere else on the bar (or anywhere on it that takes nothing), its slot is emptied
   *   (:2073-2090): Neuz takes a shortcut off a slot when it is let go on the bar's empty parts too.
   * The applet row takes nothing here, for want of ADDAPPLETTASKBAR: a shortcut let go there stays where it was (Neuz would
   * move it there).
   *
   * Two departures: an item slot's shortcut comes off the bar it was taken from (Neuz empties that slot but sends the
   * REMOVEITEMTASKBAR for the bar shown at the drop, which a digit may have changed in between); and a skill moved within
   * the action slot that cannot go where it is let go is sent as taken out (Neuz sends nothing then, and the server would
   * keep the skill the bar no longer shows).
   */
  private dropOn(carried: Carried, target: DropTarget): void {
    const own = this.own;
    const shortcut = this.carriedShortcut(carried);
    if (own === undefined || shortcut === null) return;
    const fromBar = carried.from !== 'skills';
    if (target === null) {
      if (fromBar) this.removeCarried(carried);
      return;
    }
    if (shortcut.kind === ShortcutKind.SKILL && shortcut.type !== 2) {
      const slot = own.skills[shortcut.id];
      if (slot !== undefined && (slot.level <= 0 || !this.playerHasSkillOpen(slot.skill))) return;
    }
    if (shortcut.id === 0 && shortcut.text === '' && shortcut.kind !== ShortcutKind.SKILLFUN) return;
    if (target === 'applet') return;
    if (target !== 'bar' && target.row === 'item') {
      if (carried.from === 'item' && carried.bar === this.slotIndex && carried.slot === target.slot) return;
      if (shortcut.kind === ShortcutKind.SKILL) {
        const skill = shortcut.type === 2 ? undefined : this.skillOf(shortcut.id);
        // a party skill (type 2) is the troupe's catalog's, which the browser has not: Neuz reads its combo style there
        if (skill === undefined || !canPlaceOnBar(skill, own.skills[shortcut.id]?.level ?? 0)) return;
      }
      this.setItemShortcut(target.slot, shortcut);
    } else if (target !== 'bar' && target.row === 'queue' && shortcut.kind === ShortcutKind.SKILL && shortcut.type === 0) {
      if (carried.from === 'queue') {
        if (this.actions.queueRunning()) return;
        this.removeSkillQueue(carried.slot, false);
        if (!this.setSkillQueue(target.slot, shortcut.id, shortcut.text)) this.sendQueue();
        return;
      }
      this.setSkillQueue(target.slot, shortcut.id, shortcut.text);
    }
    if (fromBar) this.removeCarried(carried);
  }

  /** The bar's shortcut `carried` comes off its slot (the end of `OnDropIcon`, :2073-2090). */
  private removeCarried(carried: Carried): void {
    if (carried.from === 'item') this.removeItemShortcut(carried.bar, carried.slot);
    else if (carried.from === 'queue') this.removeSkillQueue(carried.slot);
  }

  /** A right click on slot `i` of `row` (`OnRButtonUp`, :1473-1512): an item slot empties; the action slot's goes out. */
  private rightClick(row: 'item' | 'queue', i: number): void {
    if (row === 'item') {
      if (this.loaded.items[this.slotIndex]![i]!.kind !== ShortcutKind.NONE) this.removeItemShortcut(this.slotIndex, i);
    } else {
      this.removeSkillQueue(i);
    }
  }

  /** The long press's Remove on slot `i` of `row` of the bar shown: the right click's. */
  private removeAt(row: 'item' | 'queue', i: number): void {
    this.rightClick(row, i);
  }

  /**
   * `SetShortcut( nIndex, ..., nWhere 1 )` (`WndTaskBar.cpp:1514-1667`): `from` on slot `slot` of the bar shown, as Neuz
   * fills it (its kind, type and ID; `m_dwIndex` the slot, `m_dwUserId` 0, `m_dwData` 1, the carried text), keeping a
   * stackable item's `m_dwItemId` (:1648-1653), then ADDITEMTASKBAR. (The 10-chat-shortcut cap, :1520-1539, is the chat's:
   * the bar moves no more chat lines than it had.)
   */
  private setItemShortcut(slot: number, from: Shortcut): void {
    const bar = this.slotIndex;
    const shortcut: Shortcut = {
      kind: from.kind, id: from.id, type: from.type, index: slot, userId: 0, data: WHERE_ITEM, text: from.text,
    };
    const row = this.loaded.items[bar]!;
    row[slot] = shortcut;
    TaskBar.remember(this.loaded, this.own, this.data, row, slot, shortcut);
    this.commit();
    this.actions.sendAddItemTaskBar(bar, slot, shortcut);
  }

  /** `lpShortcut->Empty()` and REMOVEITEMTASKBAR for slot `slot` of bar `bar`. */
  private removeItemShortcut(bar: number, slot: number): void {
    const row = this.loaded.items[bar]!;
    row[slot] = EMPTY;
    TaskBar.remember(this.loaded, this.own, this.data, row, slot, EMPTY);
    this.commit();
    this.actions.sendRemoveItemTaskBar(bar, slot);
  }

  /** The skills of the action slot's slots, for the placement rules: `null` for an empty one or past `m_nCurQueueNum`. */
  private queueSkills(): Array<WebSkill | null> {
    const { queue, queueCount } = this.loaded;
    return queue.map((shortcut, i) =>
      (i < queueCount && shortcut.kind === ShortcutKind.SKILL ? this.skillOf(shortcut.id) ?? null : null));
  }

  /**
   * `CWndTaskBar::SetSkillQueue( nIndex, 0, dwId )` (`WndTaskBar.cpp:1787-1872`): the job skill of skill slot `skillIndex`
   * into slot `at` of the action slot; true where it went. Not while the chain runs (`m_nExecute`), nor into a full action
   * slot. An empty slot under `m_nCurQueueNum` is an error, and the action slot is emptied first (:1793-1803). A skill of
   * level 0 is refused; one with a cool-down at its level is refused with `TID_GAME_SKILLLNOTUSE` (:1819-1830); then the
   * place must take its combo style (`canPlaceInQueue`). Past the last skill it goes after it; on a skill, in front of it,
   * the rest moved on (copied as they are: Neuz leaves their `m_dwIndex`). Then SKILLTASKBAR with the 5 slots.
   */
  private setSkillQueue(at: number, skillIndex: number, text: string): boolean {
    if (this.actions.queueRunning()) return false;
    const bars = this.loaded;
    if (bars.queueCount >= MAX_SLOT_QUEUE) return false;
    if (bars.queue.slice(0, bars.queueCount).some((shortcut) => shortcut.kind === ShortcutKind.NONE)) {
      bars.queue = bars.queue.map(() => EMPTY);
      bars.queueCount = 0;
    }
    const slot = this.own?.skills[skillIndex];
    const skill = this.skillOf(skillIndex);
    // GetSkill( 0, dwId ) and its prop: a slot the catalog has nothing for is one Neuz would read through a null pointer
    if (slot === undefined || skill === undefined || slot.level <= 0) return false;
    const cooldown = skill.levels[slot.level - 1]?.cooldown;
    if (cooldown !== undefined && cooldown > 0) {
      this.say('TID_GAME_SKILLLNOTUSE', skill.name);
      return false;
    }
    if (!canPlaceInQueue(this.queueSkills(), at, skill, slot.level)) return false;
    const index = Math.min(at, bars.queueCount);
    for (let i = bars.queueCount; i > index; i--) bars.queue[i] = bars.queue[i - 1]!;
    bars.queue[index] = { kind: ShortcutKind.SKILL, id: skillIndex, type: 0, index, userId: 0, data: WHERE_QUEUE, text };
    bars.queueCount++;
    this.commit();
    this.sendQueue();
    return true;
  }

  /**
   * `CWndTaskBar::RemoveSkillQueue( nIndex, bSend )` (`WndTaskBar.cpp:1446-1472`): not while the chain runs. The skill of
   * slot `index` goes out, the ones after it move one slot on (each its new `m_dwIndex`), and as long as the skill taken out
   * could not have stood where it was in the new order (`CheckAddSkill( dwComboStyleSrc, nIndex )`), the one now there goes
   * out too: taking out Clean Hit, the first, empties the action slot. Then SKILLTASKBAR, unless `send` is false, sent also
   * when there was nothing to take out, as Neuz sends it.
   */
  private removeSkillQueue(index: number, send = true): void {
    if (this.actions.queueRunning()) return;
    const bars = this.loaded;
    while (index < MAX_SLOT_QUEUE && bars.queue[index]!.kind !== ShortcutKind.NONE) {
      const style = this.skillOf(bars.queue[index]!.id)?.comboStyle ?? 0;
      for (let i = index; i < MAX_SLOT_QUEUE - 1; i++) bars.queue[i] = { ...bars.queue[i + 1]!, index: i };
      bars.queue[MAX_SLOT_QUEUE - 1] = EMPTY;
      bars.queueCount = Math.max(0, bars.queueCount - 1);
      if (checkAddSkill(this.queueSkills(), style, index)) break;
    }
    this.commit();
    if (send) this.sendQueue();
  }

  /** SKILLTASKBAR: the action slot's 5 slots, every one of them (`SendSkillTaskBar`, `DPClient.cpp:10972-10989`). */
  private sendQueue(): void {
    this.actions.sendSkillTaskBar(this.loaded.queue.map((shortcut) => (shortcut.kind === ShortcutKind.NONE ? null : shortcut)));
  }

  /** The bars as edited, put back in `OwnState.taskBar` (Neuz's bars are the window's own: `m_aSlotItem`, `m_aSlotQueue`). */
  private commit(): void {
    const own = this.own;
    if (own === undefined) return;
    const { applets, items, queue, queueCount } = this.loaded;
    const message: TaskBarMessage = {
      applets: applets.flatMap((shortcut, slot) => (shortcut.kind === ShortcutKind.NONE ? [] : [{ slot, shortcut }])),
      items: items.flatMap((row, bar) =>
        row.flatMap((shortcut, slot) => (shortcut.kind === ShortcutKind.NONE ? [] : [{ bar, slot, shortcut }]))),
      queue: queue.slice(0, queueCount),
      actionPoint: own.taskBar?.actionPoint ?? 0,
    };
    own.taskBar = message;
    this.loadedFrom = message;
    // drawn at once, not at the next frame's update
    this.update(own, this.data);
  }

  /** A line of the server messages: the text `id` with `args` (`PutString( str, NULL, prj.GetTextColor( id ) )`). */
  private say(id: string, ...args: string[]): void {
    const entry = this.data.texts?.get(id);
    if (entry === undefined || entry.text === '') return;
    this.actions.say(formatText(entry.text, args), entry.color ?? 0xffffffff);
  }

  // ---- the mouse's drag and the finger's long press ----------------------------------------------------------------

  /** A press that carries `carried` once the mouse moves `DRAG_START` px with its button down; let go before, it is a press. */
  private press(carried: Carried, event: PointerEvent): void {
    if (event.button !== 0) return;
    this.endDrag();
    this.drag = { carried, pointerId: event.pointerId ?? 0, x: event.clientX, y: event.clientY, ghost: null };
    this.view.addEventListener('pointermove', this.onDragMove);
    this.view.addEventListener('pointerup', this.onDragUp);
    this.view.addEventListener('pointercancel', this.onDragCancel);
  }

  /** The drag: the shortcut's picture at the pointer, 16 px up and left of it (`CNeuzApp::Render`, `Neuz.cpp:823-824`). */
  private readonly onDragMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (drag === null || (event.pointerId ?? 0) !== drag.pointerId) return;
    if (drag.ghost === null) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < DRAG_START) return;
      const shortcut = this.carriedShortcut(drag.carried);
      if (shortcut === null) {
        this.endDrag();
        return;
      }
      const ghost = this.doc.createElement('div');
      ghost.className = 'hud-carried';
      const icon = this.iconOf(shortcut);
      if (icon !== null) ghost.style.backgroundImage = `url(${JSON.stringify(this.art.url(icon))})`;
      this.element.append(ghost);
      drag.ghost = ghost;
      this.drawLit();
    }
    drag.ghost.style.left = `${event.clientX - ICON_SIZE / 2}px`;
    drag.ghost.style.top = `${event.clientY - ICON_SIZE / 2}px`;
  };

  /** The button let go: a drag ends on what is under the pointer (`OnDropIcon`); a press that never moved is a press. */
  private readonly onDragUp = (event: PointerEvent): void => {
    const drag = this.drag;
    if (drag === null || (event.pointerId ?? 0) !== drag.pointerId) return;
    const dragged = drag.ghost !== null;
    this.endDrag();
    if (!dragged) return;
    const target = this.targetOf(event.target);
    // a slot dragged back onto itself gets the click of the button let go: it is not a press (a drag that ends anywhere
    // else makes its click on an element both ends share, none of the slots)
    const { carried } = drag;
    if (typeof target === 'object' && target !== null && carried.from !== 'skills' && carried.from === target.row &&
      carried.slot === target.slot) {
      this.swallowClick = true;
    }
    this.dropOn(carried, target);
  };

  private readonly onDragCancel = (event: PointerEvent): void => {
    if (this.drag !== null && (event.pointerId ?? 0) === this.drag.pointerId) this.endDrag();
  };

  private endDrag(): void {
    const drag = this.drag;
    if (drag === null) return;
    this.drag = null;
    drag.ghost?.remove();
    this.view.removeEventListener('pointermove', this.onDragMove);
    this.view.removeEventListener('pointerup', this.onDragUp);
    this.view.removeEventListener('pointercancel', this.onDragCancel);
    this.drawLit();
  }

  /** What an element under the pointer is to the bar: a slot of a row, the applet row, the rest of the bar, or off it. */
  private targetOf(target: EventTarget | null): DropTarget {
    const element = target as Element | null;
    if (element === null || typeof element.closest !== 'function' || !this.strip.contains(element)) return null;
    const slot = element.closest<HTMLElement>('.hud-slot[data-row]');
    const row = slot?.dataset.row;
    if (row === 'applet') return 'applet';
    if ((row === 'item' || row === 'queue') && slot !== null && slot !== undefined) return { row, slot: Number(slot.dataset.slot) };
    return 'bar';
  }

  /** A shortcut's picture: a skill's or an item's icon of the catalogs, an applet's, or none. */
  private iconOf(shortcut: Shortcut): string | null {
    if (shortcut.kind === ShortcutKind.SKILL) return shortcut.type === 2 ? null : this.skillOf(shortcut.id)?.icon ?? null;
    if (shortcut.kind === ShortcutKind.APPLET) {
      const icon = APPLETS.get(shortcut.id)?.icon;
      return icon ? themeKey(icon) : null;
    }
    if (shortcut.kind === ShortcutKind.ITEM) {
      const item = this.own?.inventory?.get(shortcut.id);
      return item === undefined ? null : this.data.itemProps.get(item.itemId)?.icon ?? null;
    }
    return null;
  }

  /** A finger goes down on slot `i` of `row`, which holds a shortcut: held `LONG_PRESS_MS`, the slot's line opens. */
  private startHold(event: PointerEvent, row: 'item' | 'queue', i: number): void {
    this.cancelHold();
    const timer = setTimeout(() => {
      this.hold = null;
      this.removeHoldListeners();
      // the click of the finger's lift is not a press on the slot
      this.swallowClick = true;
      this.openSlotMenu(row, i);
    }, LONG_PRESS_MS);
    this.hold = { timer, pointerId: event.pointerId ?? 0, x: event.clientX, y: event.clientY };
    this.view.addEventListener('pointermove', this.onHoldMove);
    this.view.addEventListener('pointerup', this.onHoldEnd);
    this.view.addEventListener('pointercancel', this.onHoldEnd);
  }

  private readonly onHoldMove = (event: PointerEvent): void => {
    const hold = this.hold;
    if (hold === null || (event.pointerId ?? 0) !== hold.pointerId) return;
    if (Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > LONG_PRESS_SLOP) this.cancelHold();
  };

  private readonly onHoldEnd = (event: PointerEvent): void => {
    if (this.hold !== null && (event.pointerId ?? 0) === this.hold.pointerId) this.cancelHold();
  };

  private cancelHold(): void {
    if (this.hold === null) return;
    clearTimeout(this.hold.timer);
    this.hold = null;
    this.removeHoldListeners();
  }

  private removeHoldListeners(): void {
    this.view.removeEventListener('pointermove', this.onHoldMove);
    this.view.removeEventListener('pointerup', this.onHoldEnd);
    this.view.removeEventListener('pointercancel', this.onHoldEnd);
  }

  /**
   * The long press's line, Remove, above slot `i` of `row` (at the bar's scale), until it is pressed or a press lands
   * elsewhere. Its line is a finger's (the style sheet's 44 px).
   */
  private openSlotMenu(row: 'item' | 'queue', i: number): void {
    const left = (row === 'item' ? this.layout.itemX + i * ICON_SIZE : this.layout.queueX + i * SKILL_SIZE) * this.layout.scale;
    this.menuFor = { row, slot: i };
    this.slotMenu.style.left = `${left}px`;
    this.slotMenu.style.bottom = `${TASKBAR_HEIGHT * this.layout.scale}px`;
    this.slotMenu.dataset.row = row;
    this.slotMenu.dataset.slot = String(i);
    this.slotMenu.hidden = false;
    this.doc.addEventListener('pointerdown', this.onPressOutsideMenu, true);
  }

  private closeSlotMenu(): void {
    if (this.menuFor === null) return;
    this.menuFor = null;
    this.slotMenu.hidden = true;
    this.doc.removeEventListener('pointerdown', this.onPressOutsideMenu, true);
  }

  private readonly onPressOutsideMenu = (event: Event): void => {
    const target = event.target as Node | null;
    if (target !== null && this.slotMenu.contains(target)) return;
    this.closeSlotMenu();
  };

  /** A button of the bar: out of the tab order, and given no focus by a press, so that Space and Enter never press it. */
  private button(className: string, press: () => void): HTMLButtonElement {
    const button = this.doc.createElement('button');
    button.type = 'button';
    button.className = className;
    button.tabIndex = -1;
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', press);
    return button;
  }

  private place(element: HTMLElement, left: number, top: number, width: number, height: number): void {
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
  }

  private placeRect(element: HTMLElement, { left, top, right, bottom }: Rect): void {
    this.place(element, left, top, right - left, bottom - top);
  }

  /**
   * The keys the task bar reads: F1-F9 the slots of the bar shown (`CWndTaskBar::Process`, :2395-2427; F10, which reads past
   * the bar into the next one's first slot, is not copied), 1-8 the bar (`CWndMgr::Process`, `WndManager.cpp:3541-3582`), and
   * the hotkeys of Piece 4's windows, H and K (:2359-2388). A held F-key repeats, as Neuz's key table does (every WM_KEYDOWN,
   * the repeats too, sets `g_bKeyTable`, `Neuz.cpp:1361`, with `__XKEYEDGE` off). The digits and the hotkeys work once a
   * press: a choice — Neuz repeats them too while the key is held, which for H opens and closes the window by turns. While a
   * shortcut is carried (`carrying`) the F-keys and the hotkeys do nothing (`Process` reads them only with
   * `m_GlobalShortcut` empty, :2331-2338), the digits still switch the bar. Not with Ctrl, Alt or Meta, nor while typing in
   * a field.
   */
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.altKey || event.metaKey || typing(event.target)) return;
    const fKey = /^F([1-9])$/.exec(event.code);
    if (fKey !== null) {
      // F5 would reload the page, F1 open the browser's help...
      event.preventDefault();
      if (!this.carrying) this.useItemSlot(Number(fKey[1]) - 1);
      return;
    }
    if (event.repeat) return;
    const digit = /^Digit([1-8])$/.exec(event.code);
    if (digit !== null) {
      this.setBar(Number(digit[1]) - 1);
      return;
    }
    const letter = /^Key([A-Z])$/.exec(event.code)?.[1];
    const id = letter === undefined ? undefined : HOTKEYS.get(letter);
    if (id !== undefined && !this.carrying) this.execute(id);
  };

  /** C as it is let go: the action slot (`CWndWorld::OnKeyUp`, `WndWorld.cpp:7712-7729`, the default interface). */
  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.altKey || event.metaKey || typing(event.target)) return;
    if (event.code === 'KeyC') this.actions.useActionSlot();
  };

  private readonly onResize = (): void => {
    this.dirty = true;
  };
}

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
//   CWndTaskBar::Process           WndTaskBar.cpp:2325-2427             the applets' hotkeys, F1-F9, none while carrying
//   CWndMgr::ObjectExecutor        _Interface/WndManager.cpp:2566-2700  an applet pressed opens its window, Log out
//   CWndMgr::Process               WndManager.cpp:3541-3582             the keys 1-8
//   CWndWorld::OnKeyUp             _Interface/WndWorld.cpp:7712-7729    C, the action slot
//
// Piece 4 uses no item (Piece 5): an item shortcut shows its icon, and a stackable item its count, greyed. Skills come from
// the skills catalog of milestone 2 (`TaskBarData.skills`), and without it a skill is a plain greyed slot, as every other
// kind is (motions, chat lines ...). The applet row takes a shortcut let go on it (ADDAPPLETTASKBAR) and loses one to a
// right click (REMOVEAPPLETTASKBAR), 2026-11-05 (see `TaskBarEdits.dropOn`). The edits are `taskBarEdits.ts`', the drag and the long press
// `slotGestures.ts`'.
//
// The edits, for a mouse and for a finger (spec §3.11): with the mouse a shortcut is dragged (from the skill window, or from
// a slot of the item row or the action slot) and let go on a slot, or off the bar to take it off, as Neuz does, and a right
// click takes one off; with a finger a skill of the skill window is tapped, then a slot (`carrySkill` with no event), and a
// long press on a slot offers to take it off (`SlotGestures`). Neither of the finger's ways is Neuz's, which has no touch.

import { MAX_SLOT_APPLET, MAX_SLOT_ITEM, MAX_SLOT_ITEM_COUNT, MAX_SLOT_QUEUE, ShortcutKind } from '@flyffweb/protocol';
import type { InventoryItem, Shortcut, TaskBar as TaskBarMessage } from '@flyffweb/protocol';
import { positionItemDetails } from './itemDetails';
import type { WebItemProp, WebPartySkill, WebSkill } from '@flyffweb/formats';
import { watchTouch } from '@flyffweb/scene';
import type { TouchWatch } from '@flyffweb/scene';
import type { OwnState } from '../OwnState';
import { isBarStyle } from '../skills/skillRules';
import { APPLETS, AppId, appletText } from './applets';
import { themeKey, themeUrl } from './art';
import type { UiArt } from './art';
import { setLayoutBottom } from './frame';
import { SlotGestures, byFinger } from './slotGestures';
import { EMPTY, TaskBarEdits, remember, stacks } from './taskBarEdits';
import type { Carried, DropTarget, LoadedBars, TaskBarEditActions } from './taskBarEdits';
import { TaskMenu } from './taskMenu';

/** The windows of Piece 4 a press on the task bar opens. */
export type TaskBarWindow = 'character' | 'status' | 'skills' | 'inventory' | 'chat' | 'navigator' | 'worldmap' | 'option'
  | 'quests' | 'party';
/** `APP_QUEST_EX_LIST` (Resource/ResData.h), the quest window (Piece 7 M1), Q (FuncApplet.cpp:229). */
const APP_QUEST_EX_LIST = 859;
/** `APP_PARTY` (Resource/ResData.h:100), the party window and its quick view (Piece 7 M4), P (FuncApplet.cpp:233). */
const APP_PARTY = 195;

/**
 * The applets whose window Piece 4 has, which `ObjectExecutor` opens (or closes) when they are pressed: from the Start
 * menu, a slot or their hotkey. The skill window (`APP_SKILL3`, K) is milestone 2's.
 */
const WINDOWS: ReadonlyMap<number, TaskBarWindow> = new Map([
  [AppId.NAVIGATOR, 'navigator'],
  [AppId.MAP, 'worldmap'],
  [1014, 'chat'],
  [1003, 'inventory'],
  [AppId.STATUS1, 'status'],
  [AppId.CHARACTER3, 'character'],
  [AppId.SKILL3, 'skills'],
  [AppId.OPTIONEX, 'option'],
  [APP_QUEST_EX_LIST, 'quests'],
  [APP_PARTY, 'party'],
]);

/**
 * The hotkeys the task bar reads (`CWndTaskBar::Process`, `WndTaskBar.cpp:2359-2388`): those of the applets of `WINDOWS`,
 * by the letter of their key (`KeyH`, `KeyK`). APP_STATUS1's T is the status window's own (`Hud`), so it is not read twice.
 */
const HOTKEYS: ReadonlyMap<string, number> = new Map(
  [...WINDOWS.keys()]
    .filter((id) => id !== AppId.STATUS1 && APPLETS.get(id)?.hotkey !== undefined)
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
  { id: 1003, text: 'Inventory' },
  // CWndTaskMenu's APP_QUEST_EX_LIST line, 'Quest Diary' (TID_APP_QUEST, WndTaskBar.cpp:2623)
  { id: APP_QUEST_EX_LIST, text: 'Quest Diary' },
  // CWndTaskMenu's APP_MAP line, 'World Map' (TID_APP_MAP), just before Navigator (WndTaskBar.cpp:2734-2738)
  { id: AppId.MAP, text: 'World Map' },
  { id: AppId.NAVIGATOR, text: 'Navigator' },
  // CWndTaskMenu's APP_PARTY line, 'Party' (TID_APP_PARTY), in its Communication submenu (WndTaskBar.cpp:2670): the
  // browser's menu is flat, so it stands before Option
  { id: APP_PARTY, text: 'Party' },
  // CWndTaskMenu's APP_OPTIONEX line, 'Option' (TID_APP_OPTION), just before Log out (WndTaskBar.cpp:2638)
  { id: AppId.OPTIONEX, text: 'Option' },
  { id: AppId.LOGOUT, text: 'Log out' },
];

/**
 * The Start button's name for a screen reader: its picture says "Start" (ButtStart.bmp), and no text of the catalogs does
 * (resdata.inc names the button "Button"), so it is one of the plan's own texts.
 */
const START_LABEL = 'Start';

/** What a press on the task bar asks its owner for, and where its edits go. */
export interface TaskBarActions extends TaskBarEditActions {
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
  /** Piece 7 M4: the party skills (`data/party.json`, by id): a type-2 skill shortcut's icon and name. */
  partySkills?: ReadonlyMap<number, Pick<WebPartySkill, 'name' | 'icon'>>;
  /**
   * 2026-11-05: the tooltip of an item shortcut's item, shown while the mouse is over its slot (`PutToolTip_Item` with flag 0,
   * WndTaskBar.cpp:594); none without it.
   */
  itemTooltip?: (item: InventoryItem) => HTMLElement | null;
}

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
export function taskBarLayout(width: number, fill = false): TaskBarLayout {
  let chosen: (typeof WINDOWS_BY_WIDTH)[number] = WINDOWS_BY_WIDTH[0];
  for (const window of WINDOWS_BY_WIDTH) if (window.width <= width) chosen = window;
  const scale = width > 0 && (fill || width < chosen.width) ? width / chosen.width : 1;
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

/** Whether the key comes from a field being typed in, which the game's keys leave alone. */
function typing(target: EventTarget | null): boolean {
  const tag = (target as { tagName?: string } | null)?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA';
}

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
  /** The item tooltip shown over an item shortcut (2026-11-05). */
  private itemTip: HTMLElement | undefined;
  private data: TaskBarData = { itemProps: new Map() };
  private layout: TaskBarLayout = taskBarLayout(0);
  /** The window was resized (or the bar not yet laid out in a layer with a width): `update` lays it out again. */
  private dirty = true;
  /** The touch rule (`watchTouch`): the Start menu is drawn for a finger on a touch screen, from a first touch on. */
  private readonly touch: TouchWatch;
  /** The skill a finger picked in the skill window, which the next slot tapped takes, and the window, where presses keep it. */
  private picked: number | null = null;
  private pickedWithin: Element | null = null;
  /** The click that ends a slot's drag back onto itself, or its long press, is not a press on the slot. */
  private swallowClick = false;
  /** The edits (`TaskBarEdits`) and the gestures that make them (`SlotGestures`). */
  private readonly edits: TaskBarEdits;
  private readonly gestures: SlotGestures;
  /** The rows lit, as a string, to touch the DOM only when it changes. */
  private litShown = '';
  private itemShortcutsChanged = false;

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

    strip.append(this.start, this.up, this.down, this.number, this.action);
    // the edits on the bars as loaded, and the gestures that make them
    const loaded = (): LoadedBars => this.loaded;
    const own = (): OwnState | undefined => this.own;
    const data = (): TaskBarData => this.data;
    const shown = (): number => this.slotIndex;
    this.edits = new TaskBarEdits({
      get bars() {
        return loaded();
      },
      get own() {
        return own();
      },
      get data() {
        return data();
      },
      get bar() {
        return shown();
      },
      commit: () => this.commit(),
    }, actions);
    this.gestures = new SlotGestures(art, {
      strip,
      holder: element,
      pictureOf: (carried) => {
        const shortcut = this.edits.carriedShortcut(carried);
        return shortcut === null ? undefined : this.iconOf(shortcut);
      },
      drop: (carried, target) => this.edits.dropOn(carried, target),
      swallowClick: () => {
        this.swallowClick = true;
      },
      remove: (row, slot) => this.edits.rightClick(row, slot),
      menuAt: (row, slot) => ({
        left: (row === 'item' ? this.layout.itemX + slot * ICON_SIZE : this.layout.queueX + slot * SKILL_SIZE) * this.layout.scale,
        bottom: TASKBAR_HEIGHT * this.layout.scale,
      }),
      changed: () => this.drawLit(),
    }, doc);
    // the menus beside the bar, not in it: a bar drawn smaller is a layer of its own, which would keep them under the
    // windows
    element.append(strip, this.menu.element, this.gestures.menu);

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
    return this.picked !== null || this.gestures.dragged !== null;
  }

  /** The skill (its slot of `m_aJobSkill`) a finger picked in the skill window, or null. */
  get pickedSkill(): number | null {
    return this.picked;
  }

  /**
   * A skill of the skill window carried to the bar with the mouse (`event`, the press on the skill): a drag that begins
   * once the mouse moves (`CWndSkillTreeEx::OnMouseMove`) and ends where the button is let go.
   */
  carrySkill(skillIndex: number, event: PointerEvent): void {
    this.gestures.press({ from: 'skills', skillIndex }, event);
  }

  /** Piece 7 M4: a party skill of the party window's Skill tab carried to the bar with the mouse, as `carrySkill`. */
  carryPartySkill(skill: number, event: PointerEvent): void {
    this.gestures.press({ from: 'partySkills', skill }, event);
  }

  setInventoryShortcut(objectId: number, slot: number): void {
    if (!Number.isInteger(slot) || slot < 0 || slot >= 9 || !this.own?.inventory?.has(objectId)) return;
    this.edits.dropOn({ from: 'inventory', objectId }, { row: 'item', slot });
  }

  /**
   * A skill of the skill window picked by a finger: the next slot of the item row or the action slot tapped takes it
   * (picked again, it is let go). A press anywhere else but in `within` (the skill window) lets it go, so that a slot is
   * never replaced by a pick the player has forgotten.
   */
  pickSkill(skillIndex: number, within: Element): void {
    if (this.picked === skillIndex) {
      this.dropPick();
      return;
    }
    if (this.picked === null) this.doc.addEventListener('pointerdown', this.onPressWhilePicked, true);
    this.picked = skillIndex;
    this.pickedWithin = within;
    this.drawLit();
  }

  /** Lets go of the skill a finger picked (the skill window's buttons, a press elsewhere, the window closed, a placing). */
  dropPick(): void {
    if (this.picked === null) return;
    this.picked = null;
    this.pickedWithin = null;
    this.doc.removeEventListener('pointerdown', this.onPressWhilePicked, true);
    this.drawLit();
  }

  /**
   * The skill window's double click on skill slot `skillIndex` (`CWndSkillTreeEx::OnLButtonDblClk`, `WndField.cpp:8318-8393`):
   * `SetSkillQueue( m_nCurQueueNum, 0, i )`, the skill after the last one of the action slot, unless the chain runs.
   */
  queueSkill(skillIndex: number): void {
    this.edits.queueSkill(skillIndex);
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
    // A consumed stack may be referenced on a hidden bar too. Reconcile all rows before drawing the selected one.
    if (own) for (const row of items) row.forEach((shortcut, i) => {
      if (shortcut.kind === ShortcutKind.ITEM) this.itemView(row, i, own, data);
    });
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
    this.gestures.setRemoveText(data.texts?.get(REMOVE_TEXT)?.text ?? '');
    this.drawLit();
    if (this.itemShortcutsChanged) { this.itemShortcutsChanged = false; this.commit(); }
  }

  /** Takes the bar off and lets go of the keys. */
  dispose(): void {
    this.hideItemTip();
    this.menu.dispose();
    this.dropPick();
    this.gestures.dispose();
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
      remember(bars, own, data, applets, slot, shortcut);
    }
    for (const { bar, slot, shortcut } of message?.items ?? []) {
      items[bar]![slot] = shortcut;
      remember(bars, own, data, items[bar]!, slot, shortcut);
    }
    const queue = (message?.queue ?? []).slice(0, MAX_SLOT_QUEUE);
    bars.queueCount = queue.length;
    bars.queue = [...queue, ...Array.from({ length: MAX_SLOT_QUEUE - queue.length }, () => EMPTY)];
    return bars;
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
        const available = WINDOWS.has(shortcut.id) || shortcut.id === AppId.LOGOUT;
        return {
          kind: 'applet', greyed: !available, icon: found?.icon ? themeKey(found.icon) : null, count: '', hotkey: available ? found?.hotkey ?? '' : '',
          name: found === undefined ? '' : appletText(found.desc, data.texts ?? new Map()),
        };
      }
      case ShortcutKind.ITEM:
        return this.itemView(row, i, own, data);
      case ShortcutKind.SKILL: {
        if (shortcut.type === 2) {
          // Piece 7 M4: a party skill, the party catalog's (`WndTaskBar.cpp:403-476` reads `prj.GetPartySkill`)
          const party = data.partySkills?.get(shortcut.id);
          if (party === undefined || party.icon === null) return PLAIN_VIEW;
          return { kind: 'skill', greyed: false, icon: party.icon, count: '', hotkey: '', name: party.name };
        }
        const skillId = own.skills[shortcut.id]?.skill;
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
   * non-stackable item, empties. Rebinding/clearing item rows is sent to the server. With no inventory (it
   * could not be read) an item is a plain greyed slot.
   */
  private itemView(row: Shortcut[], i: number, own: OwnState, data: TaskBarData): SlotView {
    const inventory = own.inventory;
    if (inventory === null) return PLAIN_VIEW;
    let item: InventoryItem | undefined = inventory.get(row[i]!.id);
    const remembered = this.loaded.itemIds.get(row)?.[i] ?? null;
    if (item === undefined || (remembered !== null && item.itemId !== remembered)) {
      const itemId = remembered;
      item = itemId === null ? undefined : [...inventory.values()].find((other) => other.itemId === itemId);
      row[i] = item === undefined ? EMPTY : { ...row[i]!, id: item.objectId };
      const bar = this.loaded.items.indexOf(row);
      if (bar >= 0) {
        if (item) this.actions.sendAddItemTaskBar(bar, i, row[i]!);
        else this.actions.sendRemoveItemTaskBar(bar, i);
        this.itemShortcutsChanged = true;
      }
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
    return { kind: 'item', greyed: false, icon: prop?.icon ?? null, count, hotkey: '', name: prop?.name ?? '' };
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
    const carried = this.gestures.dragged ?? picked;
    const shortcut = carried === null ? null : this.edits.carriedShortcut(carried);
    let item = false;
    let queue = false;
    if (shortcut !== null) {
      if (shortcut.kind === ShortcutKind.SKILL && shortcut.type === 0) {
        const skill = this.edits.skillOf(shortcut.id);
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
    const style = parent === null ? null : this.view.getComputedStyle(parent);
    const safeLeft = parseFloat(style?.getPropertyValue('--game-safe-left') ?? '') || 0;
    const safeRight = parseFloat(style?.getPropertyValue('--game-safe-right') ?? '') || 0;
    const available = Math.max(0, (parent?.clientWidth ?? 0) - safeLeft - safeRight);
    // Typing and compatibility mouse events must not swap a phone's layout to the desktop bar.
    const mobile = (this.view.matchMedia?.('(pointer: coarse)').matches === true || this.touch()) &&
      (parent?.clientWidth ?? 0) <= 1000;
    // Equal gutters keep the bar centered on the viewport even with an asymmetric notch.
    const width = mobile ? Math.min(720, Math.max(0, (parent?.clientWidth ?? 0) - 2 * Math.max(safeLeft, safeRight) - 32)) : available;
    // a layer not laid out yet is tried again at the next update
    this.dirty = width === 0;
    const layout: TaskBarLayout = mobile ? {
      ...taskBarLayout(width), width: 620, picture: 'wndTaskBar800.bmp', applets: 0,
      itemX: 106, queueX: 458, up: rect(404, 8, 418, 20), down: rect(404, 32, 418, 44),
      scale: width > 0 ? width / 620 : 1,
    } : taskBarLayout(width);
    this.layout = layout;
    const strip = this.strip;
    strip.classList.toggle('is-mobile-layout', mobile);
    strip.style.setProperty('--taskbar-art', themeUrl(this.art, layout.picture));
    const height = TASKBAR_HEIGHT * layout.scale;
    this.element.classList.toggle('is-floating', mobile);
    this.element.style.left = mobile ? `${((parent?.clientWidth ?? 0) - width) / 2}px` : '';
    this.element.style.width = mobile ? `${width}px` : '';
    this.element.style.height = mobile ? `${height}px` : '';
    strip.style.width = `${layout.width}px`;
    strip.style.backgroundImage = themeUrl(this.art, layout.picture);
    strip.style.transform = layout.scale === 1 ? '' : `scale(${layout.scale})`;
    strip.dataset.layout = String(layout.width);
    const room = (parent?.clientHeight ?? 0) - height;
    const most = this.touch() ? TOUCH_MENU_SCALE : 1;
    this.menu.place(room > 0 ? Math.min(most, room / this.menu.height) : layout.scale, height);
    if (parent !== null) {
      parent.style.setProperty('--hud-taskbar-height', `${height}px`);
      parent.style.setProperty('--hud-taskbar-left', mobile ? `${(parent.clientWidth - width) / 2}px` : '0px');
      parent.style.setProperty('--hud-taskbar-width', `${layout.width * layout.scale}px`);
      parent.style.setProperty('--hud-taskbar-bottom', mobile ? '0px' : 'var(--game-safe-bottom, 0px)');
      setLayoutBottom(parent, height);
    }
    this.gestures.closeMenu();

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
    // a right click takes an applet slot's shortcut off (OnRButtonUp's RECT_APPLET, 2026-11-05)
    this.appletSlots.forEach((slot, i) => slot.element.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      if (byFinger(event) || this.gestures.holding) return;
      this.edits.rightClickApplet(i);
    }));
    this.itemSlots = this.makeSlots('item', MAX_SLOT_ITEM, layout.itemX, ICON_SIZE, (i) => this.pressItemSlot(i));
    // the item tooltip while the mouse is over an item shortcut (2026-11-05); a press, which may start a drag, takes it away
    this.itemSlots.forEach((slot, i) => {
      slot.element.addEventListener('mouseenter', () => this.showItemTip(i, slot.element));
      slot.element.addEventListener('mouseleave', () => this.hideItemTip());
      slot.element.addEventListener('pointerdown', () => this.hideItemTip());
    });
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
      // a new press on a slot: a click left over from a drag or a long press that made none is no longer awaited (on the
      // slots, not the strip: a listener makes an element one Chromium moves nearby taps onto)
      element.addEventListener('pointerdown', () => {
        this.swallowClick = false;
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
      if (byFinger(event)) this.gestures.startHold(event, row, i);
      else this.gestures.press(row === 'item' ? { from: 'item', bar: this.slotIndex, slot: i } : { from: 'queue', slot: i }, event);
    });
    element.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      if (byFinger(event) || this.gestures.holding) return;
      this.edits.rightClick(row, i);
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
    if (this.placePicked({ row: 'applet', slot: i })) return;
    const shortcut = this.loaded.applets[i]!;
    if (shortcut.kind === ShortcutKind.APPLET) this.execute(shortcut.id);
    else if (shortcut.kind !== ShortcutKind.NONE) this.actions.useAppletSlot(i, shortcut);
  }

  /** The tooltip of the item on slot `i` of the bar shown, above `anchor` (not for a finger, nor while a shortcut is carried). */
  private showItemTip(i: number, anchor: HTMLElement): void {
    this.hideItemTip();
    if (this.carrying || this.view.matchMedia?.('(pointer: coarse)').matches === true) return;
    const shortcut = this.loaded.items[this.slotIndex]?.[i];
    if (shortcut === undefined || shortcut.kind !== ShortcutKind.ITEM) return;
    const item = this.own?.inventory?.get(shortcut.id);
    const tip = item === undefined ? null : this.data.itemTooltip?.(item) ?? null;
    if (tip === null) return;
    tip.classList.add('hud-taskbar-tooltip');
    this.doc.body.append(tip);
    positionItemDetails(tip, anchor, this.doc);
    this.itemTip = tip;
  }

  private hideItemTip(): void {
    this.itemTip?.remove();
    this.itemTip = undefined;
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
    this.dropPick();
    this.edits.dropOn({ from: 'skills', skillIndex: picked }, target);
    return true;
  }

  /**
   * A press while a finger's pick waits: in the skill window, or on a slot of the item row, the action slot or the applet
   * row (whose tap then places it), it keeps; anywhere else (the world, the bar's buttons, another window) it lets it go.
   */
  private readonly onPressWhilePicked = (event: Event): void => {
    const target = event.target as Element | null;
    if (target !== null && this.pickedWithin?.contains(target) === true) return;
    const slot = typeof target?.closest === 'function' ? target.closest<HTMLElement>('.hud-slot[data-row]') : null;
    if (slot !== null && this.strip.contains(slot) && (slot.dataset.row === 'item' || slot.dataset.row === 'queue' || slot.dataset.row === 'applet')) return;
    this.dropPick();
  };

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

  /** A shortcut's picture: a skill's or an item's icon of the catalogs, an applet's, or none. */
  private iconOf(shortcut: Shortcut): string | null {
    if (shortcut.kind === ShortcutKind.SKILL) {
      return shortcut.type === 2 ? this.data.partySkills?.get(shortcut.id)?.icon ?? null : this.edits.skillOf(shortcut.id)?.icon ?? null;
    }
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

  /** A button of the bar: out of the tab order, and given no focus by a press, so that Space and Enter never press it. */
  private button(className: string, press: () => void): HTMLButtonElement {
    const button = this.doc.createElement('button');
    button.type = 'button';
    button.className = className;
    // the bar's slots are drawn by CWndTaskBar itself, which plays no sound (WndTaskBar.cpp has no PLAYSND): only the Start
    // button is a CWndButton's click (Piece 6 M2)
    if (className !== 'hud-taskbar-start') button.dataset.silent = '';
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

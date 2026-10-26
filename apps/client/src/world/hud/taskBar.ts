// The task bar (spec §3.9): Neuz's `CWndTaskBar` along the bottom of the screen, with its Start menu, the applet row, the
// F1-F9 slots of the bar shown, the bar's arrows and number, and the action slot with its button; and the keys Neuz reads
// for it. It draws what the TASKBAR message put on the bars (`OwnState.taskBar`) with the own inventory and the catalogs,
// and asks its owner (`TaskBarActions`) to do what a press means.
//
//   CWndTaskBar::Initialize        _Interface/WndTaskBar.cpp:1232-1312  the window by the screen's width: 5, 10 or 18 applets
//   APP_TASKBAR800 ... 1680W        Resource/resdata.inc:9077-11666      its picture and its controls' rectangles
//   CWndTaskBar::OnInitialUpdate   WndTaskBar.cpp:1148-1199             the rows from WIDC_CUSTOM1-3; icon_ActionSkill.dds
//   CWndTaskBar::Serialize (load)  WndTaskBar.cpp:315-400               the bars read anew; m_dwItemId; an applet-row skill
//                                                                       that is not CT_STEP or CT_GENERAL emptied
//   CWndTaskBar::SetTaskBarTexture WndTaskBar.cpp:403-476               the picture of each kind of shortcut
//   CWndTaskBar::OnDraw            WndTaskBar.cpp:746-1090              the slots, the counts, the applets' hotkeys, the
//                                                                       action slot's button and points, the bar number
//   CWndTaskBar::UpdateItem        WndTaskBar.cpp:1092-1143             an item shortcut whose object is gone
//   CWndTaskBar::OnChildNotify     WndTaskBar.cpp:1344-1419             the arrows, the Start button, a slot pressed
//   CWndTaskBar::Process           WndTaskBar.cpp:2359-2427             the applets' hotkeys, F1-F9
//   CWndTaskMenu::OnInitialUpdate  WndTaskBar.cpp:2584-2739             the Start menu's lines
//   CWndMgr::AddAllApplet          _Interface/FuncApplet.cpp:176-302    the applets' icons and hotkeys (APPLETS)
//   CWndMgr::ObjectExecutor        _Interface/WndManager.cpp:2566-2700  an applet pressed opens its window, Log out
//   CWndMgr::Process               WndManager.cpp:3295-3427, 3541-3582  Escape (escapeStep), the keys 1-8
//   CWndWorld::OnKeyUp             _Interface/WndWorld.cpp:7712-7729    C, the action slot
//
// Piece 4 uses no item (Piece 5): an item shortcut shows its icon and count greyed. Skills are used from milestone 2; their
// icons come from its skills catalog (`TaskBarData.skills`), and until then a skill is a plain greyed slot, as every other
// kind is (motions, chat lines ...). Nothing here sends the bar's edits (ADDITEMTASKBAR and the others are milestone 2's).

import { MAX_SLOT_APPLET, MAX_SLOT_ITEM, MAX_SLOT_ITEM_COUNT, MAX_SLOT_QUEUE, ShortcutKind } from '@flyffweb/protocol';
import type { Shortcut, TaskBar as TaskBarMessage } from '@flyffweb/protocol';
import type { WebItemProp } from '@flyffweb/formats';
import type { OwnState } from '../OwnState';
import { themeKey, themeUrl } from './frame';
import type { UiArt } from './frame';

/** An applet of `CWndMgr::AddAllApplet`: its `APP_*` name, its icon in Client/Icon (none for two), its hotkey. */
export interface Applet {
  name: string;
  icon: string | null;
  hotkey: string | null;
}

const applet = (name: string, icon: string | null, hotkey: string | null = null): Applet => ({ name, icon, hotkey });

/**
 * The applets the live build registers, by `APP_*` id (`Resource/ResData.h`), with their icon and hotkey:
 * `CWndMgr::AddAllApplet` (`FuncApplet.cpp:176-302`) for `__VER` 15 and `__MAINSERVER`, in a language other than French
 * (`APP_LORD_SKILL` 'L', `APP_COUPLE_MAIN` 'F', the quest key 'Q', `NeuzMsgProc.cpp:174-181`). `__IMPROVE_MAP_SYSTEM` and
 * `__GUILDVOTE` are in the dead internal and test sections of `Neuz/VersionCommon.h` (`APP_MAP`, no `APP_GUILD_VOTE`),
 * `__TMP_POCKET`, `__NEW_WEB_BOX` and `__Y_INTERFACE_VER3` are commented out, and the `__BB_*` windows are on (:210-214).
 * `APP_MESSENGER_` is `APP_MESSENGER_EX` (`AppDefine.h:9-10`). Later registrations of an id replace earlier ones
 * (`m_mapAppletFunc.SetAt`); there are none here.
 */
export const APPLETS: ReadonlyMap<number, Applet> = new Map([
  [1000, applet('APP_NAVIGATOR', 'Icon_Navigator.dds', 'N')],
  [577, applet('APP_STATUS1', 'Icon_Status.dds', 'T')],
  [228, applet('APP_MAP', 'Icon_Applet.dds', 'M')],
  [728, applet('APP_LORD_SKILL', 'Icon_Infopang.dds', 'L')],
  [712, applet('APP_INFOPANG', 'Icon_Infopang.dds')],
  [811, applet('APP_HOUSING', 'Icon_Housing.dds', 'Y')],
  [853, applet('APP_GH_FURNITURE_STORAGE', 'Icon_Housing.dds', 'R')],
  [764, applet('APP_CHARACTER3', 'Icon_Character.dds', 'H')],
  [1003, applet('APP_INVENTORY', 'Icon_Inventory.dds', 'I')],
  [400, applet('APP_WEBBOX', 'Icon_CitemMall.dds')],
  [622, applet('APP_SKILL3', 'Icon_Skill.dds', 'K')],
  [172, applet('APP_MOTION', 'Icon_Motion.dds', 'O')],
  [1009, applet('APP_TRADE', 'Icon_Trade.dds')],
  [591, applet('APP_VENDOR_REVISION', 'Icon_Applet.dds')],
  [859, applet('APP_QUEST_EX_LIST', 'Icon_Quest.dds', 'Q')],
  [195, applet('APP_PARTY', 'Icon_Troupe.dds', 'P')],
  [2023, applet('APP_TELEPORTER', 'Icon_Applet.dds', 'U')],
  [2024, applet('APP_ARENA_3V3', 'Icon_Applet.dds', 'Z')],
  [2026, applet('APP_DUNGEON_STATUS', 'Icon_Applet.dds')],
  [2025, applet('APP_DUNGEON_UI', 'Icon_Applet.dds', 'Y')], // BB_DUNGEON_UI_HOTKEY, _Common/DungeonUiInfo.h:6
  [323, applet('APP_GUILD', 'Icon_Troupe.dds', 'G')],
  [689, applet('APP_BAG_EX', 'Icon_BagBag.tga', 'B')],
  [398, applet('APP_COMM_ITEM', 'Icon_CItemTime.dds', 'J')],
  [394, applet('APP_TEST', 'Icon_Troupe.dds')],
  [493, applet('APP_PIERCING', 'Icon_Troupe.dds')],
  [1014, applet('APP_COMMUNICATION_CHAT', 'Icon_Chat.dds')],
  [302, applet('APP_MESSENGER_EX', 'Icon_Messenger.dds', 'E')],
  [1061, applet('APP_OPTION_SOUND', 'Icon_OptSound.dds')],
  [163, applet('APP_OPTION_WINDOW', 'Icon_Applet.dds')],
  [1065, applet('APP_OPTION_MYINFO', 'Icon_Applet.dds')],
  [412, applet('APP_OPTIONEX', 'Icon_Applet.dds')],
  [1030, applet('APP_INFO_NOTICE', 'Icon_Applet.dds')],
  [1040, applet('APP_HELPER_HELP', 'Icon_HelperHelp.dds')],
  [1041, applet('APP_HELPER_TIP', 'Icon_HelperTip.dds')],
  [1042, applet('APP_HELPER_FAQ', 'Icon_HelperFAQ.dds')],
  [1100, applet('APP_LOGOUT', 'Icon_Logout.dds')],
  [1101, applet('APP_QUIT', 'Icon_Quit.dds')],
  [2016, applet('APP_WEBBOX2', 'QOODO.dds')],
  [2002, applet('APP_WORLD', 'Icon_Applet.dds')],
  [2004, applet('APP_DEBUGINFO', 'Icon_Applet.dds')],
  [501, applet('APP_LOGIN', 'Icon_Login.dds')],
  [502, applet('APP_SELECT_SERVER', 'Icon_SelectServer.dds')],
  [503, applet('APP_CREATE_CHAR', 'Icon_CreateChar.dds')],
  [504, applet('APP_SELECT_CHAR', 'Icon_SelectChar.dds')],
  [593, applet('APP_PARTY_QUICK', null)],
  [597, applet('APP_BUFF_STATUS', null)],
  [813, applet('APP_COUPLE_MAIN', 'Icon_Couple.dds', 'F')],
  [875, applet('APP_2ND_PASSWORD_NUMBERPAD', 'Icon_Applet.dds')],
]);

/** The `APP_*` ids this file names (`Resource/ResData.h`). */
const APP_STATUS1 = 577;
const APP_CHARACTER3 = 764;
const APP_SKILL3 = 622;
const APP_LOGOUT = 1100;

/** The windows of Piece 4 a press on the task bar opens. */
export type TaskBarWindow = 'character' | 'status' | 'skills';

/**
 * The applets whose window Piece 4 has, which `ObjectExecutor` opens (or closes) when they are pressed: from the Start
 * menu, a slot or their hotkey. The skill window (`APP_SKILL3`) is milestone 2's, which adds it here.
 */
const WINDOWS: ReadonlyMap<number, TaskBarWindow> = new Map([
  [APP_STATUS1, 'status'],
  [APP_CHARACTER3, 'character'],
]);

/**
 * The hotkeys the task bar reads (`CWndTaskBar::Process`, `WndTaskBar.cpp:2359-2388`): those of the applets of `WINDOWS`,
 * by the letter of their key (`KeyH`). APP_STATUS1's T is the status window's own (`Hud`), so it is not read twice.
 */
const HOTKEYS: ReadonlyMap<string, number> = new Map(
  [...WINDOWS.keys()]
    .filter((id) => id !== APP_STATUS1)
    .map((id) => [APPLETS.get(id)!.hotkey!, id] as const),
);

/**
 * The lines of `CWndTaskMenu` (`WndTaskBar.cpp:2595-2641`) that Piece 4 has, in its order, with the plan's texts. A line
 * whose window Piece 4 lacks (Skills, until milestone 2) is greyed.
 */
const MENU: ReadonlyArray<{ id: number; text: string }> = [
  { id: APP_STATUS1, text: 'Status' },
  { id: APP_CHARACTER3, text: 'Character' },
  { id: APP_SKILL3, text: 'Skills' },
  { id: APP_LOGOUT, text: 'Log out' },
];

/** What a press on the task bar asks its owner for. */
export interface TaskBarActions {
  /** Opens a window of Piece 4, or closes it if it is open (`ObjectExecutor` on an applet). */
  open(window: TaskBarWindow): void;
  /** Leaves the world (the Start menu's Log out). */
  logOut(): void;
  /** Uses slot `slot` (0-8) of bar `bar` (0-7), an item or a skill: F1-F9 or a press on it (`ObjectExecutor`). */
  useSlot(bar: number, slot: number): void;
  /** Uses the action slot: its button, or C (`CWndWorld::UseSkill`, milestone 2). */
  useActionSlot(): void;
}

/** The catalogs the bar draws with. */
export interface TaskBarData {
  /** The item catalog: an item shortcut's icon (`WebItemProp.icon`). */
  itemProps: ReadonlyMap<number, Pick<WebItemProp, 'icon'>>;
  /**
   * The skills catalog of milestone 2 (`GameData.skills`, by skill id): a skill's icon key and `dwComboStyle`. Without it
   * a skill is a plain slot.
   */
  skills?: ReadonlyMap<number, { icon: string | null; comboStyle: number }>;
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
/** `CT_STEP` and `CT_GENERAL` (`Resource/defineAttribute.h:16-19`). */
const CT_STEP = 1;
const CT_GENERAL = 4;
/** `LV2MAXAP` ... `LV5MAXAP` (`WndTaskBar.cpp:1037-1040`): the action points that light the 2nd to 5th action slot. */
const AP_STEPS = [10, 25, 50, 100] as const;

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

/** What Escape does (`escapeStep`). */
export type EscapeStep = 'revive' | 'none' | 'target' | 'window' | 'menu';

/**
 * Escape's order in `CWndMgr::Process` (`WndManager.cpp:3295-3427`; the world map's first branch, :3304-3309, is not
 * Piece 4's): the player dead, the revive window opens (:3311-3318); else, with the Start menu open, nothing (:3321); else
 * a target to clear (the next one queued or the focus, `AttackLoop.escape`, :3323-3368); else the window Escape closes
 * (`escapeWindow`, the status window passed over, :3383-3420); else, with no such window, the Start menu opens
 * (`OpenMenu`, :3421-3427).
 */
export function escapeStep(state: { dead: boolean; menuOpen: boolean; target: boolean; window: boolean }): EscapeStep {
  if (state.dead) return 'revive';
  if (state.menuOpen) return 'none';
  if (state.target) return 'target';
  return state.window ? 'window' : 'menu';
}

/** What a slot shows: its kind ('' for an empty one), greyed or not, its icon (an asset key), its count and hotkey. */
interface SlotView {
  kind: '' | 'item' | 'skill' | 'applet' | 'plain';
  greyed: boolean;
  icon: string | null;
  count: string;
  hotkey: string;
}

const EMPTY_VIEW: SlotView = { kind: '', greyed: false, icon: null, count: '', hotkey: '' };
/** A shortcut Piece 4 has nothing to draw with: a plain greyed slot. */
const PLAIN_VIEW: SlotView = { kind: 'plain', greyed: true, icon: null, count: '', hotkey: '' };

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

/**
 * The bars as `CWndTaskBar::Serialize` loads them (`WndTaskBar.cpp:315-400`): the applet row, the 8 bars of 9 slots and
 * the action slot, each shortcut with `m_dwItemId` (`itemIds`, by the same place) where it is an item shortcut whose object
 * the inventory has.
 */
interface LoadedBars {
  applets: Shortcut[];
  items: Shortcut[][];
  queue: Shortcut[];
  itemIds: Map<Shortcut[], Array<number | null>>;
}

/** Whether the key comes from a field being typed in, which the game's keys leave alone. */
function typing(target: EventTarget | null): boolean {
  const tag = (target as { tagName?: string } | null)?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA';
}

/**
 * The task bar. Its `element` goes in the windows' layer, at whose bottom it lays the bar out for the layer's width
 * (`taskBarLayout`, again when the window is resized), and sets the layer's `--hud-taskbar-height` to the bar's height on
 * screen; the Start menu opens above the bar's left end, over the windows. `update` draws the own character's bars each
 * frame (redrawing only what changed). It reads the keys of the window it is in until `dispose`: F1-F9 (with F5's reload,
 * and the browser's other uses of them, prevented), 1-8, the hotkeys of the applets of Piece 4's windows (H) and C.
 * Escape is its owner's (`escapeStep`).
 */
export class TaskBar {
  /** Holds the bar (`.hud-taskbar-strip`) and the Start menu; takes no press itself. */
  readonly element: HTMLElement;
  /** Called as the Start menu opens (true) or closes (false). */
  onMenuChange?: (open: boolean) => void;
  private readonly strip: HTMLElement;
  private readonly doc: Document;
  private readonly view: Window;
  private readonly start: HTMLButtonElement;
  private readonly menu: HTMLElement;
  private readonly up: HTMLButtonElement;
  private readonly down: HTMLButtonElement;
  private readonly number: HTMLElement;
  private readonly action: HTMLButtonElement;
  private readonly shade: HTMLElement;
  private appletSlots: SlotElement[] = [];
  private itemSlots: SlotElement[] = [];
  private queueSlots: SlotElement[] = [];
  /** `m_nSlotIndex`: the bar shown, 0 to 7; 0 on every entry (`CWndTaskBar::CWndTaskBar`, :506). */
  private slotIndex = 0;
  /** The TASKBAR message the bars were loaded from, and the bars as loaded (and changed since, as Neuz changes them). */
  private loadedFrom: TaskBarMessage | null = null;
  private loaded: LoadedBars = TaskBar.load(null, null, {});
  private layout: TaskBarLayout = taskBarLayout(0);
  /** The window was resized (or the bar not yet laid out in a layer with a width): `update` lays it out again. */
  private dirty = true;

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

    this.start = this.button('hud-taskbar-start', () => this.toggleMenu());
    this.start.setAttribute('aria-label', 'Start');
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

    this.menu = this.makeMenu();
    strip.append(this.start, this.up, this.down, this.number, this.action);
    // the menu beside the bar, not in it: a bar drawn smaller is a layer of its own, which would keep the menu under the
    // windows
    element.append(strip, this.menu);

    this.view.addEventListener('keydown', this.onKeyDown);
    this.view.addEventListener('keyup', this.onKeyUp);
    this.view.addEventListener('resize', this.onResize);
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
    return !this.menu.hidden;
  }

  /** Opens the Start menu above the bar's left end (`OpenMenu`, placed as `OnChildNotify` places it, :1392-1394). */
  openMenu(): void {
    if (this.menuOpen) return;
    this.menu.hidden = false;
    this.start.setAttribute('aria-expanded', 'true');
    this.doc.addEventListener('pointerdown', this.onPressOutside, true);
    this.onMenuChange?.(true);
  }

  /** Closes the Start menu (`SetVisible( FALSE )`). */
  closeMenu(): void {
    if (!this.menuOpen) return;
    this.menu.hidden = true;
    this.start.setAttribute('aria-expanded', 'false');
    this.doc.removeEventListener('pointerdown', this.onPressOutside, true);
    this.onMenuChange?.(false);
  }

  /**
   * Draws the own character's bars: the TASKBAR it last had (`OwnState.taskBar`; the bars are loaded anew when a new one
   * comes), with its inventory and skills and `data`'s catalogs. Before any TASKBAR, or with no own numbers (`own`
   * undefined), the bars are empty (`InitTaskBar`), and the rest of the bar is drawn all the same.
   */
  update(own: OwnState | undefined, data: TaskBarData): void {
    if (this.dirty) this.relayout();
    const message = own?.taskBar ?? null;
    if (message !== this.loadedFrom) {
      this.loadedFrom = message;
      this.loaded = TaskBar.load(own ?? null, message, data);
    }
    const { applets, items, queue } = this.loaded;
    const view = (row: Shortcut[], i: number): SlotView => (own === undefined ? EMPTY_VIEW : this.slotView(row, i, own, data));
    this.appletSlots.forEach((slot, i) => this.draw(slot, view(applets, i)));
    const bar = items[this.slotIndex]!;
    this.itemSlots.forEach((slot, i) => this.draw(slot, view(bar, i)));
    // m_nCurQueueNum slots of the action slot (:1017-1032)
    this.queueSlots.forEach((slot, i) => this.draw(slot, i < queue.length ? view(queue, i) : EMPTY_VIEW));
    const number = String(this.slotIndex + 1);
    if (this.number.textContent !== number) this.number.textContent = number;
    this.drawActionPoints(message?.actionPoint ?? 0);
  }

  /** Takes the bar off and lets go of the keys. */
  dispose(): void {
    this.closeMenu();
    this.view.removeEventListener('keydown', this.onKeyDown);
    this.view.removeEventListener('keyup', this.onKeyUp);
    this.view.removeEventListener('resize', this.onResize);
    this.element.remove();
  }

  /**
   * `CWndTaskBar::Serialize`'s loading (`WndTaskBar.cpp:315-400`) of `message` (none: `InitTaskBar`'s empty bars):
   * - an applet-row skill that is not `CT_STEP` or `CT_GENERAL` is emptied (:330-343); this needs the skills catalog, and
   *   without it (milestone 1) the skill stays, drawn plain; a party skill (`m_dwType` 2) has no row there and stays;
   * - an item shortcut keeps the item ID of its object, `m_dwItemId` (:345-357, :368-380), which finds another stack of
   *   that item when the object goes (`slotView`). Neuz keeps it for a stackable item (`dwPackMax > 1`), a column the item
   *   catalog lacks: it is kept for every item.
   * The entries are applied in order, a later one for the same slot replacing the first.
   */
  private static load(own: OwnState | null, message: TaskBarMessage | null, data: Pick<TaskBarData, 'skills'>): LoadedBars {
    const applets = Array.from({ length: MAX_SLOT_APPLET }, () => EMPTY);
    const items = Array.from({ length: MAX_SLOT_ITEM_COUNT }, () => Array.from({ length: MAX_SLOT_ITEM }, () => EMPTY));
    const itemIds = new Map<Shortcut[], Array<number | null>>();
    const remember = (row: Shortcut[], i: number, shortcut: Shortcut): void => {
      if (shortcut.kind !== ShortcutKind.ITEM) return;
      const item = own?.inventory?.get(shortcut.id);
      if (item === undefined) return;
      if (!itemIds.has(row)) itemIds.set(row, []);
      itemIds.get(row)![i] = item.itemId;
    };
    for (const { slot, shortcut } of message?.applets ?? []) {
      applets[slot] = TaskBar.appletRowSkillKept(own, shortcut, data) ? shortcut : EMPTY;
      remember(applets, slot, shortcut);
    }
    for (const { bar, slot, shortcut } of message?.items ?? []) {
      items[bar]![slot] = shortcut;
      remember(items[bar]!, slot, shortcut);
    }
    const queue = (message?.queue ?? []).slice(0, MAX_SLOT_QUEUE);
    return { applets, items, queue, itemIds };
  }

  /** `:330-343`: a skill of the applet row stays only as a `CT_STEP` or `CT_GENERAL` one (see `load`). */
  private static appletRowSkillKept(own: OwnState | null, shortcut: Shortcut, data: Pick<TaskBarData, 'skills'>): boolean {
    if (shortcut.kind !== ShortcutKind.SKILL || shortcut.type === 2 || data.skills === undefined) return true;
    const skillId = own?.skills[shortcut.id]?.skill;
    const prop = skillId === undefined ? undefined : data.skills.get(skillId);
    return prop !== undefined && (prop.comboStyle === CT_STEP || prop.comboStyle === CT_GENERAL);
  }

  /**
   * What slot `i` of `row` shows (`SetTaskBarTexture`, `WndTaskBar.cpp:403-476`, and `OnDraw`, :821-1009):
   * - an applet: its icon (none for an id the live build does not register, as `GetAppletFunc` finds nothing), and its
   *   hotkey over it (:889-896);
   * - an item: its icon and `m_Inventory.GetItemCount( m_dwItemId )` (:836-847, :946-957; Neuz prints it for a stackable
   *   item, `dwPackMax > 1`, a column the item catalog lacks: it is printed for every item), greyed until items are used
   *   (Piece 5). An object that is gone takes the first other stack of the item it was loaded with (`m_Inventory.Find`,
   *   :859-881 and `UpdateItem`, :1114-1138), or empties the slot; Neuz tells the server either way, which comes with the
   *   bar's edits in milestone 2. With no inventory (it could not be read) an item is a plain greyed slot;
   * - a skill: its icon from the skills catalog (milestone 2), a plain greyed slot without it;
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
        };
      }
      case ShortcutKind.ITEM:
        return this.itemView(row, i, own, data);
      case ShortcutKind.SKILL: {
        const skillId = shortcut.type === 2 ? undefined : own.skills[shortcut.id]?.skill;
        const icon = skillId === undefined ? null : data.skills?.get(skillId)?.icon ?? null;
        return icon === null ? PLAIN_VIEW : { kind: 'skill', greyed: false, icon, count: '', hotkey: '' };
      }
      default:
        return PLAIN_VIEW;
    }
  }

  /** An item shortcut's view (see `slotView`). */
  private itemView(row: Shortcut[], i: number, own: OwnState, data: TaskBarData): SlotView {
    const inventory = own.inventory;
    if (inventory === null) return PLAIN_VIEW;
    let item = inventory.get(row[i]!.id);
    if (item === undefined) {
      const itemId = this.loaded.itemIds.get(row)?.[i] ?? null;
      item = itemId === null ? undefined : [...inventory.values()].find((other) => other.itemId === itemId);
      row[i] = item === undefined ? EMPTY : { ...row[i]!, id: item.objectId };
      if (item === undefined) return EMPTY_VIEW;
    }
    const itemId = item.itemId;
    let count = 0;
    for (const other of inventory.values()) if (other.itemId === itemId) count += other.count;
    return { kind: 'item', greyed: true, icon: data.itemProps.get(itemId)?.icon ?? null, count: String(count), hotkey: '' };
  }

  /** Puts `view` in `slot`, if it is not what it shows. */
  private draw(slot: SlotElement, view: SlotView): void {
    const shown = `${view.kind}|${view.greyed}|${view.icon ?? ''}|${view.count}|${view.hotkey}`;
    if (slot.shown === shown) return;
    slot.shown = shown;
    if (view.kind === '') delete slot.element.dataset.kind;
    else slot.element.dataset.kind = view.kind;
    slot.element.toggleAttribute('data-greyed', view.greyed);
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

  /** Lays the bar out for its layer's width (`taskBarLayout`): its picture, its controls, its slots. */
  private relayout(): void {
    const parent = this.element.parentElement;
    const width = parent?.clientWidth ?? 0;
    // a layer not laid out yet is tried again at the next update
    this.dirty = width === 0;
    const layout = taskBarLayout(width);
    this.layout = layout;
    const strip = this.strip;
    const scale = layout.scale === 1 ? '' : `scale(${layout.scale})`;
    strip.style.width = `${layout.width}px`;
    strip.style.backgroundImage = themeUrl(this.art, layout.picture);
    strip.style.transform = scale;
    strip.dataset.layout = String(layout.width);
    this.menu.style.bottom = `${TASKBAR_HEIGHT * layout.scale}px`;
    this.menu.style.transform = scale;
    parent?.style.setProperty('--hud-taskbar-height', `${TASKBAR_HEIGHT * layout.scale}px`);

    this.placeRect(this.up, layout.up);
    this.placeRect(this.down, layout.down);
    // the bar's number at the up arrow's left, 2 px over its bottom (:1085-1088)
    this.number.style.left = `${layout.up.left}px`;
    this.number.style.top = `${layout.up.bottom - 2}px`;
    // the action slot's button left of it, 5 px apart (:1011-1012)
    this.place(this.action, layout.queueX - ICON_SIZE - 5, SLOT_TOP, ICON_SIZE, ICON_SIZE);
    this.shade.style.top = `${SLOT_TOP}px`;
    this.shade.style.height = `${SKILL_SIZE + 2}px`;

    for (const slot of [...this.appletSlots, ...this.itemSlots, ...this.queueSlots]) slot.element.remove();
    this.appletSlots = this.makeSlots('applet', layout.applets, layout.appletX, ICON_SIZE, (i) => this.pressApplet(i));
    this.itemSlots = this.makeSlots('item', MAX_SLOT_ITEM, layout.itemX, ICON_SIZE, (i) => this.useItemSlot(i));
    this.queueSlots = this.makeSlots('queue', MAX_SLOT_QUEUE, layout.queueX, SKILL_SIZE, () => {});
    // the shade over the action slot
    strip.append(...[...this.appletSlots, ...this.itemSlots, ...this.queueSlots].map((slot) => slot.element), this.shade);
  }

  /** `count` slots of `size` px from `left`, `size` apart, at the rows' top. */
  private makeSlots(row: string, count: number, left: number, size: number, press: (i: number) => void): SlotElement[] {
    return Array.from({ length: count }, (_, i) => {
      const element = this.button('hud-slot', () => press(i));
      element.dataset.row = row;
      element.dataset.slot = String(i);
      this.place(element, left + i * size, SLOT_TOP, size, size);
      const icon = this.doc.createElement('span');
      icon.className = 'hud-slot-icon';
      const count = this.doc.createElement('span');
      count.className = 'hud-slot-count';
      const hotkey = this.doc.createElement('span');
      hotkey.className = 'hud-slot-hotkey';
      element.append(icon, count, hotkey);
      return { element, icon, count, hotkey, shown: null };
    });
  }

  /** The Start menu (`CWndTaskMenu`): Piece 4's lines, each with its applet's icon (`CWndTaskMenu::SetTexture`, :2579-2582). */
  private makeMenu(): HTMLElement {
    const menu = this.doc.createElement('div');
    menu.className = 'hud-taskbar-menu';
    menu.setAttribute('role', 'menu');
    menu.hidden = true;
    for (const { id, text } of MENU) {
      const item = this.doc.createElement('button');
      item.type = 'button';
      item.setAttribute('role', 'menuitem');
      item.disabled = id !== APP_LOGOUT && !WINDOWS.has(id);
      const icon = this.doc.createElement('span');
      icon.className = 'hud-menu-icon';
      icon.style.backgroundImage = themeUrl(this.art, APPLETS.get(id)!.icon!);
      item.append(icon, text);
      // a line pressed runs its applet (OnChildNotify, :2806-2811) and the menu goes
      item.addEventListener('click', () => {
        this.closeMenu();
        this.execute(id);
      });
      menu.append(item);
    }
    return menu;
  }

  /** `OpenMenu` (`WndManager.cpp:2302-2322`): the Start button shows the menu, or hides it if it shows. */
  private toggleMenu(): void {
    if (this.menuOpen) this.closeMenu();
    else this.openMenu();
  }

  /**
   * `ObjectExecutor( SHORTCUT_APPLET, id )` (`WndManager.cpp:2566-2700`) for Piece 4: an applet of its windows opens (or
   * closes) it, `APP_LOGOUT` leaves (Neuz asks first, `CWndLogOut`, and refuses while attacking; Piece 4's Log out leaves
   * as Piece 3's Leave did), and the others do nothing.
   */
  private execute(id: number): void {
    const window = WINDOWS.get(id);
    if (window !== undefined) this.actions.open(window);
    else if (id === APP_LOGOUT) this.actions.logOut();
  }

  /** A press on applet slot `i`: an applet runs (`OnChildNotify`'s `ObjectExecutor`, :1407-1416); the rest is milestone 2's. */
  private pressApplet(i: number): void {
    const shortcut = this.loaded.applets[i]!;
    if (shortcut.kind === ShortcutKind.APPLET) this.execute(shortcut.id);
  }

  /**
   * Slot `i` of the bar shown, pressed or by its F-key (`ObjectExecutor( lpShortcut )`, :2409-2427): an applet runs, an empty
   * slot is nothing, and the rest is the owner's (`useSlot`).
   */
  private useItemSlot(i: number): void {
    const shortcut = this.loaded.items[this.slotIndex]![i]!;
    if (shortcut.kind === ShortcutKind.NONE) return;
    if (shortcut.kind === ShortcutKind.APPLET) this.execute(shortcut.id);
    else this.actions.useSlot(this.slotIndex, i);
  }

  private button(className: string, press: () => void): HTMLButtonElement {
    const button = this.doc.createElement('button');
    button.type = 'button';
    button.className = className;
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
   * The keys the task bar reads, once a press (a held F-key repeats, as Neuz's key table does): F1-F9 the slots of the bar
   * shown (`CWndTaskBar::Process`, :2395-2427; F10, which reads past the bar into the next one's first slot, is not
   * copied), 1-8 the bar (`CWndMgr::Process`, `WndManager.cpp:3541-3582`), and the hotkeys of Piece 4's windows (:2359-2388).
   * Not with Ctrl, Alt or Meta, nor while typing in a field.
   */
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.altKey || event.metaKey || typing(event.target)) return;
    const fKey = /^F([1-9])$/.exec(event.code);
    if (fKey !== null) {
      // F5 would reload the page, F1 open the browser's help...
      event.preventDefault();
      this.useItemSlot(Number(fKey[1]) - 1);
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
    if (id !== undefined) this.execute(id);
  };

  /** C as it is let go: the action slot (`CWndWorld::OnKeyUp`, `WndWorld.cpp:7712-7729`, the default interface). */
  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.altKey || event.metaKey || typing(event.target)) return;
    if (event.code === 'KeyC') this.actions.useActionSlot();
  };

  private readonly onResize = (): void => {
    this.dirty = true;
  };

  /** A press outside the menu and the Start button closes the menu (`CWndTaskMenu::OnKillFocus`, :2795-2799). */
  private readonly onPressOutside = (event: Event): void => {
    const target = event.target as Node | null;
    if (target !== null && (this.menu.contains(target) || this.start.contains(target))) return;
    this.closeMenu();
  };
}

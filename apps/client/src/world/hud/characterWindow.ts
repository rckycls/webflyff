// The Character window (spec §3.6, [stats §3.1-3.4]): `CWndCharacter` (APP_CHARACTER3) and the page of its first tab,
// `CWndCharInfo`: the name, job, level, server and channel; ATK, DEF, critical and attack speed; the four stats with the
// counts of the points being placed, their preview, the stat points left, Apply (which asks first, `StateConfirm`) and
// Reset. H, the task bar's applet and the Start menu open and close it (`CWndMgr::ObjectExecutor`).
//
//   resdata.inc APP_CHARACTER3      Resource/resdata.inc:22746-22766  "Wndtile00.tga" tiled, 208 x 512, a caption, titled
//                                                                     "Character" (IDS_RESDATA_INC_005936, Resource/
//                                                                     resData.txt.txt:5937); the tab control WIDC_TABCTRL1 at
//                                                                     (8, 12) to (204, 466)
//   CWndCharacter::OnInitialUpdate  _Interface/WndField.cpp:4269-4336  the tabs TID_GAME_TITLE_CHAR_INFO (chosen) and
//                                                                     TID_GAME_TITLE_HONOR
//   CWndCharacter::Initialize       WndField.cpp:4337-4346             InitDialog at (0, 0) (CWndNeuz::InitDialog,
//                                                                     _Interface/WndNeuz.cpp:659-679)
//   CWndTabCtrl::InsertItem         _Interface/WndControl.cpp:4572-4608  a tab's page: the control less 18 px at the bottom
//   CWndTabCtrl::AdditionalSkinTexture  WndControl.cpp:4296-4458       the edit tiles under the pages, the strip of tabs
//   CWndTabCtrl::OnDraw             WndControl.cpp:4183-4285           the chosen tab, the titles
//   CWndCharInfo::OnInitialUpdate   WndField.cpp:3498-3607             WndNewCharacter01.tga, the boxes, + and -, Apply, Reset
//   CWndCharInfo::OnDraw            WndField.cpp:3012-3490             the texts and numbers
//   CWndCharInfo::OnChildNotify     WndField.cpp:3623-3758             typing a count, + and -, Apply, Reset
//   CWndCharInfo::Process           WndField.cpp:3784-3849             which controls are enabled, the points left
//   CWndCharInfo::GetVirtual*       WndField.cpp:3864-4056             the preview
//   CWndCharInfo::RenderATK         WndField.cpp:4057-4099             ATK
//
// The page's PVP/PK part (fame, PK value and propensity, :3449-3489) and the Fame/Master tab's page (CWndHonor) are not
// drawn: the browser reads none of their numbers (stats §3.2). The tooltips of the stat rows (:3298-3368) are not copied.

import { FISTS, attackShown, attackSpeed, criticalShown, defenceShown } from '../sim/params';
import type { Stats } from '../sim/params';
import type { OwnState } from '../OwnState';
import { cssRgb, themeUrl } from './art';
import type { UiArt } from './art';
import { pictureButton, place } from './button';
import type { ControlRect } from './button';
import { WindowFrame } from './frame';
import { StateConfirm } from './stateConfirm';
import { EDIT, TAB_TILE, TAB_TILE_HEIGHT, chosenTabTiles, editTiles, tabStripTiles } from './tiles';

/** The points being placed on each stat (`m_nStrCount`, `m_nStaCount`, `m_nDexCount`, `m_nIntCount`); MODIFY_STATUS's fields. */
export interface StatCounts {
  str: number;
  sta: number;
  dex: number;
  int: number;
}

/** What the window shows of the lobby's entry (`WorldEntry`): the character's name, and the server and channel picked. */
export interface CharacterEntry {
  character: { name: string };
  serverName: string;
  channelName: string;
}

/** The texts the window and its confirm box read (the texts catalog). */
export type CharacterTexts = ReadonlyMap<string, { text: string }>;

type Stat = keyof StatCounts;
const STATS: readonly Stat[] = ['str', 'sta', 'dex', 'int'];
const NO_COUNTS: StatCounts = { str: 0, sta: 0, dex: 0, int: 0 };

/** `JOB_VAGRANT` (`Resource/defineJob.h`): the one job of `JTYPE_BASE` (etc.inc's job block), which `IsBaseJob()` asks for. */
const JOB_VAGRANT = 0;

// ---- the window and its tab control --------------------------------------------------------------------------------

/** `APP_CHARACTER3 "Wndtile00.tga" 1 208 512` (resdata.inc:22746). */
const WIDTH = 208;
const HEIGHT = 512;
/** `IDS_RESDATA_INC_005936` (resData.txt.txt:5937): the applet's title (`CWndNeuz::OnInitialUpdate`, WndNeuz.cpp:210-216). */
const TITLE = 'Character';
/** `WIDC_TABCTRL1` (resdata.inc:22756): (8, 12) to (204, 466) in the client area. */
const TAB: ControlRect = { left: 8, top: 12, width: 196, height: 454 };
/** The tab control's tiles stop 15 px short of its right (`rect.right -= 15`, :4190, :4224, :4323, :4401). */
const TAB_RIGHT = 15;
/** The tab titles' line: 17 px over the control's bottom (`y = rectClient.bottom - 17`, :4225). */
const TAB_TITLE_UP = 17;
/** A tab's page: the control less the strip's 18 px at the bottom (`InsertItem`, :4586-4592). */
const TAB_STRIP = 18;
/** The tabs: `CWndCharacter::OnInitialUpdate` inserts the page and the Fame/Master page, the first chosen (:4290-4300). */
const TABS = ['TID_GAME_TITLE_CHAR_INFO', 'TID_GAME_TITLE_HONOR'] as const;
const CHOSEN_TAB = 0;
/** `WndNewCharacter01.tga`, the page's picture (:3502), 176 x 432, at the page's top left (the page is the tab's: at (0, 0)). */
const PAGE_PICTURE = 'WndNewCharacter01.tga';

// ---- the page: CWndCharInfo::OnDraw's places, from the page's top left -------------------------------------------------

/** `D3DCOLOR_ARGB( 255, 0, 0, 180 )`: the labels (:3170, :3374). */
const LABEL_COLOR = 0xff0000b4;
const BLACK = 0xff000000;
const WHITE = 0xffffffff;
const RED = 0xffff0000;
/** A stat raised by an item or a buff (`m_nStr < GetStr()`, :3251-3252). */
const BLUE = 0xff0000ff;
/** `(g_nRenderCnt / 8) & 1` (:3200, :3290): red every other 8 frames, at Neuz's 60 frames a second. */
const BLINK_MS = (8 * 1000) / 60;

/** The texts at fixed places: `TextOut( x, y, ... )` (`nyAdd3` 21, `nNext` 15, `nyAdd` 121). */
const HEADERS = [
  { id: 'TID_APP_CHARACTER_BASE', name: 'base', x: 60, y: 13 },
  { id: 'TID_APP_CHARACTER_DETAIL', name: 'detail', x: 60, y: 113 },
] as const;
const BASE_ROWS = [
  { id: 'TID_GAME_CHARACTER_01', name: 'name', y: 31 },
  { id: 'TID_APP_CHARACTER_JOB', name: 'job', y: 46 },
  { id: 'TID_GAME_CHARACTER_02', name: 'level', y: 61 },
  { id: 'TID_GAME_CHAR_SERVER', name: 'server', y: 76 },
  { id: 'TID_GAME_CHAR_SERVERNAME', name: 'channel', y: 91 },
] as const;
/** The values of the base part, at x 80 (`if( TRUE )`, the Japanese layout every language takes, :3044, :3122). */
const BASE_VALUE_X = 80;
const LABEL_X = 7;
/** The detail part: ATK and DEF at x 50, Critical and A.Speed at 140; their labels at 7 and 85 (:3190-3243, :3376-3380). */
const DETAIL_ROWS = [
  { id: 'TID_GAME_CHARACTER_13', name: 'atk', label: 7, value: 50, y: 131 },
  { id: 'TID_GAME_CHARACTER_14', name: 'critical', label: 85, value: 140, y: 131 },
  { id: 'TID_TOOLTIP_DEFENCE', name: 'def', label: 7, value: 50, y: 146 },
  { id: 'TID_GAME_CHARACTER_15', name: 'speed', label: 85, value: 140, y: 146 },
] as const;
/** The stats from y 173, 15 apart, at x 50 (`StatYPos`, :3244-3286); the stat points at (105, 233) (:3296). */
const STAT_LABELS: Record<Stat, string> = {
  str: 'TID_TOOLTIP_STR', sta: 'TID_TOOLTIP_STA', dex: 'TID_TOOLTIP_DEX', int: 'TID_TOOLTIP_INT',
};
const STAT_TOP = 173;
const STAT_X = 50;
const ROW = 15;
const POINTS = { id: 'TID_GAME_CHARACTER_07', x: 105, y: 233 } as const;
/**
 * The controls of `OnInitialUpdate` (:3522-3553), from `posY` 170 (49 + 121) and `posX` 128, a row 15 px apart: the count's
 * box `( posX - 38, posY, posX - 4, posY + 16 )`, + `( posX, posY + 2, posX + 14, posY + 18 )`, - 16 px right of +; Apply
 * and Reset 36 px under the last row, `( posX - 108, posY, posX - 58, posY + 22 )` and `( posX - 30, ... posX + 20, ... )`.
 */
const CONTROL_TOP = 170;
const CONTROL_X = 128;
const countRect = (row: number): ControlRect => ({ left: CONTROL_X - 38, top: CONTROL_TOP + row * ROW, width: 34, height: 16 });
const plusRect = (row: number): ControlRect => ({ left: CONTROL_X, top: CONTROL_TOP + row * ROW + 2, width: 14, height: 16 });
const minusRect = (row: number): ControlRect => ({ left: CONTROL_X + 16, top: CONTROL_TOP + row * ROW + 2, width: 14, height: 16 });
const APPLY: ControlRect = { left: CONTROL_X - 108, top: CONTROL_TOP + 3 * ROW + 36, width: 50, height: 22 };
const RESET: ControlRect = { left: CONTROL_X - 30, top: CONTROL_TOP + 3 * ROW + 36, width: 50, height: 22 };
/** The count's box draws its 16 px text (the least iOS types in without zooming) at the window's 12 px: 12 / 16. */
const COUNT_SCALE = 0.75;
/** ButtCharPlus.bmp and ButtCharMinus.bmp are 56 x 14, ButtCharApply.tga and ButtCharReset.tga 200 x 20: four states each. */
const PLUS_QUARTER = 14;
const APPLY_QUARTER = 50;
/**
 * The names of + and - for a screen reader: the stat's text and the sign on the button's picture (ButtCharPlus.bmp,
 * ButtCharMinus.bmp; the C++ creates both with the title "<", :3527-3540).
 */
const PLUS_SIGN = '+';
const MINUS_SIGN = '-';

/** A value of the page: its element, and what it shows, kept to touch the DOM only when it changes. */
interface Value {
  element: HTMLElement;
  text: string;
  color: number;
  preview: boolean;
}

/**
 * The Character window. Its `frame` and its confirm box's (`confirm.frame`) go in the windows' layer; `toggle` opens it
 * at the top left (`InitDialog` at (0, 0)) or closes it, as `ObjectExecutor` creates or destroys the applet
 * (WndManager.cpp:2650-2700); `update` is given the own numbers and the lobby's entry each frame and draws them. Closing
 * it forgets the counts and the confirm box, as `Destroy` deletes the page with them. Apply, after Yes, calls `onApply`
 * with the counts (MODIFY_STATUS).
 */
export class CharacterWindow {
  readonly frame: WindowFrame;
  readonly confirm: StateConfirm;
  private countsNow: StatCounts = { ...NO_COUNTS };
  /** The own numbers of the last `update`: `GetRemainGP()` for the controls, `IsBaseJob()` for the confirm box. */
  private own: OwnState | undefined;
  private readonly values = new Map<string, Value>();
  private readonly plus: Record<Stat, HTMLButtonElement>;
  private readonly minus: Record<Stat, HTMLButtonElement>;
  private readonly inputs: Record<Stat, HTMLInputElement>;
  private readonly apply: HTMLButtonElement;
  private readonly reset: HTMLButtonElement;
  private readonly mobile: boolean;

  constructor(
    art: UiArt,
    private readonly texts: CharacterTexts,
    private readonly onApply: (counts: StatCounts) => void,
    doc: Document = document,
  ) {
    const mobile = doc.defaultView?.matchMedia?.('(max-width: 1000px) and (pointer: coarse)').matches === true;
    this.mobile = mobile;
    const tabRect = mobile ? { left: 8, top: 12, width: 464, height: 272 } : TAB;
    const frame = new WindowFrame(TITLE, art, mobile
      ? { width: 480, height: 320, mobileScale: 1, fitWhole: true }
      : { width: WIDTH, height: HEIGHT }, doc);
    frame.element.classList.add('hud-character');
    frame.element.classList.toggle('hud-character-landscape', mobile);
    frame.onClose = () => {
      // Destroy: the page and its counts go, and the confirm box's Yes would find no page (:4490-4500)
      this.countsNow = { ...NO_COUNTS };
      this.confirm.close();
      this.process();
    };
    this.frame = frame;
    this.confirm = new StateConfirm(art, texts, () => this.applyCounts(), doc);

    const tab = doc.createElement('div');
    tab.className = 'hud-char-tab';
    place(tab, tabRect);
    const columns = Math.trunc((tabRect.width - TAB_RIGHT) / EDIT);
    tab.append(editTiles(doc, art, columns, Math.trunc(tabRect.height / EDIT)));
    tab.append(...this.tabStrip(doc, art, columns, tabRect));

    const page = doc.createElement('div');
    page.className = 'hud-char-page';
    place(page, { left: 0, top: 0, width: tabRect.width - (mobile ? 16 : 0), height: tabRect.height - TAB_STRIP });
    if (!mobile) page.style.backgroundImage = themeUrl(art, PAGE_PICTURE);
    tab.append(page);
    frame.body.append(tab);

    const label = (id: string, name: string, x: number, y: number, color = LABEL_COLOR): HTMLElement => {
      const element = this.textAt(doc, x, y);
      element.dataset.label = name;
      element.textContent = this.text(id);
      element.style.color = cssRgb(color);
      return element;
    };
    const value = (name: string, x: number, y: number): HTMLElement => {
      const element = this.textAt(doc, x, y);
      element.dataset.value = name;
      element.style.color = cssRgb(BLACK);
      this.values.set(name, { element, text: '', color: BLACK, preview: false });
      return element;
    };
    // in the order OnDraw puts them on the page: the headers in black, the labels in blue
    page.append(label(HEADERS[0].id, HEADERS[0].name, HEADERS[0].x, HEADERS[0].y, BLACK));
    for (const row of BASE_ROWS) page.append(label(row.id, row.name, LABEL_X, row.y), value(row.name, BASE_VALUE_X, row.y));
    page.append(label(HEADERS[1].id, HEADERS[1].name, HEADERS[1].x, HEADERS[1].y, BLACK));
    for (const row of DETAIL_ROWS) page.append(label(row.id, row.name, row.label, row.y), value(row.name, row.value, row.y));
    STATS.forEach((stat, i) => {
      page.append(label(STAT_LABELS[stat], stat, LABEL_X, STAT_TOP + i * ROW), value(stat, STAT_X, STAT_TOP + i * ROW));
    });
    const points = label(POINTS.id, 'points', LABEL_X, POINTS.y);
    points.title = this.text('TID_TOOLTIP_CHARSTATUS_GPPOINT');
    page.append(points, value('points', POINTS.x, POINTS.y));

    const plus = {} as Record<Stat, HTMLButtonElement>;
    const minus = {} as Record<Stat, HTMLButtonElement>;
    const inputs = {} as Record<Stat, HTMLInputElement>;
    STATS.forEach((stat, i) => {
      const input = doc.createElement('input');
      input.type = 'text';
      input.setAttribute('inputmode', 'numeric');
      input.setAttribute('autocomplete', 'off');
      input.className = 'hud-char-count';
      input.dataset.count = stat;
      input.value = '0';
      input.setAttribute('aria-label', this.text(STAT_LABELS[stat]));
      input.title = this.text('TID_TOOLTIP_CHARSTATUS_EDIT');
      // its text is 16 px drawn at three quarters (the style sheet's .hud-char-count: iOS zooms into a smaller field)
      const rect = countRect(i);
      place(input, { ...rect, width: rect.width / COUNT_SCALE, height: rect.height / COUNT_SCALE });
      input.style.lineHeight = `${rect.height / COUNT_SCALE}px`;
      input.addEventListener('input', () => this.typed(stat));
      // a box typed in keeps its keys from the game (the moves' keys, the task bar's digits), as the task bar and the
      // status window already pass over a field; Escape still reaches the windows
      for (const type of ['keydown', 'keyup'] as const) {
        input.addEventListener(type, (event) => {
          if (event.key !== 'Escape') event.stopPropagation();
        });
      }
      inputs[stat] = input;
      const button = (name: string, picture: string, at: ControlRect, sign: string, step: 1 | -1) => {
        const element = pictureButton(doc, art, picture, at, PLUS_QUARTER, () => this.step(stat, step));
        element.dataset.button = `${stat}-${name}`;
        element.setAttribute('aria-label', `${this.text(STAT_LABELS[stat])} ${sign}`);
        return element;
      };
      plus[stat] = button('plus', 'ButtCharPlus.bmp', plusRect(i), PLUS_SIGN, 1);
      minus[stat] = button('minus', 'ButtCharMinus.bmp', minusRect(i), MINUS_SIGN, -1);
      page.append(input, plus[stat], minus[stat]);
    });
    this.plus = plus;
    this.minus = minus;
    this.inputs = inputs;
    const button = (name: string, picture: string, at: ControlRect, tooltip: string, press: () => void) => {
      const element = pictureButton(doc, art, picture, at, APPLY_QUARTER, press);
      element.dataset.button = name;
      element.title = this.text(tooltip);
      return element;
    };
    this.apply = button('apply', 'ButtCharApply.tga', APPLY, 'TID_TOOLTIP_CHARSTATUS_APPLY', () => this.askApply());
    this.reset = button('reset', 'ButtCharReset.tga', RESET, 'TID_TOOLTIP_CHARSTATUS_RESET', () => {
      if (!this.anyCount()) return;
      this.countsNow = { ...NO_COUNTS };
      this.process();
    });
    page.append(this.apply, this.reset);
    if (mobile) {
      const move = (selector: string, left: number, top: number) => {
        const element = page.querySelector<HTMLElement>(selector)!;
        element.style.left = `${left}px`;
        element.style.top = `${top}px`;
      };
      move('[data-label="base"]', 76, 14);
      BASE_ROWS.forEach((row, i) => {
        move(`[data-label="${row.name}"]`, 8, 38 + i * 20);
        move(`[data-value="${row.name}"]`, 100, 38 + i * 20);
      });
      move('[data-label="detail"]', 76, 150);
      DETAIL_ROWS.forEach((row) => {
        const right = row.name === 'critical' || row.name === 'speed';
        const top = row.name === 'atk' || row.name === 'critical' ? 176 : 196;
        move(`[data-label="${row.name}"]`, right ? 106 : 8, top);
        move(`[data-value="${row.name}"]`, right ? 180 : 44, top);
      });
      move('[data-label="points"]', 236, 14);
      move('[data-value="points"]', 360, 14);
      STATS.forEach((stat, i) => {
        const top = 38 + i * 20;
        move(`[data-label="${stat}"]`, 236, top);
        move(`[data-value="${stat}"]`, 294, top);
        move(`[data-count="${stat}"]`, 340, top - 3);
        move(`[data-button="${stat}-plus"]`, 388, top);
        move(`[data-button="${stat}-minus"]`, 424, top);
      });
      move('[data-button="apply"]', 252, 174);
      move('[data-button="reset"]', 352, 174);
      for (const [left, top, width] of [[8, 8, 208], [8, 32, 208], [8, 142, 208], [8, 168, 208],
        [8, 224, 208], [236, 8, 200], [236, 32, 200], [236, 142, 200], [236, 224, 200]]) {
        const rule = doc.createElement('div');
        rule.className = 'hud-char-rule';
        place(rule, { left: left!, top: top!, width: width!, height: 2 });
        page.append(rule);
      }
    }
    this.process();
  }

  /** The points being placed on each stat. */
  get counts(): StatCounts {
    return { ...this.countsNow };
  }

  /** H, the applet and Start: opens at the top left on desktop or centered on mobile; closes if already open. */
  toggle(): void {
    if (this.frame.isOpen) this.frame.close();
    else this.frame.open(this.mobile ? 'center' : { x: 0, y: 0 });
  }

  /**
   * One frame at `nowMs` (`Process` then `OnDraw`): the controls enabled by the points left, and the page drawn with
   * `own`'s numbers and the lobby's `entry`. The stats are `GetStr()` and the others (`OwnState.effective()`, the
   * equipment's `adj` in), and the formulas are given the equipment's `adj` (`OwnState.adj`, `equipAdjust`) themselves.
   */
  update(own: OwnState, entry: CharacterEntry, nowMs = 0): void {
    this.own = own;
    this.process();
    const red = (Math.trunc(nowMs / BLINK_MS) & 1) === 1;
    const blink = (preview: boolean, color = BLACK): number => (preview && red ? RED : color);

    // the base part (:3029-3176): the name GetName(), the job GetJobString() (`prj.m_aJob[ m_nJob ].szName`,
    // MoverParam.cpp:354-359: the jobs catalog's name of etc.inc, '' in one converted before it kept it), the level,
    // the server and the channel
    this.show('name', entry.character.name);
    this.show('job', own.jobProp.title);
    this.show('level', String(own.level));
    this.show('server', entry.serverName);
    this.show('channel', entry.channelName);

    // the detail part (:3190-3243, RenderATK :4057-4099), each previewed with the counts (GetVirtual*, :3864-4056): the
    // same formulas with the counts added to GetStr() and the others, drawn blinking red while they differ
    const job = own.jobProp;
    const level = own.level;
    const eq = own.equipped;
    const adj = own.adj;
    const stats = own.effective();
    const c = this.countsNow;
    const virtual: Stats = { str: stats.str + c.str, sta: stats.sta + c.sta, dex: stats.dex + c.dex, int: stats.int + c.int };
    // RenderATK compares the ranges of GetVirtualATK and GetHitMinMax; both ends move by the same nPlus (an unrefined weapon
    // multiplies by 1), so the means differ when the ranges do (but where both fall under 0, which `__JEFF_11` shows as 0)
    // with the high-rate server's own numbers (profileStats), the preview is those numbers moved by the client's difference
    // (2026-11-04 audit: they were never previewed, as that packet always comes from the real server)
    const profile = own.profileStats;
    const atkClient = attackShown(job, level, stats, eq, adj);
    const atk = profile?.[7] ?? atkClient;
    const virtualAtk = atk + attackShown(job, level, virtual, eq, adj) - atkClient;
    const atkPreview = (c.str !== 0 || c.dex !== 0 || c.int !== 0) && virtualAtk !== atk;
    this.show('atk', String(atkPreview ? virtualAtk : atk), blink(atkPreview), atkPreview);
    // GetVirtualDEF floors at 0 after the DEF multiplier where GetShowDefense floors before it: they differ only for a
    // multiplier under 0 (DST_ADJDEF_RATE below -100), which nothing the browser knows of gives
    const defClient = defenceShown(job, level, stats, eq, adj);
    const def = profile?.[8] ?? defClient;
    const virtualDef = def + defenceShown(job, level, virtual, eq, adj) - defClient;
    const defPreview = c.sta !== 0 && virtualDef !== def;
    this.show('def', String(defPreview ? virtualDef : def), blink(defPreview), defPreview);
    const criticalClient = criticalShown(job, stats, adj);
    const critical = profile?.[9] ?? criticalClient;
    const virtualCritical = critical + criticalShown(job, virtual, adj) - criticalClient;
    const criticalPreview = c.dex !== 0 && virtualCritical !== critical;
    this.show('critical', `${criticalPreview ? virtualCritical : critical}%`, blink(criticalPreview), criticalPreview);
    // GetVirtualATKSpeed takes a speed under 0 to 0.1 where GetAttackSpeed takes one under 0.1: they differ only for a
    // speed from 0 to 0.1, which needs a DST_ATTACKSPEED far below anything the browser knows of
    const weaponSpeed = (eq.weapon ?? FISTS).attackSpeed;
    const speed = attackSpeed(job, weaponSpeed, level, stats.dex, adj);
    const virtualSpeed = attackSpeed(job, weaponSpeed, level, virtual.dex, adj);
    const speedShown = profile?.[10] ?? speed.shown;
    const speedPreview = c.dex !== 0 && virtualSpeed.speed !== speed.speed;
    this.show('speed', `${speedPreview ? speedShown + virtualSpeed.shown - speed.shown : speedShown}%`, blink(speedPreview), speedPreview);

    // the stats (:3244-3286): GetStr() and the others, black as the base, blue above it, red below it
    let color = BLACK;
    for (const stat of STATS) {
      const base = own.stats[stat];
      color = base === stats[stat] ? BLACK : base < stats[stat] ? BLUE : RED;
      this.show(stat, String(stats[stat]), color);
    }
    // the points left blink red while some are (:3288-3296), else in the colour of the line before (INT's)
    const left = this.pointsLeft();
    this.show('points', String(left), left !== 0 && red ? RED : color);
  }

  /** Closes the window and its confirm box, and lets go of the keys. */
  dispose(): void {
    this.frame.close();
    this.confirm.close();
  }

  /** `m_nGpPoint`: `GetRemainGP()` less the counts (`Process`, :3807). */
  private pointsLeft(): number {
    const c = this.countsNow;
    return (this.own?.remainGP ?? 0) - (c.str + c.sta + c.dex + c.int);
  }

  private anyCount(): boolean {
    return STATS.some((stat) => this.countsNow[stat] !== 0);
  }

  /** + and - (`OnChildNotify`, :3664-3690): one more or one less, as long as the button is enabled. */
  private step(stat: Stat, step: 1 | -1): void {
    if (step === 1 ? this.pointsLeft() <= 0 : this.countsNow[stat] <= 0) return;
    this.countsNow = { ...this.countsNow, [stat]: this.countsNow[stat] + step };
    this.process();
  }

  /**
   * A count typed in its box (`OnChildNotify`, :3627-3662): a text with a character that is not a digit leaves the count
   * as it was (Neuz tests the STR box's text for every box, :3629, a slip not copied); otherwise the count is the number,
   * kept to `GetRemainGP()` less the other three counts. The box then shows the count (`RefreshStatPoint`).
   */
  private typed(stat: Stat): void {
    const text = this.inputs[stat].value;
    if (/^\d*$/.test(text)) {
      const others = STATS.reduce((sum, s) => (s === stat ? sum : sum + this.countsNow[s]), 0);
      const most = (this.own?.remainGP ?? 0) - others;
      const typed = text === '' ? 0 : Number.parseInt(text, 10);
      this.countsNow = { ...this.countsNow, [stat]: Math.min(typed, most) };
    }
    this.process();
  }

  /** Apply (:3692-3699): with a count placed, the confirm box (`IsBaseJob()`: the Vagrant gets TID_DIAG_0082). */
  private askApply(): void {
    if (!this.anyCount()) return;
    this.confirm.open(this.own?.job === JOB_VAGRANT);
  }

  /** The confirm box's Yes (:4487-4502): MODIFY_STATUS with the counts, which go back to 0 at once. */
  private applyCounts(): void {
    if (!this.frame.isOpen) return;
    this.onApply({ ...this.countsNow });
    this.countsNow = { ...NO_COUNTS };
    this.process();
  }

  /**
   * `Process` (:3784-3849) and `RefreshStatPoint` (:3850-3862): - while its count is above 0; + and the boxes while points
   * are left; Apply and Reset while a count is placed; the boxes show the counts.
   */
  private process(): void {
    const left = this.pointsLeft() > 0;
    for (const stat of STATS) {
      this.minus[stat].disabled = this.countsNow[stat] <= 0;
      this.plus[stat].disabled = !left;
      const input = this.inputs[stat];
      input.disabled = !left;
      const text = String(this.countsNow[stat]);
      if (input.value !== text) input.value = text;
    }
    const any = this.anyCount();
    this.apply.disabled = !any;
    this.reset.disabled = !any;
  }

  /** Draws the value `name`: its text and colour, and whether it is a preview (`data-preview`). */
  private show(name: string, text: string, color = BLACK, preview = false): void {
    const value = this.values.get(name)!;
    if (value.text !== text) {
      value.text = text;
      value.element.textContent = text;
    }
    if (value.color !== color) {
      value.color = color;
      value.element.style.color = cssRgb(color);
    }
    if (value.preview !== preview) {
      value.preview = preview;
      if (preview) value.element.dataset.preview = '';
      else delete value.element.dataset.preview;
    }
  }

  /** A text of the page at (`x`, `y`): `TextOut`'s top left. */
  private textAt(doc: Document, x: number, y: number): HTMLElement {
    const element = doc.createElement('span');
    element.className = 'hud-char-text';
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
    return element;
  }

  /**
   * The strip of tabs under the page (`tabStripTiles`), the chosen tab over it (`chosenTabTiles`) and the titles (`OnDraw`,
   * :4221-4283): 2 px into each tab, the chosen one black and the others white (ALIGN_LEFT, `__VER >= 15`). Only the
   * page's tab does anything: the Fame/Master page is not the browser's.
   */
  private tabStrip(doc: Document, art: UiArt, columns: number, rect: ControlRect = TAB): HTMLElement[] {
    const top = (Math.trunc(rect.height / EDIT) - 2) * EDIT;
    const tile = (index: number, left: number, width = TAB_TILE): HTMLElement => {
      const element = doc.createElement('div');
      place(element, { left, top, width, height: TAB_TILE_HEIGHT });
      element.style.backgroundImage = themeUrl(art, `WndTabTile${String(index).padStart(2, '0')}.bmp`);
      element.style.backgroundSize = '100% 100%';
      return element;
    };
    const tiles = tabStripTiles(columns, TABS.length).map((index, i) => tile(index, i * TAB_TILE));
    for (const chosen of chosenTabTiles(columns, TABS.length, CHOSEN_TAB)) tiles.push(tile(chosen.index, chosen.left, chosen.width));
    const length = Math.trunc((rect.width - TAB_RIGHT) / TABS.length);
    const titles = TABS.map((id, i) => {
      const title = this.textAt(doc, i * length + 2, rect.height - TAB_TITLE_UP);
      title.classList.add('hud-char-tab-title');
      title.dataset.tab = String(i);
      title.textContent = this.text(id);
      title.style.color = cssRgb(i === CHOSEN_TAB ? BLACK : WHITE);
      return title;
    });
    return [...tiles, ...titles];
  }

  private text(id: string): string {
    return this.texts.get(id)?.text ?? '';
  }
}

// The skill tree window (spec §3.11, [skills §3.1]): `CWndSkillTreeEx` (APP_SKILL3), where the skill points are spent, and
// the box that asks before they are (`CWndReSkillWarning`, APP_QUEITMWARNING). K, the applet and the Start menu open and
// close it (`CWndMgr::ObjectExecutor`); its skills are carried to the task bar from it (`SkillHand`, the task bar).
//
//   resdata.inc APP_SKILL3             Resource/resdata.inc:6665-6880     "WndTile03.tga" tiled, 256 x 624, titled "Skill Tree"
//                                                                         (IDS_RESDATA_INC_003714, Resource/resData.txt.txt:3715);
//                                                                         its controls, from the client area's top left
//   CWndSkillTreeEx::OnInitialUpdate   _Interface/WndField.cpp:7965-8041  the level digits, the arrows LvUp.bmp / LvDn.bmp, all
//                                                                         sections open, 100 px less for a character that is no
//                                                                         master or hero (:8017-8022), at the layout's bottom right
//   CWndSkillTreeEx::InitItem          WndField.cpp:6736-6976             the copy of the skills (SkillPlan), the sections' titles
//                                                                         (a Vagrant's: its job's name, then none), no skill chosen
//   CWndSkillTreeEx::GetSkillPoint     WndField.cpp:6978-7418             where a skill is drawn: the Vagrant's three at
//                                                                         WIDC_CUSTOM2-4, by their skill IDs, one px down
//   CWndSkillTreeEx::CheckSkill        WndField.cpp:6649-6703             a skill open (SkillPlan.active)
//   CWndSkillTreeEx::OnMouseMove       WndField.cpp:7438-7463             a skill dragged to the task bar
//   CWndSkillTreeEx::Process           WndField.cpp:7465-7568             which of + - Reset Finish are enabled
//   CWndSkillTreeEx::OnMouseWndSurface WndField.cpp:7570-7634             the skill under the mouse, and its tooltip
//   CWndSkillTreeEx::OnDraw            WndField.cpp:7723-7964             the icons and level digits, the points left, the chosen
//                                                                         skill, the sections' arrows
//   CWndSkillTreeEx::OnChildNotify     WndField.cpp:8047-8120             + - Reset Finish, and the close button (10000)
//   CWndSkillTreeEx::OnLButtonDown     WndField.cpp:8133-8311             a skill chosen
//   CWndSkillTreeEx::OnLButtonDblClk   WndField.cpp:8318-8393             a skill put in the action slot
//   CWndMgr::PutToolTip_Skill          _Interface/WndManager.cpp:4175-4291  a skill's tooltip
//   CWndMgr::ObjectExecutor            WndManager.cpp:2579-2603           toggled with changes: the box asks first
//   CWndReSkillWarning                 WndField.cpp:13667-13749           the box: Yes sends DOUSESKILLPOINT; opened by the
//                                                                         close button or the toggle, it closes the window too
//   resdata.inc APP_QUEITMWARNING      resdata.inc (APP_QUEITMWARNING)    "WndTile00.tga" tiled, 320 x 160, titled "Warning"
//                                                                         (IDS_RESDATA_INC_002922, resData.txt.txt:2923)
//
// The window shows the skills it has a place for (`GetSkillPoint`): for a Vagrant the three of the base section, Clean Hit,
// Flurry and Over Cut, which are slots 0-2 of `m_aJobSkill`; the four event buffs of slots 3-6 have none, so nothing offers
// to raise them (ruling R39; `m_nCount = 3`, :6770, is set but never read). The expert, pro and hero sections stay empty, as a
// Vagrant's are. Not copied: folding the sections away (`SetActiveSlot`: a press on a section's title; the window would
// change its height, which `WindowFrame` keeps), and the remaining cool-down in the tooltip (no Vagrant skill has one, and the
// client keeps none, [skills §5.4]). Escape closes the window without asking, as Neuz's does (`CWndMgr::Process` destroys
// it, `WndManager.cpp:3383-3420`), the changes with it.

import { NULL_ID } from '@flyffweb/protocol';
import type { SkillSlot, WorldMessage } from '@flyffweb/protocol';
import type { WebSkill } from '@flyffweb/formats';
import type { OwnState } from '../OwnState';
import { SkillPlan, checkSkill, skillPointCost } from '../skills/skillRules';
import { cssRgb, themeKey, themeUrl } from './art';
import type { UiArt } from './art';
import { pictureButton, place } from './button';
import type { ControlRect } from './button';
import { formatText } from './format';
import { WindowFrame } from './frame';
import { ModalBackdrop } from './modal';
import { byFinger } from './slotGestures';
import { JOB_PANELS, PANEL_AT, PRO_PANELS, PRO_PANEL_AT, jobLineOf, sectionOf, skillPlaceOf } from './skillPlaces';
import { EDIT, editTiles } from './tiles';

/** What the window reads of the catalogs: the skills, the texts (with their colours) and the jobs' names. */
export interface SkillWindowData {
  skills: ReadonlyMap<number, WebSkill>;
  texts: ReadonlyMap<string, { text: string; color?: number }>;
  jobs: ReadonlyArray<{ title: string }>;
}

/**
 * Where the window's skills are carried to: the task bar (`TaskBar`), as Neuz's `m_GlobalShortcut` carries them to
 * `CWndTaskBar::OnDropIcon`.
 */
export interface SkillHand {
  /** A skill dragged with the mouse: `event` is the press on it, the drag begins once the mouse moves. */
  carrySkill(skillIndex: number, event: PointerEvent): void;
  /**
   * A skill picked by a finger, for the next slot of the bar tapped (picked again, it is let go). A press anywhere but in
   * `within` (the window) or on a slot of the bar's item row or action slot lets it go.
   */
  pickSkill(skillIndex: number, within: Element): void;
  /** The skill a finger picked, or null. */
  readonly pickedSkill: number | null;
  /** Lets go of the skill a finger picked. */
  dropPick(): void;
  /** `SetSkillQueue( m_nCurQueueNum, 0, i )`: the skill after the last of the action slot (a double click). */
  queueSkill(skillIndex: number): void;
}

// ---- APP_SKILL3 (resdata.inc:6665): the window and its controls, in its client area ----------------------------------

/** `APP_SKILL3 "WndTile03.tga" 1 256 624`, less the 100 px of the hero section a Vagrant has not (`rect.bottom -= 100`, :8020). */
const WIDTH = 256;
const HEIGHT = 624 - 100;
/** The client area's width (`CWndBase::SetWndRect`, `WndBase.cpp:1846-1853`: 4 px in on the left, 8 on the right). */
const CLIENT_WIDTH = WIDTH - 4 - 8;
/** `IDS_RESDATA_INC_003714` (resData.txt.txt:3715): the applet's title (`CWndNeuz::OnInitialUpdate`, WndNeuz.cpp:210-216). */
const TITLE = 'Skill Tree';
/** WIDC_CUSTOM1 (20, 26, 52, 58): the chosen skill, its icon at its own 32 px and its level digit at its top left (:7866-7881). */
const CHOSEN = { left: 20, top: 26 } as const;
/** WIDC_STATIC10 "WndEditTile200.tga" (8, 2, 80, 18), titled "Skill Point" (IDS_RESDATA_INC_003744, resData.txt.txt:3745). */
const POINTS_LABEL: ControlRect = { left: 8, top: 2, width: 72, height: 16 };
const POINTS_LABEL_TEXT = 'Skill Point';
/** Its tooltip, IDS_RESDATA_INC_003745 (resData.txt.txt:3746). */
const POINTS_LABEL_TIP = 'Available Skill Point';
/** WIDC_STATIC9 (92, 4, 170, 20): the points left (`m_nCurrSkillPoint`, :7847-7850), in a plain static's ARGB(255, 46, 112, 169). */
const POINTS: ControlRect = { left: 92, top: 4, width: 78, height: 16 };
const POINTS_COLOR = 0xff2e70a9;
/**
 * The buttons (WIDC_BUTTON1-4), with their tooltips (IDS_RESDATA_INC_003769, 003771, 003773, 003775: resData.txt.txt:3770,
 * :3772, :3774, :3776): + and - (ButItemPlus.bmp and ButItemMinus.bmp, 56 x 16, four states of 14), Reset and Finish
 * (ButtReset.bmp and ButtFinish.bmp, 288 x 20, four of 72). + and - are 15 px wide in resdata.inc; their picture's 14 is
 * what is drawn (`RenderWndButton_4Texture`).
 */
const BUTTONS = {
  plus: {
    rect: { left: 56, top: 22, width: 14, height: 16 }, picture: 'ButItemPlus.bmp', quarter: 14, tip: 'Upgrade Skill Level',
  },
  minus: {
    rect: { left: 56, top: 44, width: 14, height: 16 }, picture: 'ButItemMinus.bmp', quarter: 14, tip: 'Downgrade Skill Level',
  },
  reset: {
    rect: { left: 80, top: 30, width: 72, height: 20 }, picture: 'ButtReset.bmp', quarter: 72,
    tip: 'Redistribute skill point (Skill Point used is unavailable.)',
  },
  finish: {
    rect: { left: 160, top: 30, width: 72, height: 20 }, picture: 'ButtFinish.bmp', quarter: 72,
    tip: 'Skill Point is distributed by pressing + or – button.',
  },
} as const;
type ButtonName = keyof typeof BUTTONS;
/**
 * The sections' titles, "WndEditTile200.tga" group boxes (WIDC_STATIC2, 3 and 6), each with its arrow 30 px from its right
 * (`rect.left = rect.right - 30`, LvUp.bmp while open, drawn 20 x 20, :7883-7911), and their panels, "WndEditTile00.tga"
 * (WIDC_STATIC4, 5 and 7).
 */
const SECTIONS: ReadonlyArray<{ title: ControlRect; panel: ControlRect }> = [
  { title: { left: 6, top: 64, width: 232, height: 16 }, panel: { left: 6, top: 90, width: 234, height: 50 } },
  { title: { left: 6, top: 146, width: 232, height: 16 }, panel: { left: 6, top: 168, width: 234, height: 144 } },
  { title: { left: 6, top: 324, width: 232, height: 16 }, panel: { left: 6, top: 346, width: 232, height: 144 } },
];
const ARROW = { fromRight: 30, size: 20 } as const;
/** A group box's title, at (4, 4) in white, drawn twice a pixel apart (`CWndStatic::OnDraw`, WndControl.cpp:56-120). */
const GROUP_TITLE = { left: 4, top: 4 } as const;
/** WIDC_STATIC8 "ImgSkillVagrant.tga" (62, 104, 187, 129): the Vagrant's three skills and the arrows between them. */
const VAGRANT_PICTURE: ControlRect = { left: 62, top: 104, width: 125, height: 25 };
/**
 * The places of the skills (`GetSkillPoint`, `skillPlaces.ts`): the Vagrant's three at WIDC_CUSTOM2-4 and, Piece 7 M2, the
 * four first jobs' 65, drawn and pressed 27 x 27 (:7816-7823, :8288-8296). On a phone the Vagrant's sit 80 px apart in the
 * first section and the others in the second, 5 a row, in the order of their slots (`PHONE_EXPERT`).
 */
const SKILL_ICON = 27;
const PHONE_EXPERT = { left: 276, top: 100, pitchX: 48, pitchY: 60, columns: 5 } as const;
/** The second job's skills on a phone: the third section, the same grid (2026-11-05). */
const PHONE_PRO = { left: 536, top: 100, pitchX: 48, pitchY: 60, columns: 5 } as const;
/** The four `Back_*` panels' size (`Client/Theme/Default`, all 225 x 135). */
const PANEL_SIZE = { width: 225, height: 135 } as const;
/** The chosen skill's icon, at its own size (`Render( p2DRender, lpWndCtrl->rect.TopLeft() )`, :7869). */
const ICON = 32;
/**
 * The level digits, `Icon/icon_IconSkillLevel.inc`: 40 frames of 28 x 28, `serialize 20 28 28 1 1` and `... 1 29`: frame
 * `level - 1` (19 for the maximum level), 20 on for a level changed and not yet sent (:7824-7832), drawn 2 px up and left
 * of the icon (`rect.TopLeft()-CPoint(2,2)`).
 */
const DIGIT = 28;
const DIGITS = 'icon_IconSkillLevel.tga';
const DIGIT_MAX = 19;
const DIGIT_CHANGED = 20;
const DIGIT_SHIFT = 2;
/** `JOB_VAGRANT` (`Resource/defineJob.h:41`): whose name the first section bears (`prj.m_aJob[JOB_VAGRANT].szName`, :6771). */
const JOB_VAGRANT = 0;
/** `MAX_JOBBASE` and `MAX_EXPERT` (`Resource/defineJob.h:42`, :50): the first jobs are 1 to 5 (`IsExpert`). */
const MAX_JOBBASE = 1;
const MAX_EXPERT = 6;
/** `PutToolTip_Skill`'s colours: the name `#cff2fbe6d`, an unmet requirement `#cffff0000`. */
const TIP_NAME = 0xff2fbe6d;
const TIP_RED = 0xffff0000;
const WHITE = 0xffffffff;
/** `nReqMp`, `nReqFp` of a level that needs none (0xffffffff, read as an int). */
const NONE = -1;

/** Whether an event's target is, or is inside, an element `selector` names. */
const within = (target: EventTarget | null, selector: string): boolean =>
  ((target as Element | null)?.closest?.(selector) ?? null) !== null;

/** A line of a skill's tooltip, in its colour, bold for the name. */
export interface TooltipLine {
  text: string;
  color: number;
  bold?: boolean;
}

/**
 * `CWndMgr::PutToolTip_Skill( dwSkill, dwLevel, ..., bActive )` (`WndManager.cpp:4175-4291`): what `skill` at `level` says,
 * `active` when the window counts it open (`CheckSkill( i )`), `own` being the player (`g_pPlayer`):
 * - the name, bold in `ff2fbe6d`, with "   Lv n" when active;
 * - "MP : n" and "FP : n" for a cost of the level's row (`GetAddSkillProp`, a level 0 read as 1), as `GetReqMp` / `GetReqFp`
 *   give it (less `DST_MP_DEC_RATE` / `DST_FP_DEC_RATE`, which nothing the browser knows of gives);
 * - each prerequisite the player has (`GetSkill( dwReSkill1 )`): `TID_GAME_SKILLDIS` with its name and level, red if the
 *   player's own level of it is short;
 * - `TID_GAME_BASESKILLLEVEL` with the character level it needs, red if the player's is lower;
 * - the description, unless it is "=".
 * None for a level the catalog has no row for (`pAddSkillProp == NULL`, :4192-4196).
 */
export function skillTooltip(
  skill: WebSkill, level: number, active: boolean, own: Pick<OwnState, 'level' | 'skills'>,
  catalog: ReadonlyMap<number, WebSkill>, texts: ReadonlyMap<string, { text: string }>,
): TooltipLine[] {
  const row = skill.levels[Math.max(level, 1) - 1];
  if (row === undefined) return [];
  const text = (id: string): string => texts.get(id)?.text ?? '';
  const lines: TooltipLine[] = [{ text: active ? `${skill.name}   Lv ${level}` : skill.name, color: TIP_NAME, bold: true }];
  if (row.reqMp !== NONE) lines.push({ text: `MP : ${row.reqMp}`, color: WHITE });
  if (row.reqFp !== NONE) lines.push({ text: `FP : ${row.reqFp}`, color: WHITE });
  for (const required of skill.reqSkills) {
    const owned = own.skills.find((slot) => slot.skill === required.skill);
    const prop = catalog.get(required.skill);
    if (owned === undefined || prop === undefined) continue;
    const line = formatText(text('TID_GAME_SKILLDIS'), [prop.name, required.level]);
    lines.push({ text: line, color: owned.level < required.level ? TIP_RED : WHITE });
  }
  const levelLine = formatText(text('TID_GAME_BASESKILLLEVEL'), [skill.reqLevel]);
  lines.push({ text: levelLine, color: own.level < skill.reqLevel ? TIP_RED : WHITE });
  if (skill.description !== '=' && skill.description !== '') lines.push({ text: skill.description, color: WHITE });
  return lines;
}

/** A skill the window shows: its slot of `m_aJobSkill`, its element and place, its icon and digit, what it shows. */
interface ShownSkill {
  skillId: number;
  index: number;
  at: { left: number; top: number };
  element: HTMLElement;
  icon: HTMLElement;
  digit: HTMLElement;
  shown: string;
}

/**
 * The skill tree window. Its `frame` and its box's (`warning.element`, a modal backdrop) go in the windows' layer;
 * `toggle` opens it at the bottom right of the room above the task bar, or closes it (asking first when points were placed);
 * `update` is given the own numbers each frame and draws them; `onMessage` hears the messages that make Neuz load the skills
 * anew (`InitItem`, which drops the points being placed). Finish's Yes calls `onFinish` with the 45 slots, the player's
 * skill IDs with the placed levels (DOUSESKILLPOINT, `SkillUse.spendSkillPoints`, which also ends a request the server
 * leaves unanswered: the window waits on nothing).
 */
export class SkillWindow {
  readonly frame: WindowFrame;
  readonly warning: ReSkillWarning;
  /** `m_apSkill` and `m_nCurrSkillPoint`, from `InitItem`; null while the window is closed. */
  private plan: SkillPlan | null = null;
  /** `g_nSkillCurSelect` / `m_pFocusItem`: the chosen skill's slot, or null. */
  private focus: number | null = null;
  /** `m_dwMouseSkill`: the skill under the mouse (its slot), whose icon shows even at level 0; or the one a finger tapped. */
  private hovered: number | null = null;
  /** `m_nSkillPoint` as the last `InitItem` found it: SETEXPERIENCE loads the skills anew when it changed (`nSP != nSkillPoint`). */
  private seenPoints = 0;
  private own: OwnState | undefined;
  private readonly doc: Document;
  private readonly skills: ShownSkill[] = [];
  private readonly buttons: Record<ButtonName, HTMLButtonElement>;
  private readonly points: HTMLElement;
  private readonly chosenIcon: HTMLElement;
  private readonly chosenDigit: HTMLElement;
  private readonly sectionTitles: HTMLElement[] = [];
  private readonly tooltip: HTMLElement;
  private tooltipShown = '';
  private readonly mobile: boolean;
  /** Piece 7 M2: the first job's panel (`m_atexJobPannel[0]`), and the skill IDs the skills are laid out for. */
  private readonly jobPanel: HTMLImageElement;
  /** The second job's panel (`m_atexJobPannel[1]`), in the lower section. */
  private readonly proPanel: HTMLImageElement;
  private laidOut = '';

  constructor(
    private readonly art: UiArt,
    private readonly data: SkillWindowData,
    private readonly onFinish: (skills: SkillSlot[]) => void,
    private readonly hand: SkillHand,
    doc: Document = document,
  ) {
    this.doc = doc;
    this.mobile = doc.defaultView?.matchMedia?.('(max-width: 1000px) and (pointer: coarse)').matches === true;
    const frame = new WindowFrame(TITLE, art, this.mobile
      ? { width: 800, height: 440, mobileScale: 1, fitWhole: true }
      : { width: WIDTH, height: HEIGHT }, doc);
    frame.element.classList.add('hud-skills');
    frame.element.classList.toggle('hud-skills-landscape', this.mobile);
    frame.onClose = () => this.closed();
    this.frame = frame;
    this.warning = new ReSkillWarning(art, data.texts, () => this.sendPlan(), (closeWindow) => {
      if (closeWindow) this.frame.close();
    }, doc);
    // the close button (10000) with points placed asks first (OnChildNotify, :8100-8117): taken before the frame's own
    frame.element.addEventListener('click', (event) => {
      if (!within(event.target, '.hud-window-close') || this.plan?.changed !== true) return;
      event.stopPropagation();
      if (!this.warning.isOpen) this.warning.open(true);
    }, true);
    const body = frame.body;

    // the sections (the frame's skin: the tiles under everything drawn)
    SECTIONS.forEach((section, i) => {
      const title = this.mobile ? { left: 8 + i * 260, top: 48, width: 248, height: 32 } : section.title;
      const panel = this.mobile ? { left: 8 + i * 260, top: 92, width: 248, height: 304 } : section.panel;
      const box = doc.createElement('div');
      box.className = 'hud-skills-box';
      box.classList.add('hud-skills-panel');
      box.dataset.section = String(i);
      place(box, panel);
      box.append(editTiles(doc, art, Math.trunc(panel.width / EDIT), Math.trunc(panel.height / EDIT)));
      const head = doc.createElement('div');
      head.className = 'hud-skills-box';
      head.classList.add('hud-skills-heading');
      place(head, title);
      head.append(editTiles(doc, art, Math.trunc(title.width / EDIT), Math.trunc(title.height / EDIT), 'WndEditTile200.tga'));
      const text = this.groupTitle(doc);
      head.append(text);
      this.sectionTitles.push(text);
      const arrow = doc.createElement('div');
      arrow.className = 'hud-skills-arrow';
      place(arrow, { left: title.left + title.width - ARROW.fromRight, top: title.top, width: ARROW.size, height: ARROW.size });
      arrow.style.backgroundImage = themeUrl(art, 'LvUp.bmp');
      body.append(box, head, arrow);
    });
    const label = doc.createElement('div');
    label.className = 'hud-skills-box';
    const pointsLabel = this.mobile ? { left: 8, top: 8, width: 112, height: 24 } : POINTS_LABEL;
    place(label, pointsLabel);
    label.title = POINTS_LABEL_TIP;
    const columns = Math.trunc(pointsLabel.width / EDIT);
    label.append(editTiles(doc, art, columns, Math.ceil(pointsLabel.height / EDIT), 'WndEditTile200.tga'));
    const labelText = this.groupTitle(doc);
    labelText.textContent = POINTS_LABEL_TEXT;
    label.append(labelText);
    this.points = doc.createElement('div');
    this.points.className = 'hud-skills-points';
    place(this.points, this.mobile ? { left: 136, top: 8, width: 48, height: 24 } : POINTS);
    this.points.style.color = cssRgb(POINTS_COLOR);
    const picture = doc.createElement('div');
    picture.className = 'hud-skills-picture';
    place(picture, this.mobile ? { left: 28, top: 112, width: 200, height: 40 } : VAGRANT_PICTURE);
    picture.style.backgroundImage = themeUrl(art, 'ImgSkillVagrant.tga');
    body.append(label, this.points, picture);

    // the chosen skill (WIDC_CUSTOM1)
    this.chosenIcon = doc.createElement('div');
    this.chosenIcon.className = 'hud-skills-chosen';
    place(this.chosenIcon, { ...CHOSEN, width: ICON, height: ICON });
    this.chosenDigit = this.digitElement(doc);
    place(this.chosenDigit, { ...CHOSEN, width: DIGIT, height: DIGIT });
    body.append(this.chosenIcon, this.chosenDigit);

    // Piece 7 M2: the first job's panel, painted into the skin at WIDC_STATIC5 + 2 px (`AfterSkinTexture`, :8395-8418);
    // the skills themselves are laid out by `layoutSkills` when the window loads them (`InitItem`)
    this.jobPanel = doc.createElement('img');
    this.jobPanel.className = 'hud-skills-job-panel';
    this.jobPanel.alt = '';
    this.jobPanel.draggable = false;
    this.jobPanel.hidden = true;
    place(this.jobPanel, { left: PANEL_AT.x, top: PANEL_AT.y, width: PANEL_SIZE.width, height: PANEL_SIZE.height });
    this.proPanel = this.jobPanel.cloneNode() as HTMLImageElement;
    this.proPanel.className = 'hud-skills-pro-panel'; // the second job's, at WIDC_STATIC7 + 2 px (2026-11-05)
    place(this.proPanel, { left: PRO_PANEL_AT.x, top: PRO_PANEL_AT.y, width: PANEL_SIZE.width, height: PANEL_SIZE.height });
    body.append(this.jobPanel, this.proPanel);

    const button = (name: ButtonName, press: () => void): HTMLButtonElement => {
      const { rect, picture, quarter, tip } = BUTTONS[name];
      const element = pictureButton(doc, art, picture, rect, quarter, press);
      element.dataset.button = name;
      element.title = tip;
      element.setAttribute('aria-label', tip);
      body.append(element);
      return element;
    };
    this.buttons = {
      plus: button('plus', () => this.step(1)),
      minus: button('minus', () => this.step(-1)),
      reset: button('reset', () => this.reset()),
      finish: button('finish', () => this.finish()),
    };
    if (this.mobile) {
      for (const [name, left] of [['plus', 176], ['minus', 206], ['reset', 548], ['finish', 666]] as const) {
        const button = this.buttons[name];
        button.style.left = `${left}px`;
        button.style.top = '10px';
        button.style.transform = name === 'plus' || name === 'minus' ? 'scale(1.35)' : 'scale(1.45)';
        button.style.transformOrigin = 'top left';
      }
      this.chosenIcon.hidden = true;
      this.chosenDigit.style.display = 'none';
    }

    this.tooltip = doc.createElement('div');
    this.tooltip.className = 'hud-skill-tooltip';
    this.tooltip.setAttribute('role', 'tooltip');
    this.tooltip.hidden = true;
    body.append(this.tooltip);
    // a finger's press elsewhere in the window puts the tooltip away
    body.addEventListener('pointerdown', (event) => {
      if (byFinger(event) && !within(event.target, '.hud-skill')) this.hovered = null;
    });
  }

  get isOpen(): boolean {
    return this.frame.isOpen;
  }

  /** The window's copy of the skills (`m_apSkill`), or null while it is closed. */
  get skillPlan(): SkillPlan | null {
    return this.plan;
  }

  /** The chosen skill's slot (`g_nSkillCurSelect`), or null. */
  get chosen(): number | null {
    return this.focus;
  }

  /**
   * K, the applet and the Start menu (`CWndMgr::ObjectExecutor`, `WndManager.cpp:2579-2603`): closed, the window opens at the
   * bottom right of the room above the task bar (`OnInitialUpdate`, :8034-8040), with the own skills (`InitItem`); open, it
   * closes, unless points were placed, when the box asks first and closes it after (`InitItem( TRUE )`); with the box open,
   * nothing.
   */
  toggle(own: OwnState): void {
    if (this.frame.isOpen) {
      if (this.warning.isOpen) return;
      if (this.plan?.changed === true) this.warning.open(true);
      else this.frame.close();
      return;
    }
    const layer = this.frame.element.parentElement;
    this.frame.open(this.mobile ? 'center' : { x: (layer?.clientWidth ?? 0) - WIDTH, y: (layer?.clientHeight ?? 0) - HEIGHT });
    this.initItem(own);
    this.update(own);
  }

  /**
   * The messages after which Neuz loads the skills anew in the open window (`InitItem`, dropping the points being placed):
   * DOUSESKILLPOINT (`OnDoUseSkillPoint`, `DPClient.cpp:14740-14747`), INITSKILLPOINT (`OnInitSkillPoint`, :14719-14725) and
   * the own SETEXPERIENCE that changed the skill points (`OnSetExperience`, :3419-3427, `nSP != nSkillPoint`). `own` is the
   * own state after the message. Piece 7 M2: the job change's SET_JOB_SKILL too (:3623-3630), which lays the skills out
   * anew for the job. (A game master's skill level, `OnCmdSetSkillLevel`, :13544-13551, is a message the browser does not
   * read.)
   */
  onMessage(objectId: number, message: WorldMessage, own: OwnState | undefined): void {
    if (!this.frame.isOpen || own === undefined) return;
    switch (message.type) {
      case 'doUseSkillPoint':
      case 'initSkillPoint':
        break;
      case 'setJobSkill':
        if (objectId !== own.objectId) return;
        break;
      case 'setExperience':
        if (objectId !== own.objectId || own.skillPoint === this.seenPoints) return;
        break;
      default:
        return;
    }
    this.initItem(own);
    this.update(own);
  }

  /** One frame (`Process` then `OnDraw`): the buttons enabled, the skills, the points left, the chosen skill, the tooltip. */
  update(own: OwnState): void {
    this.own = own;
    const plan = this.plan;
    if (plan === null) return;
    this.process(own, plan);
    const levels = plan.result();
    const points = String(plan.points);
    if (this.points.textContent !== points) this.points.textContent = points;
    const jobTitle = this.data.jobs[JOB_VAGRANT]?.title ?? '';
    // InitItem's titles (:6769-6776, :6801-6905): the Vagrant's name; the first job's name; the second job's name, or none
    const line = jobLineOf(own.job);
    const expert = line.first === null ? '' : this.data.jobs[line.first]?.title ?? '';
    const professional = line.second === null ? '' : this.data.jobs[line.second]?.title ?? '';
    const titles = [jobTitle, expert, professional];
    this.sectionTitles.forEach((title, i) => {
      if (title.textContent !== titles[i]) title.textContent = titles[i]!;
    });
    for (const skill of this.skills) this.drawSkill(skill, plan, levels, own);
    this.drawChosen(levels, own);
    this.drawTooltip(plan, levels, own);
  }

  /** Closes the window and its box. */
  dispose(): void {
    this.warning.dispose();
    this.frame.close();
  }

  /**
   * `InitItem( nJob, g_pPlayer->m_aJobSkill )` (`WndField.cpp:6736-6976`): the copy of the skills and the points (none
   * while the player has none), no skill chosen (`g_nSkillCurSelect = -1`, `__IMPROVE_SYSTEM_VER15`), and each skill the
   * window has a place for found in the copy (the first slot with it).
   */
  private initItem(own: OwnState): void {
    this.plan = new SkillPlan(own.skills, own.skillPoint, this.data.skills, own.level);
    this.seenPoints = own.skillPoint;
    this.focus = null;
    this.layoutSkills(own);
    for (const skill of this.skills) {
      skill.index = own.skills.findIndex((slot) => slot.skill === skill.skillId);
      skill.shown = '';
    }
    this.own = own;
  }

  /**
   * Piece 7 M2: the skills of the player's slots that `GetSkillPoint` has a place for, each once (`skillPlaceOf`), laid out
   * anew when they change (a job change); and the job's panel (`JOB_PANELS`), shown on the PC only: on a phone the skills
   * stand in a grid the panel's lines would not fit.
   */
  private layoutSkills(own: OwnState): void {
    const ids = own.skills.map((slot) => slot.skill)
      .filter((id, i, all) => skillPlaceOf(id) !== undefined && all.indexOf(id) === i);
    const key = ids.join(',');
    if (key !== this.laidOut) {
      this.laidOut = key;
      for (const skill of this.skills.splice(0)) skill.element.remove();
      const counts = [0, 0];
      for (const skillId of ids) {
        const section = sectionOf(skillId)!;
        const grid = section === 2 ? PHONE_PRO : PHONE_EXPERT;
        const n = section === 2 ? counts[1]! : counts[0]!;
        const at = !this.mobile
          ? { left: skillPlaceOf(skillId)!.x, top: skillPlaceOf(skillId)!.y }
          : section === 0
            ? { left: 28 + (skillId - 1) * 80, top: 111 }
            : {
              left: grid.left + (n % grid.columns) * grid.pitchX,
              top: grid.top + Math.trunc(n / grid.columns) * grid.pitchY,
            };
        if (section === 1) counts[0]!++;
        if (section === 2) counts[1]!++;
        this.skills.push(this.skillElement(skillId, at));
      }
    }
    // the first job's panel, and a second job's own under it (InitItem's strTex[0] and strTex[1], 2026-11-05)
    const line = jobLineOf(own.job);
    const panels: Array<[HTMLImageElement, string | undefined]> = [
      [this.jobPanel, line.first === null ? undefined : JOB_PANELS[line.first]],
      [this.proPanel, line.second === null ? undefined : PRO_PANELS[line.second]],
    ];
    for (const [img, panel] of panels) {
      img.hidden = this.mobile || panel === undefined;
      if (panel !== undefined && img.getAttribute('src') !== this.art.url(themeKey(panel))) img.src = this.art.url(themeKey(panel));
    }
  }

  /** A skill's element at `at` (27 x 27, or 40 x 40 on a phone), before the tooltip so that it stays under it. */
  private skillElement(skillId: number, at: { left: number; top: number }): ShownSkill {
    const doc = this.doc;
    const element = doc.createElement('div');
    element.className = 'hud-skill';
    element.setAttribute('role', 'button');
    element.dataset.skill = String(skillId);
    const size = this.mobile ? 40 : SKILL_ICON;
    place(element, { ...at, width: size, height: size });
    const icon = doc.createElement('span');
    icon.className = 'hud-skill-icon';
    const digit = this.digitElement(doc);
    place(digit, { left: -DIGIT_SHIFT, top: -DIGIT_SHIFT, width: DIGIT, height: DIGIT });
    element.append(icon, digit);
    const shown: ShownSkill = { skillId, index: -1, at, element, icon, digit, shown: '' };
    this.listen(shown);
    this.frame.body.insertBefore(element, this.tooltip);
    return shown;
  }

  /** `Destroy`: the copy, the chosen skill and the skill a finger picked go; the box with them. */
  private closed(): void {
    this.plan = null;
    this.focus = null;
    this.hovered = null;
    this.hand.dropPick();
    this.tooltip.hidden = true;
    this.tooltipShown = '';
    if (this.warning.isOpen) this.warning.close();
  }

  /**
   * `Process` (:7529-7566): every button off, then with a skill chosen and points to spend (the player's `m_nSkillPoint`),
   * and the player having that skill: + while the chosen skill is below its maximum level and its cost is left (and it is
   * still open: `SkillPlan.plus` refuses one whose prerequisite was lowered, which Neuz would raise, the server not
   * checking), - while its level is above the player's, Reset and Finish while the points left differ from the player's.
   */
  private process(own: OwnState, plan: SkillPlan): void {
    let plus = false;
    let minus = false;
    let changed = false;
    const index = this.focus;
    if (index !== null && own.skillPoint > 0) {
      const slot = plan.result()[index];
      const skill = slot === undefined ? undefined : this.data.skills.get(slot.skill);
      const mine = slot === undefined ? undefined : own.skills.find((s) => s.skill === slot.skill);
      if (slot !== undefined && skill !== undefined && mine !== undefined) {
        plus = slot.level < skill.maxLevel && skillPointCost(skill) <= plan.points && plan.active(index);
        minus = slot.level !== mine.level;
        changed = plan.changed;
      }
    }
    this.buttons.plus.disabled = !plus;
    this.buttons.minus.disabled = !minus;
    this.buttons.reset.disabled = !changed;
    this.buttons.finish.disabled = !changed;
  }

  /**
   * + and - (`OnChildNotify`, :8057-8082): on the chosen skill, while the player has points to spend. Like Reset and
   * Finish, a press on them is no placing of a skill a finger picked: it is let go, so that a slot tapped next is used.
   */
  private step(step: 1 | -1): void {
    this.hand.dropPick();
    const { plan, focus, own } = this;
    if (plan === null || focus === null || own === undefined || own.skillPoint <= 0) return;
    if (step === 1) plan.plus(focus);
    else plan.minus(focus);
    this.update(own);
  }

  /** Reset (:8083-8089): the own skills anew when points were placed (`InitItem`), and no skill chosen either way. */
  private reset(): void {
    this.hand.dropPick();
    const { plan, focus, own } = this;
    if (plan === null || focus === null || own === undefined || own.skillPoint <= 0) return;
    if (plan.changed) this.initItem(own);
    this.focus = null;
    this.update(own);
  }

  /** Finish (:8090-8098): with points placed, the box (`CWndReSkillWarning`) asks; its Yes sends them. */
  private finish(): void {
    this.hand.dropPick();
    const { plan, focus, own } = this;
    if (plan === null || focus === null || own === undefined || own.skillPoint <= 0 || !plan.changed) return;
    if (!this.warning.isOpen) this.warning.open(false);
  }

  /** The box's Yes (`CWndReSkillWarning::OnChildNotify`, :13728-13741): `SendDoUseSkillPoint( pSkillTree->GetSkill() )`. */
  private sendPlan(): void {
    if (this.plan !== null) this.onFinish(this.plan.result());
  }

  /**
   * A skill's presses: the button down on an open one chooses it (`OnLButtonDown`, :8263-8309), and with the mouse may drag
   * it to the task bar (`OnMouseMove`); a finger's tap picks it for the next slot of the bar tapped, and shows its tooltip;
   * a double click puts it in the action slot (`OnLButtonDblClk`: when `CMover::CheckSkill` lets it, on the player's own
   * levels); the mouse over it shows its tooltip (`OnMouseWndSurface`).
   */
  private listen(skill: ShownSkill): void {
    const { element } = skill;
    let finger = false;
    element.addEventListener('pointerdown', (event) => {
      finger = byFinger(event);
      if (event.button !== 0 || this.plan === null || skill.index < 0) return;
      if (finger) this.hovered = skill.index;
      if (this.plan.active(skill.index)) {
        this.focus = skill.index;
        if (!finger) this.hand.carrySkill(skill.index, event);
      }
      if (this.own !== undefined) this.update(this.own);
    });
    element.addEventListener('click', () => {
      if (!finger || this.plan === null || skill.index < 0 || !this.plan.active(skill.index)) return;
      this.hand.pickSkill(skill.index, this.frame.element);
      if (this.own !== undefined) this.update(this.own);
    });
    element.addEventListener('dblclick', () => {
      const { plan, own } = this;
      if (finger || plan === null || own === undefined || skill.index < 0 || !plan.active(skill.index)) return;
      this.focus = skill.index;
      const prop = this.data.skills.get(skill.skillId);
      const level = (id: number): number | undefined => own.skills.find((slot) => slot.skill === id)?.level;
      if (prop !== undefined && checkSkill(prop, own.level, level)) this.hand.queueSkill(skill.index);
      this.update(own);
    });
    element.addEventListener('pointerenter', (event) => {
      if (byFinger(event) || skill.index < 0) return;
      this.hovered = skill.index;
      if (this.own !== undefined) this.update(this.own);
    });
    element.addEventListener('pointerleave', (event) => {
      if (byFinger(event) || this.hovered !== skill.index) return;
      this.hovered = null;
      if (this.own !== undefined) this.update(this.own);
    });
  }

  /**
   * A skill as `OnDraw` draws it (:7812-7845): open and of a level, its icon and its level digit; open and at level 0, its
   * icon only while the mouse is over it; not open, nothing over the window's picture. Picked by a finger, it is marked.
   * On a phone, which has neither the job panel's picture nor a hover, every placed skill is drawn, dimmed while it is
   * closed or at level 0, and the chosen skill (the one + and - change: the chosen box is hidden there) keeps a mark.
   */
  private drawSkill(skill: ShownSkill, plan: SkillPlan, levels: readonly SkillSlot[], own: OwnState): void {
    const slot = skill.index < 0 ? undefined : levels[skill.index];
    const prop = slot === undefined || slot.skill === NULL_ID ? undefined : this.data.skills.get(slot.skill);
    const active = slot !== undefined && plan.active(skill.index);
    const level = slot?.level ?? 0;
    const showIcon = prop !== undefined && (this.mobile || (active && (level > 0 || this.hovered === skill.index)));
    const dim = this.mobile && prop !== undefined && (!active || level === 0);
    const chosen = skill.index >= 0 && this.focus === skill.index;
    const digit = prop !== undefined && active && level > 0 ? digitFrame(level, prop, own, slot!) : -1;
    const picked = skill.index >= 0 && this.hand.pickedSkill === skill.index;
    const shown = `${showIcon ? prop!.icon ?? '' : ''}|${digit}|${picked}|${active}|${prop?.name ?? ''}|${dim}|${chosen}`;
    if (skill.shown === shown) return;
    skill.shown = shown;
    skill.icon.style.backgroundImage = showIcon && prop!.icon !== null ? `url(${JSON.stringify(this.art.url(prop!.icon))})` : '';
    this.showDigit(skill.digit, digit);
    skill.element.toggleAttribute('data-picked', picked);
    skill.element.toggleAttribute('data-dim', dim);
    skill.element.toggleAttribute('data-chosen', chosen);
    skill.element.toggleAttribute('data-active', active);
    skill.element.dataset.level = String(level);
    if (prop === undefined) skill.element.removeAttribute('aria-label');
    else skill.element.setAttribute('aria-label', prop.name);
  }

  /** The chosen skill in WIDC_CUSTOM1 (:7859-7881): its icon, and its level digit when it has a level. */
  private drawChosen(levels: readonly SkillSlot[], own: OwnState): void {
    const slot = this.focus === null ? undefined : levels[this.focus];
    const prop = slot === undefined ? undefined : this.data.skills.get(slot.skill);
    const icon = prop?.icon ?? null;
    const image = icon === null ? '' : `url(${JSON.stringify(this.art.url(icon))})`;
    if (this.chosenIcon.style.backgroundImage !== image) this.chosenIcon.style.backgroundImage = image;
    this.showDigit(this.chosenDigit, prop !== undefined && slot!.level > 0 ? digitFrame(slot!.level, prop, own, slot!) : -1);
  }

  /** The tooltip of the skill under the mouse (or tapped), under its icon (`OnMouseWndSurface`, `PutToolTip_Skill`). */
  private drawTooltip(plan: SkillPlan, levels: readonly SkillSlot[], own: OwnState): void {
    const skill = this.skills.find((s) => s.index >= 0 && s.index === this.hovered);
    const slot = skill === undefined ? undefined : levels[skill.index];
    const prop = slot === undefined ? undefined : this.data.skills.get(slot.skill);
    const lines = prop === undefined
      ? []
      : skillTooltip(prop, slot!.level, plan.active(skill!.index), own, this.data.skills, this.data.texts);
    const shown = lines.length === 0 ? '' : `${skill!.skillId}|${lines.map((l) => `${l.text}#${l.color}`).join('\n')}`;
    if (shown === this.tooltipShown) return;
    this.tooltipShown = shown;
    this.tooltip.hidden = lines.length === 0;
    this.tooltip.replaceChildren(...lines.map((line) => {
      const element = this.doc.createElement('div');
      element.textContent = line.text;
      element.style.color = cssRgb(line.color);
      if (line.bold === true) element.style.fontWeight = 'bold';
      return element;
    }));
    if (skill !== undefined) {
      // measured at the left edge, where it has the client area's whole width, then moved under the skill as far as it
      // still ends inside the window (a window that scrolls would cut it)
      const at = skill.at;
      this.tooltip.style.left = '0px';
      this.tooltip.style.top = `${at.top + (this.mobile ? 40 : SKILL_ICON) + 4}px`;
      this.tooltip.style.left = `${Math.max(0, Math.min(at.left, (this.mobile ? 780 : CLIENT_WIDTH) - this.tooltip.offsetWidth))}px`;
    }
  }

  /** A level digit (`m_textPackNum`), its frame or none (-1). */
  private showDigit(element: HTMLElement, frame: number): void {
    const value = frame < 0 ? '' : `${-(1 + (frame % 20) * DIGIT)}px ${-(1 + Math.trunc(frame / 20) * DIGIT)}px`;
    if (element.style.backgroundPosition === value && (frame < 0) === element.hidden) return;
    element.hidden = frame < 0;
    element.style.backgroundPosition = value;
    element.dataset.frame = String(frame);
  }

  private digitElement(doc: Document): HTMLElement {
    const element = doc.createElement('span');
    element.className = 'hud-skill-digit';
    element.style.backgroundImage = `url(${JSON.stringify(this.art.url(themeKey(DIGITS)))})`;
    element.hidden = true;
    return element;
  }

  private groupTitle(doc: Document): HTMLElement {
    const element = doc.createElement('span');
    element.className = 'hud-skills-group-title';
    element.style.left = `${GROUP_TITLE.left}px`;
    element.style.top = `${GROUP_TITLE.top}px`;
    return element;
  }
}

/**
 * The digit frame of a skill at `level` (`OnDraw`, :7824-7832): `level - 1`, or 19 at its maximum; 20 on when the level is
 * not the player's own (`g_pPlayer->GetSkill( pSkill->dwSkill )`, the first slot with it).
 */
function digitFrame(level: number, skill: WebSkill, own: Pick<OwnState, 'skills'>, slot: SkillSlot): number {
  const mine = own.skills.find((s) => s.skill === slot.skill);
  const changed = mine !== undefined && mine.level !== level ? DIGIT_CHANGED : 0;
  return (level < skill.maxLevel ? level - 1 : DIGIT_MAX) + changed;
}

// ---- CWndReSkillWarning (APP_QUEITMWARNING) ---------------------------------------------------------------------------

/** `APP_QUEITMWARNING "WndTile00.tga" 1 320 160` and its title, IDS_RESDATA_INC_002922 (resData.txt.txt:2923). */
const WARNING_WIDTH = 320;
const WARNING_HEIGHT = 160;
const WARNING_TITLE = 'Warning';
/**
 * Its controls (resdata.inc:23229-23270): the text WIDC_CONTEXT "WndEditTile00.tga" (72, 8, 300, 88), WIDC_BTN_YES
 * "ButtYes.tga" (72, 96, 144, 116), WIDC_BTN_NO "ButtNo.tga" (164, 96, 236, 116), and its picture, the static WIDC_WARNING
 * "WndQueItmwarning.tga" (8, 18, 72, 82), not tiled, which `CWndBase::AdditionalSkinTexture` paints whole
 * (`WndBase.cpp:2529-2545`) at its own 64 x 64.
 */
const WARNING_TEXT: ControlRect = { left: 72, top: 8, width: 228, height: 80 };
const WARNING_YES: ControlRect = { left: 72, top: 96, width: 72, height: 20 };
const WARNING_NO: ControlRect = { left: 164, top: 96, width: 72, height: 20 };
const WARNING_PICTURE: ControlRect = { left: 8, top: 18, width: 64, height: 64 };
/** ButtYes.tga and ButtNo.tga: 288 x 20, four states of 72 px. */
const YES_NO_QUARTER = 72;
/** A control's client area inside its frame (`CWndBase::SetWndRect`, `WndBase.cpp:1846-1853`): 4 4 8 10 in. */
const INSET = { left: 4, top: 4, right: 8, bottom: 10 } as const;

/**
 * The box that asks before the skill points are spent (`CWndReSkillWarning`, `WndField.cpp:13667-13749`): WBS_MODAL
 * (`Initialize`, :13710-13713), its text `TID_GAME_SKILLLEVEL_CHANGE` (:13693-13708), at the middle of the screen
 * (`MoveParentCenter`). Yes calls `onYes` (DOUSESKILLPOINT) and closes it; No and its close button close it. Closing, it
 * calls `onClosed( closeWindow )`: opened by the window's close button or its toggle (`InitItem( TRUE )`), the skill window
 * goes with it, either way (`OnDestroy`, :13678-13689). (Enter is not copied: `EN_RETURN` comes from its text control,
 * which is disabled, :13700.)
 */
export class ReSkillWarning {
  readonly frame: WindowFrame;
  readonly modal: ModalBackdrop;
  private closeWindow = false;

  constructor(
    art: UiArt, texts: ReadonlyMap<string, { text: string }>, onYes: () => void, onClosed: (closeWindow: boolean) => void,
    doc: Document = document,
  ) {
    const text = (id: string): string => texts.get(id)?.text ?? '';
    // its own size on a phone too, as the stat points' box (2026-11-04 audit)
    const frame = new WindowFrame(WARNING_TITLE, art, { width: WARNING_WIDTH, height: WARNING_HEIGHT, mobileScale: 1, fitWhole: true }, doc);
    frame.element.classList.add('hud-confirm');
    frame.onClose = () => {
      this.modal.hide();
      const closeWindow = this.closeWindow;
      this.closeWindow = false;
      onClosed(closeWindow);
    };
    const picture = doc.createElement('div');
    picture.className = 'hud-skills-picture';
    place(picture, WARNING_PICTURE);
    picture.style.backgroundImage = themeUrl(art, 'WndQueItmwarning.tga');
    const box = doc.createElement('div');
    box.className = 'hud-confirm-box';
    place(box, WARNING_TEXT);
    box.append(editTiles(doc, art, Math.trunc(WARNING_TEXT.width / EDIT), Math.trunc(WARNING_TEXT.height / EDIT)));
    const message = doc.createElement('div');
    message.className = 'hud-confirm-text';
    message.textContent = text('TID_GAME_SKILLLEVEL_CHANGE');
    place(message, {
      left: INSET.left, top: INSET.top,
      width: WARNING_TEXT.width - INSET.left - INSET.right, height: WARNING_TEXT.height - INSET.top - INSET.bottom,
    });
    box.append(message);
    const button = (name: string, picture: string, rect: ControlRect, label: string, press: () => void) => {
      const element = pictureButton(doc, art, picture, rect, YES_NO_QUARTER, press);
      element.dataset.button = name;
      element.setAttribute('aria-label', text(label));
      return element;
    };
    const yes = button('yes', 'ButtYes.tga', WARNING_YES, 'TID_GAME_YES', () => {
      if (!this.isOpen) return;
      onYes();
      this.close();
    });
    const no = button('no', 'ButtNo.tga', WARNING_NO, 'TID_GAME_NO', () => this.close());
    frame.body.append(picture, box, yes, no);
    this.frame = frame;
    this.modal = new ModalBackdrop(frame, doc);
  }

  /** The modal backdrop with the box in it: what goes in the windows' layer. */
  get element(): HTMLElement {
    return this.modal.element;
  }

  get isOpen(): boolean {
    return this.frame.isOpen;
  }

  /** Shows it at the middle of its layer; `closeWindow`: the skill window closes with it (`InitItem( TRUE )`). */
  open(closeWindow: boolean): void {
    this.closeWindow = closeWindow;
    this.modal.show();
    // the frame's own centring, which counts its scale on a phone (2026-11-04 audit: it was 45-50 px off there)
    this.frame.open('center');
  }

  close(): void {
    this.frame.close();
  }

  dispose(): void {
    this.closeWindow = false;
    this.frame.close();
    this.element.remove();
  }
}

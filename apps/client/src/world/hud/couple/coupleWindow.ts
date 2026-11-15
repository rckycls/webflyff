// 2026-11-15 (social): the couple window (docs/2026-11-15-social-research.md §2), `CWndCoupleManager`, opened by F, the
// Start menu's Couple line or a task bar applet. Two tabs, each a child window laid out from its resdata.inc entry:
//
//   APP_COUPLE_MAIN 813        Resource/resdata.inc:27630-27660   "WndTile00.tga" tiled, 304 x 352, "Couple";
//                                                                 WIDC_TABCTRL1 10,8-298,310
//   CWndCoupleManager          _Interface/WndField.cpp:23468-23506  the tabs Couple Information, Couple Skills
//   CWndTabCtrl::InsertItem    _Interface/WndControl.cpp:4572-4598  a page fills the control less its 18 px strip
//   APP_COUPLE_TAB_INFO 815    resdata.inc:27492-27629            the partner's name, job and level, the couple level, the
//                                                                 EXP gauge, Break Up (ButtBreakUp.bmp)
//   CWndCoupleTabInfo::OnDraw  WndField.cpp:23226-23341           the texts in 0xff3f3f3f; the master/hero mark at the level's
//                                                                 right - 60, top - 1; the gauge at STATIC4 + (70, 36) to
//                                                                 (right - 10, top + 48): GauEmptyNormal white,
//                                                                 GauFillNormal 0x64ff0000
//   APP_COUPLE_TAB_SKILL 817   resdata.inc:98-130                 Bg_Couple_Skill.tga at STATIC1 + (4, 2), the three skills'
//                                                                 icons 32 px apart over it (lit from their level), each
//                                                                 its kind's name as a tooltip; CoupleSkillInfo.inc below
//
// The phone: the same window, fitted whole to the screen (WindowFrame `fitWhole`), its presses a tap.

import type { UiArt } from '../art';
import { createTooltip, positionItemDetails } from '../itemDetails';
import { place } from '../button';
import type { ControlRect } from '../button';
import { WindowFrame } from '../frame';
import { Gauge } from '../gauge';
import { ResWindow } from '../resWindow';
import type { ResLayout } from '../resWindow';
import { TAB_TILE, TAB_TILE_HEIGHT, editTiles, tabStrip } from '../tiles';
import { parseDialogText } from '../dialogue/dialogText';
import { playerDataFrame, jobFrames } from '../../friends/friendRules';
import { themeUrl } from '../art';
import { COUPLE_SKILL_KINDS, coupleExpRate, coupleSkillsAt, shownCoupleRate } from '../../couple/coupleBook';
import type { Couple } from '../../couple/coupleBook';

const WIDTH = 304;
const HEIGHT = 352;
/** WIDC_TABCTRL1 (10, 8, 298, 310). */
const TABS: ControlRect = { left: 10, top: 8, width: 288, height: 302 };
/** The tab control's tiles and strip stop 15 px short of its right (WndControl.cpp:4326, :4223), as the Motion window's. */
const SHORT = 15;
/** A page: the control less its strip (`rect.bottom -= 18`, WndControl.cpp:4587). */
const STRIP = 18;
const TEXT_COLOR = 0xff3f3f3f;

/** APP_COUPLE_TAB_INFO (resdata.inc:27492; resData.txt.txt's English). WIDC_BUTTON1's picture is set in code. */
export const COUPLE_TAB_INFO: ResLayout = {
  title: '', width: 288, height: 302,
  controls: [
    { kind: 'static', id: 'WIDC_STATIC2', rect: [12, 40, 254, 124], group: 'WndEditTile00.tga' },
    { kind: 'static', id: 'WIDC_STATIC4', rect: [12, 168, 254, 228], group: 'WndEditTile00.tga' },
    { kind: 'button', id: 'WIDC_BUTTON1', rect: [48, 240, 218, 264], picture: 'ButtBreakUp.bmp', label: 'Break Up', quarter: 170 },
    { kind: 'static', id: 'WIDC_STATIC5', rect: [12, 12, 254, 30], group: 'WndEditTile200.tga', text: 'Character Information' },
    { kind: 'static', id: 'WIDC_STATIC1', rect: [12, 140, 254, 158], group: 'WndEditTile200.tga', text: 'Couple Information' },
    { kind: 'static', id: 'WIDC_STATIC3', rect: [26, 50, 96, 66], text: 'Name' },
    { kind: 'static', id: 'WIDC_STATIC6', rect: [26, 74, 96, 90], text: 'Job' },
    { kind: 'static', id: 'WIDC_STATIC7', rect: [26, 98, 96, 114], text: 'Level' },
    { kind: 'static', id: 'WIDC_STATIC8', rect: [26, 178, 118, 194], text: 'Couple Level' },
    { kind: 'static', id: 'WIDC_STATIC9', rect: [26, 202, 96, 218], text: 'Exp' },
    { kind: 'static', id: 'WIDC_NAME', rect: [100, 50, 240, 66] },
    { kind: 'static', id: 'WIDC_JOB', rect: [100, 74, 240, 90] },
    { kind: 'static', id: 'WIDC_LEVEL', rect: [100, 98, 240, 114] },
    { kind: 'static', id: 'WIDC_COUPLE_LEVEL', rect: [122, 178, 218, 194] },
  ],
};

/** APP_COUPLE_TAB_SKILL (resdata.inc:98). */
export const COUPLE_TAB_SKILL: ResLayout = {
  title: '', width: 288, height: 302,
  controls: [
    { kind: 'static', id: 'WIDC_STATIC1', rect: [12, 46, 254, 80], group: 'WndEditTile00.tga' },
    { kind: 'static', id: 'WIDC_STATIC2', rect: [12, 12, 254, 28], group: 'WndEditTile200.tga', text: 'Skill Information' },
    { kind: 'text', id: 'WIDC_TEXT1', rect: [10, 102, 264, 246], tile: 'WndEditTile00.tga', scroll: true }, // 0x20020000
  ],
};

/**
 * `Client/Client/CoupleSkillInfo.inc` (cp949; its "※" is `¡Ø` in cp1252), which `CWndCoupleTabSkill::OnInitialUpdate` puts
 * in WIDC_TEXT1 with `AddParsingString` (WndField.cpp:23356-23370).
 */
export const COUPLE_SKILL_INFO = [
  '#b#cff0000ff Couple Skill Info.#nb#nc',
  '* Skills are automatically acquired after reaching certain skill level',
  '* Acquired skills will be automatically activated when connected with partner in same channel',
  '',
  '#b#cff0000ff Couple Skill Type#nb#nc',
  '* Power of Love',
  ' - Level1 : Attack Power+20, Defense Power+10',
  '             (Couple Level6 needed)',
  ' - Level2 : Attack Power+40, Defense Power+20',
  '             (Couple Level11 needed)',
  ' - Level3 : Attack Power+60, Defense Power+30',
  '             (Couple Level16 needed)',
  ' - Level4 : Attack Power+80, Defense Power+40',
  '             (Couple Level21 needed)',
  '* Bless of Love',
  ' - Level1 : Exp point+4%',
  '             (Couple Level11 needed)',
  ' - Level2 : Exp point+8%',
  '             (Couple Level21 needed)',
  '* Miracle of Love',
  ' - Level1 : Drop Rate+5%',
  '             (Couple Level21 needed)',
  '',
  '#b#cffff0000※ Breaking up with partner will reset the couple skill to Level 0.#nb#nc',
].join('\n');

/** The partner as the player data has it (`CPlayerDataCenter::GetPlayerData`). */
export interface CouplePartner {
  name: string;
  job: number;
  level: number;
}

export interface CoupleWindowHost {
  text(tid: string): string;
  jobName(job: number): string;
  /** The own couple, or null. */
  couple(): Readonly<Couple> | null;
  /** The partner's data, or null with no couple. */
  partner(): CouplePartner | null;
  /** An item's name and icon key (the skills' kinds). */
  item(itemId: number): { name: string; icon: string | null } | undefined;
  /** Break Up pressed with a couple: the CM_CANCELCOUPLE box (WndField.cpp:23187-23222). */
  breakUp(partnerName: string): void;
}

const css = (color: number): string => `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;

export class CoupleWindow {
  readonly frame: WindowFrame;
  private readonly info: ResWindow;
  private readonly skill: ResWindow;
  private readonly pages: HTMLElement[];
  private strip: HTMLElement;
  private tab = 0;
  private readonly empty: Gauge;
  private readonly fill: Gauge;
  private readonly mark: HTMLElement;
  private readonly icons: HTMLElement[];
  private tooltip: HTMLElement | null = null;
  /** What `refresh` last drew, so that a frame with nothing new changes nothing. */
  private drawn = '';

  constructor(private readonly art: UiArt, private readonly host: CoupleWindowHost, private readonly doc: Document = document) {
    const title = host.text('TID_GAME_COUPLE') || 'Couple';
    this.frame = new WindowFrame(title, art, { width: WIDTH, height: HEIGHT, mobileScale: 1, fitWhole: true }, doc);
    this.frame.element.classList.add('hud-couple');
    this.frame.onClose = () => this.hideTip();
    const body = this.frame.body;
    const drawn = TABS.width - SHORT;
    const tiles = editTiles(doc, art, Math.trunc(drawn / TAB_TILE), Math.trunc(TABS.height / 8));
    tiles.classList.add('hud-couple-tiles');
    place(tiles, { ...TABS, width: drawn });
    body.append(tiles);
    this.info = new ResWindow(COUPLE_TAB_INFO, art, doc);
    this.skill = new ResWindow(COUPLE_TAB_SKILL, art, doc);
    this.pages = [this.info, this.skill].map((window, i) => {
      const page = doc.createElement('div');
      page.className = 'hud-couple-page';
      page.dataset.page = i === 0 ? 'info' : 'skill';
      place(page, { left: TABS.left, top: TABS.top, width: TABS.width, height: TABS.height - STRIP });
      page.append(...window.frame.body.childNodes);
      body.append(page);
      return page;
    });
    // the info tab's texts in 0xff3f3f3f (OnDraw), the gauge, the master/hero mark, Break Up
    for (const id of ['WIDC_NAME', 'WIDC_JOB', 'WIDC_LEVEL', 'WIDC_COUPLE_LEVEL']) this.info.control(id).style.color = css(TEXT_COLOR);
    const gauge: ControlRect = { left: 12 + 70, top: 168 + 36, width: 254 - 10 - (12 + 70), height: 12 };
    this.empty = new Gauge(art, 'GauEmptyNormal.bmp', 0xffffffff, 'couple-empty', doc);
    this.fill = new Gauge(art, 'GauFillNormal.bmp', 0x64ff0000, 'couple-exp', doc);
    for (const piece of [this.empty, this.fill]) {
      piece.element.classList.add('hud-couple-gauge');
      piece.element.style.left = `${gauge.left}px`;
      piece.element.style.top = `${gauge.top}px`;
      this.pages[0]!.append(piece.element);
    }
    this.empty.set(gauge.width);
    this.mark = doc.createElement('div');
    this.mark.className = 'hud-couple-jobtype';
    this.mark.style.backgroundImage = themeUrl(art, 'icon_PlayerData.dds');
    this.mark.style.left = `${240 - 60}px`;
    this.mark.style.top = `${98 - 1}px`;
    this.mark.hidden = true;
    this.pages[0]!.append(this.mark);
    this.info.button('WIDC_BUTTON1').addEventListener('click', () => {
      const partner = host.partner();
      if (host.couple() !== null && partner !== null) host.breakUp(partner.name);
    });
    // the skill tab: its background and the three icons over it, the help below
    const background = doc.createElement('div');
    background.className = 'hud-couple-skill-bg';
    background.style.backgroundImage = themeUrl(art, 'Bg_Couple_Skill.tga');
    place(background, { left: 12 + 4, top: 46 + 2, width: 96, height: 32 });
    this.pages[1]!.append(background);
    this.icons = COUPLE_SKILL_KINDS.map((kind, i) => {
      const icon = doc.createElement('div');
      icon.className = 'hud-couple-skill';
      icon.dataset.skill = String(kind);
      place(icon, { left: 12 + 4 + i * 32, top: 46 + 2, width: 32, height: 32 });
      const name = host.item(kind)?.name ?? '';
      icon.setAttribute('aria-label', name);
      icon.addEventListener('pointerenter', () => this.showTip(name, icon));
      icon.addEventListener('pointerleave', () => this.hideTip());
      icon.addEventListener('click', () => this.showTip(name, icon));
      this.pages[1]!.append(icon);
      return icon;
    });
    this.skill.setContent('WIDC_TEXT1', ...this.helpNodes());
    this.strip = this.makeStrip();
    body.append(this.strip);
    this.showTab(0);
  }

  get isOpen(): boolean {
    return this.frame.isOpen;
  }

  /** F, the Start menu, an applet slot: opened centred (`MoveParentCenter`), or closed. */
  toggle(): void {
    if (this.frame.isOpen) this.frame.close();
    else {
      this.frame.open('center');
      this.refresh(true);
    }
  }

  showTab(tab: number): void {
    this.tab = tab;
    this.pages.forEach((page, i) => { page.hidden = i !== tab; });
    const strip = this.makeStrip();
    this.strip.replaceWith(strip);
    this.strip = strip;
    this.hideTip();
  }

  get currentTab(): number {
    return this.tab;
  }

  /** What `OnDraw` draws each frame: the partner, the couple level, the gauge, the lit skills. */
  refresh(force = false): void {
    if (!this.frame.isOpen) return;
    const couple = this.host.couple();
    const partner = couple === null ? null : this.host.partner();
    const drawn = JSON.stringify([couple, partner]);
    if (!force && drawn === this.drawn) return;
    this.drawn = drawn;
    if (couple !== null && partner !== null) {
      this.info.setText('WIDC_NAME', partner.name);
      this.info.setText('WIDC_JOB', this.host.jobName(partner.job));
      this.info.setText('WIDC_LEVEL', String(partner.level));
      this.info.setText('WIDC_COUPLE_LEVEL', String(couple.level));
      const type = jobFrames(partner.job, partner.level).type;
      const at = type === null ? null : playerDataFrame(type);
      this.mark.hidden = at === null;
      if (at !== null) {
        this.mark.style.width = `${at.size}px`;
        this.mark.style.height = `${at.size}px`;
        this.mark.style.backgroundPosition = `-${at.x}px -${at.y}px`;
      }
    } else {
      for (const id of ['WIDC_NAME', 'WIDC_JOB', 'WIDC_LEVEL', 'WIDC_COUPLE_LEVEL']) this.info.setText(id, '');
      this.mark.hidden = true;
    }
    // the fill: the rate bumped, at most the gauge (an empty one with no couple: rectTemp stays empty)
    const width = Number(this.empty.element.dataset.width ?? 0);
    const rate = couple === null ? 0 : shownCoupleRate(coupleExpRate(couple.level, couple.exp));
    this.fill.set(Math.min(width, Math.trunc(width * rate)));
    this.info.frame.element.dataset.level = String(couple?.level ?? 0);
    this.pages[0]!.dataset.coupled = String(couple !== null);
    // the skills of the couple's level, each its kind's icon (`vSkills[i] > 0`)
    const skills = coupleSkillsAt(couple?.level ?? 1);
    this.icons.forEach((icon, i) => {
      const lit = couple !== null && skills[i]! > 0;
      icon.toggleAttribute('data-active', lit);
      // MakePath( DIR_ICON, szIcon ): Client/Icon's copy of the item's icon (`ui/`, not `ui/item/`)
      const key = this.host.item(COUPLE_SKILL_KINDS[i]!)?.icon?.replace('ui/item/', 'ui/');
      icon.style.backgroundImage = lit && key !== undefined && key !== null ? `url(${JSON.stringify(this.art.url(key))})` : '';
    });
  }

  private makeStrip(): HTMLElement {
    const titles = [this.host.text('TID_GAME_COUPLE_INFO') || 'Couple Information', this.host.text('TID_GAME_COUPLE_SKILL') || 'Couple Skills'];
    const strip = tabStrip(this.doc, this.art, TABS.width - SHORT, titles, this.tab, (tab) => this.showTab(tab));
    strip.classList.add('hud-couple-tabs');
    strip.style.left = `${TABS.left}px`;
    strip.style.top = `${TABS.top + TABS.height - TAB_TILE_HEIGHT}px`;
    return strip;
  }

  /** CoupleSkillInfo.inc's runs as spans (the #b #c codes), its lines as breaks. */
  private helpNodes(): Node[] {
    return parseDialogText(COUPLE_SKILL_INFO).map((run) => {
      const span = this.doc.createElement('span');
      span.textContent = run.text;
      span.style.color = css(run.color);
      if (run.bold) span.style.fontWeight = 'bold';
      span.style.whiteSpace = 'pre-wrap';
      return span;
    });
  }

  private showTip(name: string, anchor: HTMLElement): void {
    this.hideTip();
    if (name === '') return;
    const tip = createTooltip(this.doc, this.art, [[{ text: name, color: 0x000000 }]]);
    tip.classList.add('hud-taskbar-tooltip', 'hud-couple-tooltip');
    this.doc.body.append(tip);
    positionItemDetails(tip, anchor, this.doc);
    this.tooltip = tip;
  }

  private hideTip(): void {
    this.tooltip?.remove();
    this.tooltip = null;
  }
}

// The Option window (APP_OPTIONEX, "Option", ResData.inc:13196): `CWndTotalOption` (Source/_Interface/WndOption.cpp:31-89),
// a tab control (WIDC_TABCTRL1 10,6-506,376) with two pages, "Video" (APP_OPTEX_AV12) and "Game / Audio"
// (APP_OPTEX_GAME12, ResData.inc:20544), whose class is `CWndOptionGame` (Source/_Interface/WndOptionGame.cpp).
// 2026-11-17 (view-equip-options): the whole Game / Audio page (docs/2026-11-17-view-equip-options.md); before, only its
// Sound Option sliders (Piece 6 M2). The Video page's graphics settings are not the browser's: its tab is greyed.
//
// The page as `OnInitialUpdate` leaves it (:56-197): __CSC_VER9_REMOVE_PKSETTING hides "Automatic P.K Mode" and moves
// "Duel Requests" up into its place. Each pair of radios is one group; what each sets (`OnChildNotify`, :271-396):
//
//   Trading                 RADIO1/2      g_Option.m_bTrade           the browser's storage (options/gameOptions.ts)
//   Whispers & Messages     RADIO3/4      m_bSay                      friends/messenger.ts's options
//   Friend Invites          MESSENGER_*   m_bMessenger                friends/messenger.ts's options
//   Duel Requests           ACCEPTPVP_*   SendChangePKPVPMode( PVPCONFIRM_MODE, 3 / 2 ); shown from the own m_dwMode
//   Party Invites           RADIO5/6      m_bParty                    options/gameOptions.ts
//   Automatic Attack        RADIO14/15    m_bAutoAttack               options/gameOptions.ts
//   Allow Inventory View    RADIO12/13    SendQueryEquipSetting( TRUE / FALSE ); shown from EQUIP_DENIAL_MODE
//   Message Alarm           RADIO7/8      m_bMessengerJoin            friends/messenger.ts's options
//   Help Option             CHECK1/2      m_nInstantHelp, m_pGuide    greyed: the browser has neither the instant help nor
//                                                                     the guide (Info Pang)
//   Window Effects          CHECK3        m_nWindowAlpha 128 / 255    the windows' pictures at that alpha (style.css)
//   Sound Option            CUSTOM1/2     the BGM and effect volumes  audio/soundSettings.ts
//                           BATTLE_BGM    m_bBattleBGM                options/gameOptions.ts
//
// The sliders (:29-52, :225-468): WndVolumeBar.tga stretched over the control, ButtSpin.tga 16 x 16 at `left + step *
// trunc( width / 11 )`; a press on the knob drags it one step per move toward the pointer, kept to 0..10
// (GetRangeSlider); a press elsewhere on the bar moves it one step toward the press (GetSliderStep). A focused bar also
// takes the arrow keys (Piece 6 M2's ruling 2). Each change applies at once.
//
// The phone (the compact V15 panels, docs/2026-11-14-phone-panels.md): the same controls, the groups in four columns, the
// window at its content's size. 2026-11-20 (phone-camera-invert, docs/2026-11-20-phone-camera-invert.md): on the phone
// only, one more group, "Invert Camera" (not Neuz's), its two checks side by side as a pair of radios: "Up/Down" and
// "Left/Right" turn the finger drag's camera the other way (options/gameOptions.ts `invertCameraUp`, `invertCameraTurn`).
// The desktop page stays as Neuz has it: the mouse's drag does not read them.

import type { GameAudio } from '../../audio/gameAudio';
import type { FriendOptions } from '../friends/messenger';
import type { GameOptions } from '../options/gameOptions';
import { EQUIP_DENIAL_MODE, PVPCONFIRM_MODE } from '@flyffweb/protocol';
import type { UiArt } from './art';
import { themeKey } from './art';
import { place } from './button';
import type { ControlRect } from './button';
import { WindowFrame } from './frame';
import { radioButton, sixFrameButton } from './radio';
import type { RadioButton } from './radio';
import { TAB_TILE, TAB_TILE_HEIGHT, editTiles, tabStrip } from './tiles';

/** `IDS_RESDATA_INC_001290`, the Option window's title. */
const TITLE = 'Option';
/** APP_OPTIONEX's size, and WIDC_TABCTRL1 in its client area. */
const WIDTH = 512;
const HEIGHT = 416;
const TABS: ControlRect = { left: 10, top: 6, width: 496, height: 370 };
/** The page's place in the tab control: `rect.left = 5; rect.top = 0` (WndOption.cpp:39-41). */
const PAGE = { x: TABS.left + 5, y: TABS.top };
/** `rect.right -= 15`: the tab control's tiles and strip stop 15 px short of its right (WndControl.cpp:4326, :4223). */
const SHORT = 15;
/** The tabs (`TID_TOOLTIP_OPT_VIDEOAUDIO`, `TID_TOOLTIP_OPT_GAME`, WndOption.cpp:57-66). */
const TAB_TITLES = ['Video', 'Game / Audio'] as const;
/** MAX_SLIDER (WndOptionGame.cpp:9). */
const MAX_STEP = 10;
/** The custom controls' width: 458 - 348. */
const BAR_WIDTH = 110;
const BAR_HEIGHT = 18;
const KNOB = 16;
/** `GetStepPos`: `nStep * ( nWidth / ( MAX_SLIDER + 1 ) )`, integer division. */
const STEP_PX = Math.trunc(BAR_WIDTH / (MAX_STEP + 1));

type Volume = 'music' | 'effects';
type Rect = readonly [left: number, top: number, right: number, bottom: number];

/** A pair of radios (one option), the first one "on". */
export type PairId = 'trade' | 'say' | 'messenger' | 'duel' | 'party' | 'autoAttack' | 'equip' | 'join';
type CheckId = 'instantHelp' | 'guide' | 'translucent' | 'battleMusic' | CameraCheck;
/** 2026-11-20 (phone-camera-invert): the phone's "Invert Camera" checks, named as the options they set. */
type CameraCheck = 'invertCameraUp' | 'invertCameraTurn';

interface PairSpec {
  id: PairId;
  title: string;
  labels: readonly [string, string];
  tips?: readonly [string, string];
  /** The static's rect and the radios', in the page (resdata.inc, after `OnInitialUpdate`'s moves). */
  header: Rect;
  radios: readonly [Rect, Rect];
}

const PAIRS: readonly PairSpec[] = [
  {
    id: 'trade', title: 'Trading', labels: ['Allow', 'Refuse'],
    tips: ['Allow trade requests from players.', 'Refuse trade requests from players.'],
    header: [8, 24, 222, 42], radios: [[8, 44, 108, 60], [104, 44, 204, 60]],
  },
  {
    id: 'say', title: 'Whispers & Messages', labels: ['Allow', 'Disapprove'],
    tips: ['Accept Whispers & Messages from players.', 'Ignore incoming Whispers and Messages'],
    header: [8, 70, 222, 88], radios: [[8, 90, 108, 106], [104, 90, 204, 106]],
  },
  {
    id: 'messenger', title: 'Friend Invites', labels: ['Approve', 'Disapprove'],
    tips: ['Show Friends List Invitations', 'Filter out Friends List Invitations'],
    header: [8, 116, 222, 134], radios: [[8, 136, 108, 152], [104, 136, 204, 152]],
  },
  {
    // WIDC_STATIC9 and the ACCEPTPVP radios moved to WIDC_STATIC8's and the AUTOPK radios' places (:145-160)
    id: 'duel', title: 'Duel Requests', labels: ['ON', 'OFF'], tips: ['Approve PvP request', 'Disapprove PvP request'],
    header: [8, 162, 222, 180], radios: [[8, 182, 108, 198], [104, 182, 204, 198]],
  },
  {
    id: 'party', title: 'Party Invites', labels: ['Allow', 'Disapprove'], tips: ['Show Party Invitations', 'Ignore Party Invitations'],
    header: [8, 254, 222, 272], radios: [[8, 274, 108, 290], [104, 274, 204, 290]],
  },
  {
    id: 'autoAttack', title: 'Automatic Attack', labels: ['ON', 'OFF'],
    header: [8, 300, 222, 316], radios: [[8, 318, 108, 334], [104, 318, 200, 334]],
  },
  {
    id: 'equip', title: 'Allow Inventory View', labels: ['Approve', 'Refuse'],
    header: [240, 24, 470, 42], radios: [[240, 44, 336, 60], [332, 44, 428, 60]],
  },
  {
    id: 'join', title: 'Message Alarm', labels: ['ON', 'OFF'],
    header: [240, 70, 470, 86], radios: [[240, 90, 336, 106], [332, 90, 428, 106]],
  },
];

/** The statics with no radios under them. */
const STATICS: ReadonlyArray<{ id: string; title: string; rect: Rect }> = [
  { id: 'heading', title: 'Game Options', rect: [8, 0, 108, 18] },
  { id: 'help', title: 'Help Option', rect: [240, 116, 470, 132] },
  { id: 'effects', title: 'Window Effects', rect: [240, 180, 470, 196] },
  { id: 'sound', title: 'Sound Option', rect: [240, 224, 336, 240] },
  { id: 'bgm', title: 'BGM', rect: [240, 244, 342, 264] },
  { id: 'soundEffect', title: 'Sound Effect', rect: [240, 266, 342, 286] },
];

const CHECKS: ReadonlyArray<{ id: CheckId; label: string; rect: Rect; tip?: string }> = [
  { id: 'instantHelp', label: 'Beginner Guide', rect: [240, 134, 470, 150], tip: 'Not in this client.' },
  { id: 'guide', label: 'Info Pang', rect: [240, 154, 470, 170], tip: 'Not in this client.' },
  { id: 'translucent', label: 'Translucency', rect: [240, 198, 470, 214] },
  { id: 'battleMusic', label: 'Battle Music', rect: [240, 288, 470, 304] },
];

/** 2026-11-20 (phone-camera-invert): the phone's "Invert Camera" group, its checks in the order they stand. */
const CAMERA_TITLE = 'Invert Camera';
const CAMERA_CHECKS: ReadonlyArray<{ id: CameraCheck; label: string; tip: string }> = [
  { id: 'invertCameraUp', label: 'Up/Down', tip: 'A finger dragged up tilts the camera down.' },
  { id: 'invertCameraTurn', label: 'Left/Right', tip: 'A finger dragged right turns the camera left.' },
];

const BARS: Readonly<Record<Volume, readonly [number, number]>> = { music: [348, 244], effects: [348, 266] };

/** The phone's columns: four of groups, each group a heading and then its radios side by side, its checks a row each. */
const PHONE_COLUMN = 176;
const PHONE_GAP = 8;
const PHONE_ROW = 22;
const PHONE_HEADER = 18;
const PHONE_GROUP_GAP = 6;
const PHONE_PAD = 6;

interface Placement {
  statics: Map<string, ControlRect>;
  radios: Map<PairId, [ControlRect, ControlRect]>;
  checks: Map<CheckId, ControlRect>;
  bars: Map<Volume, ControlRect>;
  /** The tab control's size. */
  width: number;
  height: number;
}

const rectOf = ([left, top, right, bottom]: Rect): ControlRect =>
  ({ left: PAGE.x + left, top: PAGE.y + top, width: right - left, height: bottom - top });

/** The desktop: every control at its resdata.inc rect, in the window's client area. */
function desktopPlacement(): Placement {
  const statics = new Map<string, ControlRect>();
  const radios = new Map<PairId, [ControlRect, ControlRect]>();
  for (const pair of PAIRS) {
    statics.set(pair.id, rectOf(pair.header));
    radios.set(pair.id, [rectOf(pair.radios[0]), rectOf(pair.radios[1])]);
  }
  for (const s of STATICS) statics.set(s.id, rectOf(s.rect));
  const checks = new Map(CHECKS.map((c) => [c.id, rectOf(c.rect)] as const));
  const bars = new Map((Object.keys(BARS) as Volume[]).map((v) => {
    const [x, y] = BARS[v];
    return [v, { left: PAGE.x + x, top: PAGE.y + y, width: BAR_WIDTH, height: BAR_HEIGHT }] as const;
  }));
  return { statics, radios, checks, bars, width: TABS.width, height: TABS.height };
}

/**
 * The phone: the groups in Neuz's order (its left column top to bottom, then its right) in four columns, from the tab
 * control's top left (`at`). "Game Options" is left out: the page's own heading, which the columns have no room for.
 */
function phonePlacement(at: { x: number; y: number }): Placement {
  const statics = new Map<string, ControlRect>();
  const radios = new Map<PairId, [ControlRect, ControlRect]>();
  const checks = new Map<CheckId, ControlRect>();
  const bars = new Map<Volume, ControlRect>();
  // 2026-11-20 (phone-camera-invert): "Invert Camera" under Automatic Attack, where the second column had room (it ends
  // above the fourth's bottom, so the window keeps its height)
  const columns: Array<Array<PairId | 'help' | 'effects' | 'sound' | 'camera'>> = [
    ['trade', 'say', 'messenger'], ['duel', 'party', 'autoAttack', 'camera'], ['equip', 'join', 'effects'], ['help', 'sound'],
  ];
  let height = 0;
  columns.forEach((groups, column) => {
    const x = at.x + PHONE_PAD + column * (PHONE_COLUMN + PHONE_GAP);
    let y = at.y + PHONE_PAD;
    const row = (width: number = PHONE_COLUMN, dx = 0, h = PHONE_HEADER): ControlRect => ({ left: x + dx, top: y, width, height: h });
    for (const group of groups) {
      statics.set(group, row());
      y += PHONE_HEADER + 2;
      if (group === 'help' || group === 'effects') {
        for (const check of group === 'help' ? ['instantHelp', 'guide'] as const : ['translucent'] as const) {
          checks.set(check, row());
          y += PHONE_ROW;
        }
      } else if (group === 'sound') {
        // each slider's word on a row of its own, the bar under it ("Sound Effect" is wider than the room beside a bar)
        for (const [volume, label] of [['music', 'bgm'], ['effects', 'soundEffect']] as const) {
          statics.set(label, row());
          y += PHONE_HEADER;
          bars.set(volume, { left: x, top: y, width: BAR_WIDTH, height: BAR_HEIGHT });
          y += PHONE_ROW;
        }
        checks.set('battleMusic', row());
        y += PHONE_ROW;
      } else if (group === 'camera') {
        // the two checks side by side, as a pair of radios stands
        const half = PHONE_COLUMN / 2;
        checks.set('invertCameraUp', row(half - 2));
        checks.set('invertCameraTurn', row(half - 2, half));
        y += PHONE_ROW;
      } else {
        const half = PHONE_COLUMN / 2;
        radios.set(group, [row(half - 2), row(half - 2, half)]);
        y += PHONE_ROW;
      }
      y += PHONE_GROUP_GAP;
    }
    height = Math.max(height, y - at.y);
  });
  return {
    statics, radios, checks, bars,
    width: PHONE_PAD * 2 + 4 * PHONE_COLUMN + 3 * PHONE_GAP, height: height + TAB_TILE_HEIGHT + 4,
  };
}

/** What the window reads and changes. */
export interface OptionHost {
  /** The sliders' steps and their setters; null when the page has no sound (the sliders greyed). */
  audio: Pick<GameAudio, 'settings' | 'setEffects' | 'setMusic'> | null;
  /** The options the window changes in place, then keeps (`saveGame`, `saveFriend`). */
  game: GameOptions;
  friend: FriendOptions;
  saveGame(): void;
  saveFriend(): void;
  /** The own player's `m_dwMode`, or null before it is in. */
  ownMode(): number | null;
  /** `SendQueryEquipSetting( bAllow )`. */
  sendEquipSetting(allow: boolean): void;
  /** `SendChangePKPVPMode( PVPCONFIRM_MODE, accept ? 3 : 2 )`. */
  sendDuelRequests(accept: boolean): void;
  /** Translucency changed: the windows' pictures at 128 or 255. */
  translucent(on: boolean): void;
}

interface Slider {
  bar: HTMLElement;
  knob: HTMLElement;
  step: number;
  dragging: boolean;
}

const clamp = (step: number): number => Math.max(0, Math.min(MAX_STEP, step));

export class OptionWindow {
  readonly frame: WindowFrame;
  private readonly mobile: boolean;
  private readonly pairs = new Map<PairId, [RadioButton, RadioButton]>();
  private readonly checks = new Map<CheckId, RadioButton>();
  private readonly sliders: Record<Volume, Slider>;

  constructor(art: UiArt, private readonly host: OptionHost, private readonly doc: Document = document) {
    this.mobile = doc.defaultView?.matchMedia?.('(max-width: 1000px) and (pointer: coarse)').matches === true;
    const phoneTabs = { x: 4, y: 4 };
    const at = this.mobile ? phonePlacement(phoneTabs) : desktopPlacement();
    const tabs: ControlRect = this.mobile ? { left: phoneTabs.x, top: phoneTabs.y, width: at.width, height: at.height } : TABS;
    // the client area is 4 px in and 22 px down, 8 right and 10 under (frame.ts)
    this.frame = new WindowFrame(TITLE, art, this.mobile
      ? { width: tabs.left * 2 + tabs.width + 12, height: tabs.top * 2 + tabs.height + 32, mobileScale: 1, fitWhole: true }
      : { width: WIDTH, height: HEIGHT }, doc);
    this.frame.element.classList.add('hud-option');
    // 2026-11-20 (mouse-drag-ui): its place kept for the next time (regInfo.dat, frame.ts `rememberAs`)
    this.frame.rememberAs = 'APP_OPTIONEX';
    this.frame.element.toggleAttribute('data-phone', this.mobile);
    // 2026-11-16 (owner): above the phone's open bag, as the other windows a Start menu line opens
    this.frame.overBag = true;
    const body = this.frame.body;
    const drawn = this.mobile ? tabs.width : tabs.width - SHORT;
    // the tab control's edit tiles, every 8 px over its whole height (CWndTabCtrl::AdditionalSkinTexture, :4320-4365)
    const tiles = editTiles(doc, art, Math.trunc(drawn / TAB_TILE), Math.trunc(tabs.height / 8));
    tiles.classList.add('hud-option-tiles');
    place(tiles, { ...tabs, width: drawn });
    const page = doc.createElement('div');
    page.className = 'hud-option-page';
    page.dataset.page = 'game';
    page.setAttribute('role', 'tabpanel');
    page.setAttribute('aria-label', TAB_TITLES[1]);
    body.append(tiles, page);

    const titles = new Map<string, string>([
      ...PAIRS.map((p) => [p.id, p.title] as const), ...STATICS.map((s) => [s.id, s.title] as const), ['camera', CAMERA_TITLE],
    ]);
    for (const [id, rect] of at.statics) page.append(this.static(titles.get(id) ?? '', rect, id));
    for (const pair of PAIRS) {
      const rects = at.radios.get(pair.id)!;
      const make = (index: 0 | 1): RadioButton => {
        const radio = radioButton(doc, art, pair.labels[index], rects[index], () => this.choose(pair.id, index === 0));
        radio.element.dataset.option = pair.id;
        radio.element.dataset.value = index === 0 ? 'on' : 'off';
        radio.element.setAttribute('aria-label', `${pair.title}: ${pair.labels[index]}`);
        if (pair.tips !== undefined) radio.element.title = pair.tips[index];
        page.append(radio.element);
        return radio;
      };
      this.pairs.set(pair.id, [make(0), make(1)]);
    }
    for (const check of [...CHECKS, ...CAMERA_CHECKS]) {
      // the camera's checks only where the placement has them (the phone)
      const rect = at.checks.get(check.id);
      if (rect === undefined) continue;
      const camera = CAMERA_CHECKS.some((c) => c.id === check.id);
      const box = sixFrameButton(doc, art, 'ButtCheck.bmp', 14, rect,
        {
          role: 'checkbox', name: camera ? `${CAMERA_TITLE}: ${check.label}` : check.label, label: check.label,
          ...(check.tip !== undefined ? { tooltip: check.tip } : {}),
        },
        () => this.toggleCheck(check.id));
      box.element.dataset.option = check.id;
      // the instant help and the guide are not the browser's: shown as Neuz has them, greyed
      if (check.id === 'instantHelp' || check.id === 'guide') box.disabled = true;
      this.checks.set(check.id, box);
      page.append(box.element);
    }
    const slider = (which: Volume, name: string): Slider => {
      const bar = doc.createElement('div');
      bar.className = 'hud-option-bar';
      bar.dataset.volume = which;
      bar.tabIndex = 0;
      bar.setAttribute('role', 'slider');
      bar.setAttribute('aria-label', name);
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', String(MAX_STEP));
      place(bar, at.bars.get(which)!);
      bar.style.backgroundImage = `url(${JSON.stringify(art.url(themeKey('WndVolumeBar.tga')))})`;
      const knob = doc.createElement('span');
      knob.className = 'hud-option-knob';
      Object.assign(knob.style, {
        width: `${KNOB}px`, height: `${KNOB}px`, backgroundImage: `url(${JSON.stringify(art.url(themeKey('ButtSpin.tga')))})`,
      });
      bar.append(knob);
      const s: Slider = { bar, knob, step: 0, dragging: false };
      if (this.host.audio === null) bar.setAttribute('aria-disabled', 'true');
      else this.listen(which, s);
      page.append(bar);
      return s;
    };
    this.sliders = { music: slider('music', 'BGM'), effects: slider('effects', 'Sound Effect') };

    // the strip of tabs at the tab control's bottom, Game / Audio chosen; Video greyed
    const strip = tabStrip(doc, art, drawn, TAB_TITLES, 1);
    strip.classList.add('hud-option-tabs');
    strip.style.left = `${tabs.left}px`;
    strip.style.top = `${tabs.top + tabs.height - TAB_TILE_HEIGHT}px`;
    strip.setAttribute('role', 'tablist');
    strip.querySelectorAll<HTMLButtonElement>('.hud-tab-title').forEach((tab, i) => {
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(i === 1));
      if (i === 0) {
        tab.disabled = true;
        tab.title = 'The video settings are not in this client.';
      }
    });
    body.append(strip);
  }

  get isOpen(): boolean {
    return this.frame.isOpen;
  }

  /** Opens the window as `OnInitialUpdate` sets it (:56-197): each control from what is kept; or closes it. */
  toggle(): void {
    if (this.frame.isOpen) {
      this.frame.close();
      return;
    }
    this.refresh();
    this.frame.open('center');
  }

  /** Every control as the options, the own mode and the volumes are now. */
  refresh(): void {
    const { game, friend } = this.host;
    const mode = this.host.ownMode() ?? 0;
    const states: Record<PairId, boolean> = {
      trade: game.trade, say: friend.say, messenger: friend.messenger, party: game.party, autoAttack: game.autoAttack,
      join: friend.join,
      // `pWndButton[ g_pPlayer->IsMode( PVPCONFIRM_MODE ) ]` (:170-174); EQUIP_DENIAL_MODE checks Refuse (:176-182)
      duel: (mode & PVPCONFIRM_MODE) === 0, equip: (mode & EQUIP_DENIAL_MODE) === 0,
    };
    for (const [id, on] of Object.entries(states) as Array<[PairId, boolean]>) this.showPair(id, on);
    this.checks.get('translucent')!.checked = game.translucent;
    this.checks.get('battleMusic')!.checked = game.battleMusic;
    for (const { id } of CAMERA_CHECKS) {
      const box = this.checks.get(id);
      if (box !== undefined) box.checked = game[id];
    }
    if (this.host.audio !== null) {
      const { music, effects } = this.host.audio.settings;
      this.show('music', music);
      this.show('effects', effects);
    }
  }

  dispose(): void {
    this.frame.close();
    this.frame.element.remove();
  }

  /** A radio pressed (`OnChildNotify`, :281-393): the option set and kept, or the server told. */
  private choose(id: PairId, on: boolean): void {
    const { game, friend } = this.host;
    switch (id) {
      case 'trade': case 'party': case 'autoAttack':
        game[id] = on;
        this.host.saveGame();
        break;
      case 'say': case 'messenger': case 'join':
        friend[id] = on;
        this.host.saveFriend();
        break;
      case 'duel':
        this.host.sendDuelRequests(on);
        break;
      case 'equip':
        this.host.sendEquipSetting(on);
        break;
    }
    this.showPair(id, on);
  }

  private toggleCheck(id: CheckId): void {
    const box = this.checks.get(id)!;
    if (box.disabled) return;
    const on = !box.checked;
    box.checked = on;
    if (id === 'translucent') {
      this.host.game.translucent = on;
      this.host.translucent(on);
    } else if (id === 'battleMusic' || id === 'invertCameraUp' || id === 'invertCameraTurn') {
      this.host.game[id] = on;
    }
    this.host.saveGame();
  }

  private showPair(id: PairId, on: boolean): void {
    const [first, second] = this.pairs.get(id)!;
    first.checked = on;
    second.checked = !on;
  }

  /** A plain static (`CWndStatic`): its title blue at (2, 2), as resWindow.ts draws one. */
  private static(title: string, rect: ControlRect, id: string): HTMLElement {
    const element = this.doc.createElement('div');
    element.className = 'hud-res-static hud-option-static';
    element.dataset.static = id;
    place(element, rect);
    const text = this.doc.createElement('span');
    text.className = 'hud-res-static-text';
    text.textContent = title;
    element.append(text);
    return element;
  }

  private listen(which: Volume, s: Slider): void {
    /** The pointer's x in the bar's own pixels, whatever the HUD's scale. */
    const xOf = (event: MouseEvent): number => {
      const rect = s.bar.getBoundingClientRect();
      return (event.clientX - rect.left) * (rect.width > 0 ? BAR_WIDTH / rect.width : 1);
    };
    s.bar.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      const x = xOf(event);
      const at = s.step * STEP_PX;
      if (x >= at && x < at + KNOB) {
        s.dragging = true; // GetSliderStep's -1: the knob is taken
        const pointer = (event as PointerEvent).pointerId;
        if (pointer !== undefined) s.bar.setPointerCapture?.(pointer);
        return;
      }
      if (x >= 0 && x < BAR_WIDTH) this.change(which, s.step + (x > at ? 1 : -1));
    });
    s.bar.addEventListener('pointermove', (event) => {
      if (!s.dragging) return;
      const x = xOf(event);
      let step = s.step;
      if (x > step * STEP_PX) step += 1;
      if (x < step * STEP_PX) step -= 1;
      this.change(which, step);
    });
    const end = (): void => { s.dragging = false; };
    s.bar.addEventListener('pointerup', end);
    s.bar.addEventListener('pointercancel', end);
    s.bar.addEventListener('keydown', (event) => {
      const by = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0;
      if (by === 0) return;
      event.preventDefault();
      event.stopPropagation();
      this.change(which, s.step + by);
    });
  }

  /** A slider moved: shown, and the page's volume set, if it is another step. */
  private change(which: Volume, step: number): void {
    const next = clamp(step);
    if (next === this.sliders[which].step || this.host.audio === null) return;
    this.show(which, next);
    if (which === 'music') this.host.audio.setMusic(next);
    else this.host.audio.setEffects(next);
  }

  private show(which: Volume, step: number): void {
    const s = this.sliders[which];
    s.step = clamp(step);
    s.knob.style.left = `${s.step * STEP_PX}px`;
    s.bar.setAttribute('aria-valuenow', String(s.step));
  }
}

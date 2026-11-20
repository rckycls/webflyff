// The window shortcuts at the top right (`.hud-mobile-tools`, style.css): a FlyffWeb control with no Neuz counterpart, as
// the joystick is. 2026-11-10 (owner): each shows, alone, with no box or border, the icon Neuz's Start menu gives the same
// window; one with no such icon keeps its text. Round 2 (owner): the important windows of the Start menu
// (MOBILE_SHORTCUTS), half the space between the icons, and the icons smoothed. 2026-11-20 (owner, "add the 10 icons like
// mobile in desktop as well"): the same ten on the desktop too, in the same two rows of five left of the Navigator, 32 px;
// under the mouse each shows the task bar's tooltip of an applet (`PutTooTip`, WndTaskBar.cpp:548-569): the Start menu's
// name of the window and, for one with a hotkey, "[Hotkey H]" in blue under it.
//
//   CWndTaskMenu::OnInitialUpdate  _Interface/WndTaskBar.cpp:2595-2734  the Start menu's lines: APP_STATUS1 (:2595),
//                                                                       APP_CHARACTER3 (:2597), APP_INVENTORY (:2603),
//                                                                       APP_SKILL3 (:2618), APP_QUEST_EX_LIST (:2623); in its
//                                                                       submenus APP_MESSENGER_ (Communication, :2661),
//                                                                       APP_PARTY (Community, :2670), APP_MAP (Navigation,
//                                                                       :2734)
//   CWndTaskMenu::AppendMenu       _Interface/WndTaskBar.cpp:2740-2756  an applet's line takes its icon (SetTexture)
//   CWndTaskMenu::SetTexture       _Interface/WndTaskBar.cpp:2579-2582  the icon: the applet's m_pszIconName, from
//                                                                       Client/Icon (DIR_ICON)
//   CWndMgr::AddAllApplet          _Interface/FuncApplet.cpp:175-302    those applets' icons (`APPLETS`, applets.ts)
//
// The icons are 32 x 32 (Client/Icon), drawn there on a white panel with an orange rim; the shortcuts show them without it
// (`bareIconKey`). Each is drawn at a whole multiple of 32 in device pixels (`iconCssSize`: 3 x on a Pixel 7, whose ratio
// is 2.625), smoothed.

import { APPLETS, AppId } from './applets';
import { themeKey } from './art';
import type { UiArt } from './art';
import { createTooltip, positionItemDetails } from './itemDetails';
import type { TooltipLine } from '../items/itemTooltip';
import { MENU } from './taskBar';
import type { TaskBarWindow } from './taskBar';

/** The Start menu's icons' size (Client/Icon/Icon_*.dds, 32 x 32). */
const ICON_SIZE = 32;

/**
 * The key of an applet icon without its frame (its white panel and orange rim): `ui/bare/<web name>.png`, which the UI stage
 * writes for its BARE_ICONS (`stripIconFrame`, tools/convert/src/ui/uiStage.ts). Before that convert, the framed icon shows.
 */
export const bareIconKey = (file: string): string => themeKey(file).replace(/^ui\//, 'ui/bare/');

/**
 * A shortcut: its name (its label; an icon's tooltip is the Start menu's, `shortcutTip`), the applet whose Start-menu icon
 * it shows (null: none, its text shows, its name its tooltip), its action, and its rank (`data-rank`).
 */
export interface MobileTool {
  label: string;
  applet: number | null;
  run: () => void;
  rank?: number;
}

/**
 * The windows the phone's shortcuts open (2026-11-10, owner: "the important icons from the Start menu"), in two rows of
 * five (style.css), and their rank (`data-rank`). Status has no shortcut since 2026-11-15 (its window shows from the start).
 * Stats, the diagnostics panel, follows them, with no icon (WorldScreen).
 * 2026-11-20 (owner, "replace autoplay icon with teleporter and rearrange the 10 icons"): Auto Play's icon is the AUTO
 * button's now (autoPlay/autoButton.ts) and the Teleport window takes its place; the first row the player's own windows
 * (Character, Bag, Skill, Quest) and the Teleport, the second the map, the others and the extras (World Map, Party,
 * Messenger, Pet Filter, Siege Ranking). 2026-11-20 (owner, "add the 10 icons like mobile in desktop as well"): the
 * desktop shows the same ten (Stats has its own button there, on the diagnostics panel).
 */
export const MOBILE_SHORTCUTS: ReadonlyArray<{ label: string; applet: number; window: TaskBarWindow; rank: number }> = [
  { label: 'Character', applet: AppId.CHARACTER3, window: 'character', rank: 3 },
  { label: 'Bag', applet: AppId.INVENTORY, window: 'inventory', rank: 1 },
  { label: 'Skill', applet: AppId.SKILL3, window: 'skills', rank: 2 },
  { label: 'Quest', applet: AppId.QUEST_EX_LIST, window: 'quests', rank: 4 },
  { label: 'Teleport', applet: AppId.TELEPORT, window: 'teleport', rank: 5 },
  { label: 'World Map', applet: AppId.MAP, window: 'worldmap', rank: 6 },
  { label: 'Party', applet: AppId.PARTY, window: 'party', rank: 7 },
  { label: 'Messenger', applet: AppId.MESSENGER_EX, window: 'messenger', rank: 8 },
  { label: 'Pet Filter', applet: AppId.PETFILTER, window: 'petFilter', rank: 9 },
  // 2026-11-15 (owner, Guild Siege C2): the Siege Ranking window, with FlyffWeb's own icon (2026-11-17, ownIcons.ts)
  { label: 'Siege Ranking', applet: AppId.SIEGE_RANKING, window: 'siegeRanking', rank: 10 },
];

/** 2026-11-20: the Start menu's name of an applet's line (a folder's too, taskBar.ts MENU), or null for none there. */
export function startMenuName(applet: number): string | null {
  for (const entry of MENU) {
    if ('id' in entry) {
      if (entry.id === applet) return entry.text;
    } else {
      const line = entry.items.find((item) => item.id === applet);
      if (line !== undefined) return line.text;
    }
  }
  return null;
}

/** The V15 word before a hotkey (`TID_GAME_TOOLTIP_HOTKEY`), for a texts catalog without it. */
const HOTKEY_WORD = 'Hotkey';
/** The hotkey line's colour (`0xff0000ff`, WndTaskBar.cpp:565), blue. */
const HOTKEY_COLOR = 0x0000ff;

/**
 * 2026-11-20: a shortcut's tooltip, the task bar's of an applet (`PutTooTip`, WndTaskBar.cpp:548-569): the Start menu's
 * name in black; with a hotkey, `[Hotkey H]` in blue under it.
 */
export function shortcutTip(applet: number, label: string, hotkeyWord: string = HOTKEY_WORD): TooltipLine[] {
  const lines: TooltipLine[] = [[{ text: startMenuName(applet) ?? label, color: 0x000000 }]];
  const hotkey = APPLETS.get(applet)?.hotkey ?? null;
  if (hotkey !== null) lines.push([{ text: `[${hotkeyWord || HOTKEY_WORD} ${hotkey}]`, color: HOTKEY_COLOR }]);
  return lines;
}

/** The URL of an applet's icon without its frame, or with it before that convert; '' for none. */
function appletIconUrl(art: UiArt, applet: number): string {
  const file = APPLETS.get(applet)?.icon ?? null;
  return file === null ? '' : art.url(bareIconKey(file)) || art.url(themeKey(file));
}

/**
 * The icons' size in CSS px at a device pixel ratio: 32 device px times the ratio rounded to a whole number (at least 1), so
 * a picture pixel is a whole number of device pixels; 32 at a whole ratio, and for a ratio it cannot read.
 */
export function iconCssSize(devicePixelRatio: number): number {
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return (ICON_SIZE * Math.max(1, Math.round(ratio))) / ratio;
}

/**
 * The toolbar of the shortcuts: `element` goes in the HUD; `dispose` stops following the pixel ratio. The icons' size is the
 * page's `--hud-mobile-icon` (on the root element, 2026-11-18), which the target bar reads too, to step left of the rows
 * (style.css); the desktop draws them at 32 px. `hotkeyWord` is the texts catalog's `TID_GAME_TOOLTIP_HOTKEY`.
 */
export class MobileTools {
  readonly element: HTMLElement;
  readonly buttons: readonly HTMLButtonElement[];
  private readonly view: Window | null;
  private readonly root: HTMLElement;
  /** The tooltip shown while the mouse is over an icon (2026-11-20), or null. */
  private tip: HTMLElement | null = null;

  constructor(private readonly art: UiArt, tools: readonly MobileTool[], private readonly doc: Document = document,
    private readonly hotkeyWord: string = HOTKEY_WORD) {
    const element = doc.createElement('div');
    element.className = 'hud-mobile-tools';
    element.setAttribute('role', 'toolbar');
    element.setAttribute('aria-label', 'Window shortcuts');
    this.buttons = tools.map(({ label, applet, run, rank }) => {
      const button = doc.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-label', label);
      if (rank !== undefined) button.dataset.rank = String(rank);
      const url = applet === null ? '' : appletIconUrl(art, applet);
      if (url === '' || applet === null) {
        button.textContent = label;
        button.title = label;
      } else {
        button.dataset.icon = '';
        const icon = doc.createElement('span');
        icon.className = 'hud-mobile-tool-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.style.backgroundImage = `url(${JSON.stringify(url)})`;
        button.append(icon);
        // 2026-11-20 (desktop): the task bar's applet tooltip under the mouse (no browser tooltip: `title` is not set)
        button.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse') this.showTip(button, applet, label); });
        button.addEventListener('pointerleave', () => this.hideTip());
        button.addEventListener('pointerdown', () => this.hideTip());
      }
      // (2026-11-20: a second finger's tap, while the first walks, clicks it too: secondFingerTaps.ts)
      button.addEventListener('click', () => { this.hideTip(); run(); button.blur(); });
      return button;
    });
    element.append(...this.buttons);
    this.element = element;
    this.view = doc.defaultView;
    this.root = doc.documentElement;
    this.relayout();
    this.view?.addEventListener('resize', this.relayout);
  }

  dispose(): void {
    this.hideTip();
    this.view?.removeEventListener('resize', this.relayout);
    this.root.style.removeProperty('--hud-mobile-icon');
    this.element.remove();
  }

  /** The tooltip of the icon under the mouse, placed as the task bar's (under it at the screen's top). */
  private showTip(button: HTMLElement, applet: number, label: string): void {
    this.hideTip();
    const tip = createTooltip(this.doc, this.art, shortcutTip(applet, label, this.hotkeyWord));
    tip.classList.add('hud-taskbar-tooltip', 'hud-shortcut-tooltip');
    this.doc.body.append(tip);
    positionItemDetails(tip, button, this.doc);
    this.tip = tip;
  }

  private hideTip(): void {
    this.tip?.remove();
    this.tip = null;
  }

  /** Sizes the icons for the window's pixel ratio (a zoom or a move to another screen changes it, with a resize). */
  private readonly relayout = (): void => {
    this.root.style.setProperty('--hud-mobile-icon', `${iconCssSize(this.view?.devicePixelRatio ?? 1)}px`);
  };
}

// 2026-11-20 (owner, "remove ranking icon on top right for desktop"): the desktop's Siege Ranking button left of the
// Navigator (2026-11-15) is gone; its window opens from the Start menu.

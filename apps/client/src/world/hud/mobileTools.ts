// The phone's window shortcuts at the top right (`.hud-mobile-tools`, shown only on a touch phone, style.css): a FlyffWeb
// control with no Neuz counterpart, as the joystick is. 2026-11-10 (owner): each shows, alone, with no box or border, the
// icon Neuz's Start menu gives the same window; one with no such icon keeps its text. Round 2 (owner): the important
// windows of the Start menu (MOBILE_SHORTCUTS), half the space between the icons, and the icons smoothed.
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
import type { TaskBarWindow } from './taskBar';

/** The Start menu's icons' size (Client/Icon/Icon_*.dds, 32 x 32). */
const ICON_SIZE = 32;

/**
 * The key of an applet icon without its frame (its white panel and orange rim): `ui/bare/<web name>.png`, which the UI stage
 * writes for its BARE_ICONS (`stripIconFrame`, tools/convert/src/ui/uiStage.ts). Before that convert, the framed icon shows.
 */
export const bareIconKey = (file: string): string => themeKey(file).replace(/^ui\//, 'ui/bare/');

/**
 * A shortcut: its name (label and tooltip), the applet whose Start-menu icon it shows (null: none, its text shows), its
 * action, and its rank (`data-rank`): a narrow phone hides the highest ranks first (style.css).
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
 * Messenger, Pet Filter, Siege Ranking).
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
 * (style.css).
 */
export class MobileTools {
  readonly element: HTMLElement;
  readonly buttons: readonly HTMLButtonElement[];
  private readonly view: Window | null;
  private readonly root: HTMLElement;

  constructor(art: UiArt, tools: readonly MobileTool[], doc: Document = document) {
    const element = doc.createElement('div');
    element.className = 'hud-mobile-tools';
    element.setAttribute('role', 'toolbar');
    element.setAttribute('aria-label', 'Window shortcuts');
    this.buttons = tools.map(({ label, applet, run, rank }) => {
      const button = doc.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-label', label);
      button.title = label;
      if (rank !== undefined) button.dataset.rank = String(rank);
      const url = applet === null ? '' : appletIconUrl(art, applet);
      if (url === '') {
        button.textContent = label;
      } else {
        button.dataset.icon = '';
        const icon = doc.createElement('span');
        icon.className = 'hud-mobile-tool-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.style.backgroundImage = `url(${JSON.stringify(url)})`;
        button.append(icon);
      }
      // (2026-11-20: a second finger's tap, while the first walks, clicks it too: secondFingerTaps.ts)
      button.addEventListener('click', () => { run(); button.blur(); });
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
    this.view?.removeEventListener('resize', this.relayout);
    this.root.style.removeProperty('--hud-mobile-icon');
    this.element.remove();
  }

  /** Sizes the icons for the window's pixel ratio (a zoom or a move to another screen changes it, with a resize). */
  private readonly relayout = (): void => {
    this.root.style.setProperty('--hud-mobile-icon', `${iconCssSize(this.view?.devicePixelRatio ?? 1)}px`);
  };
}

// 2026-11-20 (owner, "remove ranking icon on top right for desktop"): the desktop's Siege Ranking button left of the
// Navigator (2026-11-15) is gone; its window opens from the Start menu.

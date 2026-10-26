// The Start menu (`CWndTaskMenu`, _Interface/WndTaskBar.cpp:2464-2811), the task bar's: drawn as Neuz draws it, the window
// its picture's size with its lines on it.
//
//   CWndTaskMenu::OnInitialUpdate  WndTaskBar.cpp:2584-2653             the lines, the picture WndTaskMenu.tga (:2646), line i
//                                                                       at (10, 50 + 22 i) to (cx - 20, 70 + 22 i) (:2648-2652),
//                                                                       the window the picture's size (:2653)
//   CWndTaskMenu::AppendMenu       WndTaskBar.cpp:2740-2759             an applet's line: its icon (:2579-2582), its hotkey
//   CWndButton::PaintFrame         _Interface/WndControl.cpp:438-546    a line (WBS_MENUITEM | WBS_HIGHLIGHT): under the
//                                                                       pointer filled ARGB(155, 200, 200, 200) and edged
//                                                                       ARGB(200, 240, 240, 240); the icon 20 x 20 at (0, 0),
//                                                                       the title in black at (24, 4), the hotkey in black 32 px
//                                                                       from the right
//   CWndMgr::OpenMenu              _Interface/WndManager.cpp:2302-2322  shows the menu, or hides it if it shows
//   CWndTaskMenu::OnKillFocus      WndTaskBar.cpp:2795-2799             a press elsewhere hides it
//   CWndTaskMenu::OnChildNotify    WndTaskBar.cpp:2806-2811             a line pressed runs its applet

import { APPLETS } from './applets';
import { themeUrl } from './art';
import type { UiArt } from './art';

/** WndTaskMenu.tga's size (192 x 496), which the window takes (`SetWndRect( CRect( 0, 0, cx, cy ) )`, :2653). */
export const MENU_WIDTH = 192;
export const MENU_HEIGHT = 496;
/** The lines (:2651): from x 10 to `cx - 20`, 20 high, 22 apart from y 50. */
const LINE_LEFT = 10;
const LINE_TOP = 50;
const LINE_PITCH = 22;
const LINE_HEIGHT = 20;
const LINE_WIDTH = MENU_WIDTH - 20 - LINE_LEFT;

/** A line of the menu: its applet, its text, and whether it does anything in Piece 4. */
export interface TaskMenuLine {
  id: number;
  text: string;
  enabled: boolean;
}

/**
 * The Start menu. Its `element` goes beside the task bar, over the windows; `place` puts it above the bar's left end
 * (`OnChildNotify`, :1392-1394). It opens and closes with `toggle` (the Start button), `open` (Escape with nothing else to
 * do) and `close`, a press outside it and the button `outside` names closing it; `choose` is told the applet of a line
 * pressed, and the menu closes.
 */
export class TaskMenu {
  readonly element: HTMLElement;
  /** Called as the menu opens (true) or closes (false). */
  onChange?: (open: boolean) => void;
  private readonly doc: Document;

  constructor(
    art: UiArt,
    lines: readonly TaskMenuLine[],
    private readonly choose: (id: number) => void,
    private readonly outside: () => Element | null,
    doc: Document = document,
  ) {
    this.doc = doc;
    const element = doc.createElement('div');
    element.className = 'hud-taskbar-menu';
    element.setAttribute('role', 'menu');
    element.hidden = true;
    element.style.width = `${MENU_WIDTH}px`;
    element.style.height = `${MENU_HEIGHT}px`;
    element.style.backgroundImage = themeUrl(art, 'WndTaskMenu.tga');
    lines.forEach(({ id, text, enabled }, i) => {
      const line = doc.createElement('button');
      line.type = 'button';
      line.className = 'hud-menu-line';
      line.setAttribute('role', 'menuitem');
      line.setAttribute('aria-label', text);
      line.disabled = !enabled;
      line.tabIndex = -1;
      // a press gives the line no focus, so Space and Enter do not press it again
      line.addEventListener('mousedown', (event) => event.preventDefault());
      line.style.left = `${LINE_LEFT}px`;
      line.style.top = `${LINE_TOP + i * LINE_PITCH}px`;
      line.style.width = `${LINE_WIDTH}px`;
      line.style.height = `${LINE_HEIGHT}px`;
      const applet = APPLETS.get(id);
      const icon = doc.createElement('span');
      icon.className = 'hud-menu-icon';
      if (applet?.icon) icon.style.backgroundImage = themeUrl(art, applet.icon);
      const title = doc.createElement('span');
      title.className = 'hud-menu-text';
      title.textContent = text;
      const hotkey = doc.createElement('span');
      hotkey.className = 'hud-menu-hotkey';
      hotkey.setAttribute('aria-hidden', 'true');
      hotkey.textContent = applet?.hotkey ?? '';
      line.append(icon, title, hotkey);
      line.addEventListener('click', () => {
        this.close();
        this.choose(id);
      });
      element.append(line);
    });
    this.element = element;
  }

  get isOpen(): boolean {
    return !this.element.hidden;
  }

  /** Shows the menu (`SetVisible( TRUE )`). */
  open(): void {
    if (this.isOpen) return;
    this.element.hidden = false;
    this.doc.addEventListener('pointerdown', this.onPressOutside, true);
    this.onChange?.(true);
  }

  /** Hides the menu (`SetVisible( FALSE )`). */
  close(): void {
    if (!this.isOpen) return;
    this.element.hidden = true;
    this.doc.removeEventListener('pointerdown', this.onPressOutside, true);
    this.onChange?.(false);
  }

  /** `OpenMenu`: shows the menu, or hides it if it shows. */
  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  /**
   * Puts the menu's bottom left `bottom` px above the layer's bottom left, drawn `scale` times its size (the bar's scale,
   * and smaller still where the layer is too short for its 496 px above the bar).
   */
  place(scale: number, bottom: number): void {
    this.element.style.bottom = `${bottom}px`;
    this.element.style.transform = scale === 1 ? '' : `scale(${scale})`;
  }

  dispose(): void {
    this.close();
    this.element.remove();
  }

  /** A press outside the menu and its button closes it (`OnKillFocus`, :2795-2799). */
  private readonly onPressOutside = (event: Event): void => {
    const target = event.target as Node | null;
    const button = this.outside();
    if (target !== null && (this.element.contains(target) || button?.contains(target) === true)) return;
    this.close();
  };
}

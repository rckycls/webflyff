// The start-point window (2026-11-15, B4; A-client.md §2.4): GC_SELECTWARPOS opens it each time a fighter is about to be sent
// into the arena. Four areas, 10 seconds; a press sends the area at once, the time-out sends the pick (99, random, with none).
//
//   CWndGuildCombatJoinSelection   WndField.cpp:16613-16748   APP_GUILDCOMBAT_SELSTART, resdata.inc:167, 320 x 176, the
//                                                             title bar hidden; no close button
//   WIDC_BUTTON1..4  ButtGW1..4.tga   40 x 40 (4 states of 40 x 40), "You enter the 1st area."; Send + remember
//   WIDC_STATIC2     TID_GAME_GUILDCOMBAT_JOIN_MESSAGE "After %d, you enter %s." (a fixed sentence: seconds left
//                    `left / 1000 + 1`, "Random" or "1".."4")
//   the chosen button gets a blue frame 0xFF0000FF, deflated 1 px (:16648-16678)

import type { UiArt } from '../art';
import { ResWindow } from '../resWindow';
import type { ResLayout } from '../resWindow';
import { formatText } from '../format';
import { NO_AREA } from '../../guildCombat/guildCombatRules';

const ORDINAL = ['1st', '2nd', '3rd', '4th'];
const BUTTONS = ['WIDC_BUTTON1', 'WIDC_BUTTON2', 'WIDC_BUTTON3', 'WIDC_BUTTON4'] as const;
const LEFTS = [30, 98, 166, 236];

export const startPointLayout = (): ResLayout => ({
  title: 'Resurrection Location Window', width: 320, height: 176,
  frame: { closeButton: false },
  controls: [
    ...BUTTONS.map((id, i) => ({
      kind: 'button' as const, id, rect: [LEFTS[i]!, 26, LEFTS[i]! + 40, 66] as const, picture: `ButtGW${i + 1}.tga`,
      label: `${i + 1}`, quarter: 40,
    })),
    { kind: 'static', id: 'WIDC_STATIC3', rect: [10, 78, 298, 94], text: 'Select the area you wish to enter.' },
    { kind: 'static', id: 'WIDC_STATIC2', rect: [16, 108, 296, 124] },
  ],
});

export class StartPointWindow {
  readonly window: ResWindow;
  /** `SendGCSelectMap( map )`. */
  onSelect: (map: number) => void = () => {};
  private picked: number = NO_AREA;
  private endsAt = 0;

  /** @param format the join message's format ("After %d, you enter %s."), read each time it is drawn */
  constructor(art: UiArt, doc: Document = document, private readonly format: () => string = () => 'After %d, you enter %s.') {
    const window = new ResWindow(startPointLayout(), art, doc);
    window.frame.element.classList.add('hud-gc', 'hud-gc-startpoint');
    BUTTONS.forEach((id, i) => {
      const button = window.button(id);
      button.title = `You enter the ${ORDINAL[i]} area.`;
      button.addEventListener('click', () => this.pick(i));
    });
    this.window = window;
  }

  get isOpen(): boolean {
    return this.window.isOpen;
  }

  get element(): HTMLElement {
    return this.window.element;
  }

  /** GC_SELECTWARPOS: the map the server suggests (99 none) and the seconds, from `now` (ms). Opens, or restarts the count. */
  open(map: number, seconds: number, now: number): void {
    this.picked = map;
    this.endsAt = now + seconds * 1000;
    this.mark();
    this.draw(now);
    if (!this.window.isOpen) this.window.open();
  }

  /** Each frame: the count-down, and at the time-out the pick is sent and the window closes. */
  tick(now: number): void {
    if (!this.window.isOpen) return;
    if (now >= this.endsAt) {
      const map = this.picked;
      this.window.close();
      this.onSelect(map);
      return;
    }
    this.draw(now);
  }

  close(): void {
    this.window.close();
  }

  private pick(area: number): void {
    this.picked = area;
    this.mark();
    this.onSelect(area);
  }

  private mark(): void {
    BUTTONS.forEach((id, i) => this.window.button(id).classList.toggle('is-chosen', this.picked === i));
  }

  private draw(now: number): void {
    const left = Math.max(0, this.endsAt - now);
    const area = this.picked >= 0 && this.picked < 4 ? String(this.picked + 1) : 'Random';
    this.window.setText('WIDC_STATIC2', formatText(this.format(), [Math.trunc(left / 1000) + 1, area]));
  }
}

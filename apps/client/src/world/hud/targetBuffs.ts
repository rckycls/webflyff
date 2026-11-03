// The target's buffs under the target bar (Piece 7 M2, [R §10]): `CWndWorld::RenderMoverBuff` (`_Interface/WndWorld.cpp:
// 10836-11140`): 24 x 24 px icons from ( ( W - 200 ) / 2 - 20 + 24, 44 ), 8 a row, their alpha moving between 32 and 192
// under 20 s left. Its skill buffs, in their order; the tooltip is the own window's.

import type { BuffShown } from '../buffs';
import type { UiArt } from './art';
import { buffTooltip } from './buffStatus';
import type { SkillsOf } from './buffStatus';

const BUFF_SKILL = 1;
const PER_ROW = 8;
const ICON_PX = 24;
const TOP = 44;
const ALPHA = 192;
const ALPHA_LOW = 32;
const ALPHA_STEP = 6;
const BLINK_MS = 20000;

export class TargetBuffs {
  readonly element: HTMLElement;
  private blinkAlpha = ALPHA;
  private blinkUp = false;

  constructor(private readonly art: UiArt, private readonly doc: Document = document) {
    this.element = doc.createElement('div');
    this.element.className = 'hud-target-buffs';
    this.element.hidden = true;
  }

  /** The target's buffs at `now`, for a screen `width` CSS pixels wide; none hides it. One call a frame. */
  update(buffs: readonly BuffShown[], skills: SkillsOf, now: number, width: number): void {
    void now;
    const shown = buffs.filter((b) => b.buffType === BUFF_SKILL && skills.has(b.id)).sort((a, b) => a.id - b.id);
    this.element.hidden = shown.length === 0;
    if (shown.some((b) => b.totalMs > 0 && b.leftMs < BLINK_MS)) {
      this.blinkAlpha += this.blinkUp ? ALPHA_STEP : -ALPHA_STEP;
      if (this.blinkAlpha <= ALPHA_LOW) { this.blinkAlpha = ALPHA_LOW; this.blinkUp = true; }
      if (this.blinkAlpha >= ALPHA) { this.blinkAlpha = ALPHA; this.blinkUp = false; }
    }
    const x0 = (width - 200) / 2 - 20 + ICON_PX;
    // made again only when the buffs listed (or the screen's width) change; else changed in place, frame to frame
    const listed = `${width}|${shown.map((b) => `${b.buffType}:${b.id}:${b.level}`).join(',')}`;
    if (listed !== this.listed) {
      this.listed = listed;
      this.element.replaceChildren(...shown.map((buff, i) => {
        const skill = skills.get(buff.id)!;
        const icon = this.doc.createElement('img');
        icon.className = 'hud-target-buff';
        icon.alt = skill.name;
        icon.src = skill.icon === null ? '' : this.art.url(skill.icon);
        Object.assign(icon.style, {
          position: 'absolute', left: `${x0 + (i % PER_ROW) * ICON_PX}px`, top: `${TOP + Math.trunc(i / PER_ROW) * ICON_PX}px`,
          width: `${ICON_PX}px`, height: `${ICON_PX}px`,
        });
        return icon;
      }));
    }
    shown.forEach((buff, i) => {
      const icon = this.element.children[i] as HTMLElement;
      const blinking = buff.totalMs > 0 && buff.leftMs < BLINK_MS;
      icon.style.opacity = String((blinking ? this.blinkAlpha : ALPHA) / 255);
      const title = buffTooltip(skills.get(buff.id)!, buff).join('\n');
      if (icon.title !== title) icon.title = title;
    });
  }

  dispose(): void {
    this.element.remove();
  }

  /** The buffs and the width the icons were last made for. */
  private listed = '';
}

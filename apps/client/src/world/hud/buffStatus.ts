// The own skill buffs' icons (Piece 7 M2, [R §10]): `CWndBuffStatus` (APP_BUFF_STATUS, `Resource/resdata.inc:6113`;
// `_Interface/WndField.cpp:18467-19106`). No frame; 7 icons a row on a 34 px pitch, each the skill's icon at 1.2 times
// (38.4 px, overlapping) and ARGB(192, 255, 255, 255), a harmful one tinted (a, 255, 120, 255); under 20 s left the alpha
// moves 6 a frame between 64 and 192; the seconds left on the icon; a tooltip of the name and level, the description, a
// line per parameter and the time left as mm:ss. In ascending skill id (the buffs' map order). The vertical layout of a
// double click is left out.

import type { WebSkill } from '@flyffweb/formats';
import type { BuffShown } from '../buffs';
import type { UiArt } from './art';

/** `BUFF_SKILL` (`_Common/buff.h`): the window shows these. */
const BUFF_SKILL = 1;
const PER_ROW = 7;
const PITCH = 34;
/** The icon of 32 px at 1.2 times (`vScale( 1.2f, 1.2f )`). */
const ICON_PX = 38.4;
/** The alphas of an icon: 192, and between 64 and 192 under 20 s left, 6 a frame. */
const ALPHA = 192;
const ALPHA_LOW = 64;
const ALPHA_STEP = 6;
const BLINK_MS = 20000;
/** Plain names of the first jobs' buffs' parameters (`DST_*`); the catalog's tooltip texts are not converted. */
const PARAM_NAMES: Readonly<Record<number, string>> = {
  1: 'STR', 2: 'DEX', 3: 'INT', 4: 'STA', 8: 'Ranged block', 11: 'Speed', 14: 'Melee block', 24: 'Attack speed',
  35: 'Max HP', 47: 'Hit rate', 57: 'Stun chance', 58: 'HP recovery', 26: 'Defense',
};

export type SkillsOf = ReadonlyMap<number, Pick<WebSkill, 'name' | 'description' | 'icon' | 'evildoing' | 'levels'>>;

/** `%.2d:%.2d` of the minutes and the seconds left. */
const mmss = (ms: number): string => {
  const s = Math.trunc(ms / 1000);
  return `${String(Math.trunc(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** The tooltip's lines: the name and `"   Lvl %d"`, the description, a line per parameter of the level, the time left. */
export function buffTooltip(skill: Pick<WebSkill, 'name' | 'description' | 'levels'>, buff: BuffShown): string[] {
  const level = skill.levels[buff.level - 1] as { destParams?: number[]; adjParams?: number[] } | undefined;
  const params = (level?.destParams ?? []).flatMap((dst, i) => {
    const adj = level?.adjParams?.[i] ?? -1;
    if (dst === -1 || adj === -1) return [];
    return [`${PARAM_NAMES[dst] ?? `DST ${dst}`} ${adj >= 0 ? '+' : ''}${adj}`];
  });
  return [`${skill.name}   Lvl ${buff.level}`, skill.description, ...params, ...(buff.totalMs > 0 ? [mmss(buff.leftMs)] : [])]
    .filter((line) => line !== '');
}

/** The alpha of a blinking icon, one frame on: 6 down, or up once it reached 64, back down at 192. */
export function blink(state: { alpha: number; up: boolean }): number {
  state.alpha += state.up ? ALPHA_STEP : -ALPHA_STEP;
  if (state.alpha <= ALPHA_LOW) { state.alpha = ALPHA_LOW; state.up = true; }
  if (state.alpha >= ALPHA) { state.alpha = ALPHA; state.up = false; }
  return state.alpha;
}

export class BuffStatus {
  readonly element: HTMLElement;
  private readonly blinks = new Map<number, { alpha: number; up: boolean }>();

  constructor(private readonly art: UiArt, private readonly doc: Document = document) {
    this.element = doc.createElement('div');
    this.element.className = 'hud-buffs';
    this.element.hidden = true;
  }

  /**
   * The own buffs at `now` (ms), the skill buffs alone, in their order; one call a frame (the blinking). The icons are
   * made again only when the buffs listed change; from frame to frame their alpha, seconds and tooltip change in place
   * (a tooltip, and a phone's frames, need the same element).
   */
  update(buffs: readonly BuffShown[], skills: SkillsOf, now: number): void {
    void now;
    const shown = buffs.filter((b) => b.buffType === BUFF_SKILL && skills.has(b.id)).sort((a, b) => a.id - b.id);
    this.element.hidden = shown.length === 0;
    const listed = shown.map((b) => `${b.buffType}:${b.id}:${b.level}:${b.totalMs > 0}`).join(',');
    if (listed !== this.listed) {
      this.listed = listed;
      this.element.replaceChildren(...shown.map((buff, i) => this.icon(buff, skills.get(buff.id)!, i)));
    }
    shown.forEach((buff, i) => this.refresh(this.element.children[i] as HTMLElement, buff, skills.get(buff.id)!));
  }

  dispose(): void {
    this.element.remove();
  }

  /** The buffs the icons were last made for. */
  private listed = '';

  private icon(buff: BuffShown, skill: Pick<WebSkill, 'name' | 'description' | 'icon' | 'evildoing' | 'levels'>, i: number): HTMLElement {
    const icon = this.doc.createElement('div');
    icon.className = 'hud-buff';
    Object.assign(icon.style, {
      position: 'absolute', left: `${(i % PER_ROW) * PITCH}px`, top: `${Math.trunc(i / PER_ROW) * PITCH}px`,
      width: `${ICON_PX}px`, height: `${ICON_PX}px`,
    });
    if (skill.evildoing < 0) icon.dataset.harmful = '';
    const img = this.doc.createElement('img');
    img.alt = skill.name;
    img.src = skill.icon === null ? '' : this.art.url(skill.icon);
    Object.assign(img.style, { width: '100%', height: '100%' });
    icon.append(img);
    if (buff.totalMs > 0) {
      const seconds = this.doc.createElement('span');
      seconds.className = 'hud-buff-seconds';
      icon.append(seconds);
    }
    return icon;
  }

  /** A frame of an icon: its alpha (blinking under 20 s), its tooltip and its seconds left. */
  private refresh(icon: HTMLElement, buff: BuffShown, skill: Pick<WebSkill, 'name' | 'description' | 'levels'>): void {
    const blinking = buff.totalMs > 0 && buff.leftMs < BLINK_MS;
    const key = buff.buffType * 100000 + buff.id;
    let alpha = ALPHA;
    if (blinking) {
      const state = this.blinks.get(key) ?? { alpha: ALPHA, up: false };
      this.blinks.set(key, state);
      alpha = blink(state);
    } else {
      this.blinks.delete(key);
    }
    icon.style.opacity = String(alpha / 255);
    const title = buffTooltip(skill, buff).join('\n');
    if (icon.title !== title) icon.title = title;
    const seconds = icon.querySelector('.hud-buff-seconds');
    const text = String(Math.trunc(buff.leftMs / 1000));
    if (seconds !== null && seconds.textContent !== text) seconds.textContent = text;
  }
}

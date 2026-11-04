// The own skill buffs' icons (Piece 7 M2, [R §10]): `CWndBuffStatus` (APP_BUFF_STATUS, `Resource/resdata.inc:6113`;
// `_Interface/WndField.cpp:18467-19106`). No frame; 7 icons a row on a 34 px pitch, each the skill's icon at 1.2 times
// (38.4 px, overlapping) and ARGB(192, 255, 255, 255), a harmful one tinted (a, 255, 120, 255); under 20 s left the alpha
// moves 6 a frame between 64 and 192; the seconds left on the icon; a tooltip of the name and level, the description, a
// line per parameter and the time left as mm:ss. In ascending skill id (the buffs' map order). The vertical layout of a
// double click is left out.
//
// Piece 7 M3 ([R §5]): the item buffs too (BUFF_ITEM, BUFF_ITEM2), which Neuz draws in the world's own buff row with the
// item's icon (`CWndWorld::RenderBuffIcon`, `_Interface/WndWorld.cpp:9691-9760`), here after the skill buffs (ruling);
// the Scroll of Return's always blinks (:9725), and a double-click on it, which the buff window hands the world
// (`WndField.cpp:18552-18572`), sends RETURNSCROLL -1 (`WndWorld.cpp:7265-7266`); on a phone, two taps within 500 ms.

import type { WebItemProp, WebSkill } from '@flyffweb/formats';
import type { BuffShown } from '../buffs';
import type { UiArt } from './art';

/** `BUFF_SKILL` (`_Common/buff.h`): the window shows these. */
const BUFF_SKILL = 1;
/** Piece 7 M3: `BUFF_ITEM` and `BUFF_ITEM2`: an item's buffs, shown with the item's icon. */
const BUFF_ITEM = 0;
const BUFF_ITEM2 = 3;
/** `II_SYS_SYS_SCR_RETURN`: its icon always blinks, and its double-click goes back. */
const RETURN_SCROLL = 10469;
/** Two taps of a finger this near are a double-click (Windows' own double-click time). */
const DOUBLE_TAP_MS = 500;

export type ItemsOf = ReadonlyMap<number, Pick<WebItemProp, 'name' | 'icon'>>;

/** What an icon shows: its name, picture, tint, tooltip lines, and whether it always blinks. */
interface Look {
  name: string;
  icon: string | null;
  harmful: boolean;
  tooltip: (buff: BuffShown) => string[];
  alwaysBlinks: boolean;
}
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

  /**
   * `options.items` names the item buffs' items (Piece 7 M3; without it only skill buffs show), `onReturnScroll` runs on
   * a double-click (or a double tap) on the Scroll of Return's icon, and `now` is the taps' clock (ms).
   */
  constructor(
    private readonly art: UiArt,
    private readonly doc: Document = document,
    private readonly options: { items?: ItemsOf; onReturnScroll?: () => void; now?: () => number } = {},
  ) {
    this.element = doc.createElement('div');
    this.element.className = 'hud-buffs';
    this.element.hidden = true;
  }

  /**
   * The own buffs at `now` (ms): the skill buffs in their order, then the item buffs (Piece 7 M3); one call a frame (the
   * blinking). The icons are made again only when the buffs listed change; from frame to frame their alpha, seconds and
   * tooltip change in place (a tooltip, and a phone's frames, need the same element).
   */
  update(buffs: readonly BuffShown[], skills: SkillsOf, now: number): void {
    void now;
    const items = this.options.items;
    const byId = (a: BuffShown, b: BuffShown): number => a.id - b.id;
    const shown: Array<{ buff: BuffShown; look: Look }> = [
      ...buffs.filter((b) => b.buffType === BUFF_SKILL && skills.has(b.id)).sort(byId).map((buff) => {
        const skill = skills.get(buff.id)!;
        const look: Look = {
          name: skill.name, icon: skill.icon, harmful: skill.evildoing < 0, tooltip: (b) => buffTooltip(skill, b), alwaysBlinks: false,
        };
        return { buff, look };
      }),
      ...buffs.filter((b) => (b.buffType === BUFF_ITEM || b.buffType === BUFF_ITEM2) && items?.has(b.id) === true).sort(byId).map((buff) => {
        const item = items!.get(buff.id)!;
        const look: Look = {
          name: item.name, icon: item.icon, harmful: false, alwaysBlinks: buff.id === RETURN_SCROLL,
          tooltip: (b) => [item.name, ...(b.totalMs > 0 ? [mmss(b.leftMs)] : [])],
        };
        return { buff, look };
      }),
    ];
    this.element.hidden = shown.length === 0;
    const listed = shown.map(({ buff: b }) => `${b.buffType}:${b.id}:${b.level}:${b.totalMs > 0}`).join(',');
    if (listed !== this.listed) {
      this.listed = listed;
      this.element.replaceChildren(...shown.map(({ buff, look }, i) => this.icon(buff, look, i)));
    }
    shown.forEach(({ buff, look }, i) => this.refresh(this.element.children[i] as HTMLElement, buff, look));
  }

  dispose(): void {
    this.element.remove();
  }

  /** The buffs the icons were last made for. */
  private listed = '';

  private icon(buff: BuffShown, look: Look, i: number): HTMLElement {
    const icon = this.doc.createElement('div');
    icon.className = 'hud-buff';
    Object.assign(icon.style, {
      position: 'absolute', left: `${(i % PER_ROW) * PITCH}px`, top: `${Math.trunc(i / PER_ROW) * PITCH}px`,
      width: `${ICON_PX}px`, height: `${ICON_PX}px`,
    });
    if (look.harmful) icon.dataset.harmful = '';
    const img = this.doc.createElement('img');
    img.alt = look.name;
    img.src = look.icon === null ? '' : this.art.url(look.icon);
    Object.assign(img.style, { width: '100%', height: '100%' });
    icon.append(img);
    if (buff.totalMs > 0) {
      const seconds = this.doc.createElement('span');
      seconds.className = 'hud-buff-seconds';
      icon.append(seconds);
    }
    if (buff.id === RETURN_SCROLL && buff.buffType !== BUFF_SKILL) this.goesBack(icon);
    return icon;
  }

  /** Piece 7 M3: the Scroll of Return's icon: a double-click, or two taps within 500 ms, goes back. */
  private goesBack(icon: HTMLElement): void {
    const back = (): void => this.options.onReturnScroll?.();
    icon.addEventListener('dblclick', back);
    let lastTap = -Infinity;
    icon.addEventListener('pointerup', (event) => {
      if ((event as PointerEvent).pointerType !== 'touch') return;
      const now = this.options.now?.() ?? performance.now();
      if (now - lastTap <= DOUBLE_TAP_MS) {
        lastTap = -Infinity;
        back();
      } else {
        lastTap = now;
      }
    });
  }

  /** A frame of an icon: its alpha (blinking under 20 s, or always), its tooltip and its seconds left. */
  private refresh(icon: HTMLElement, buff: BuffShown, look: Look): void {
    const blinking = buff.totalMs > 0 && (buff.leftMs < BLINK_MS || look.alwaysBlinks);
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
    const title = look.tooltip(buff).join('\n');
    if (icon.title !== title) icon.title = title;
    const seconds = icon.querySelector('.hud-buff-seconds');
    const text = String(Math.trunc(buff.leftMs / 1000));
    if (seconds !== null && seconds.textContent !== text) seconds.textContent = text;
  }
}

// The target bar (spec §3.9, [combat §6], [stats §5.2]): the name, level and HP of the mover the player targets, top
// centre, as `CWndWorld::RenderSelectObj` draws it.
//
//   CWndWorld::RenderSelectObj  Source/_Interface/WndWorld.cpp:2716-2931
//     :2720-2723  the mover drawn is m_pRenderTargetObj when there is one, else the focus (its caller, :1058)
//     :2729       only a valid mover that is not peaceful, or a player
//     :2741-2753  a game master's target is not shown, unless the player is a game master too
//     :2768-2784  a 200 px gauge at ( ( width - 200 ) / 2, 30 ): the empty one in ARGB( 200, 255, 255, 255 ), then
//                 ARGB( 128, 255, 15, 15 ) over (int)( (__int64)200 * HP / MaxHP ) of it, both GauEmptyNormal.bmp
//     :2790-2847  "%s <Lvl %d>" (a player's level as ?? 20 levels up, -H or -M for a hero or a master; a monster with
//                 dwHideLevel 1 its name alone)
//     :2848-2872  at ( x + 50, 30 - 18 ), a player's centred by 3 px a character under 16, COLOR_PLAYER or COLOR_MONSTER
//                 (Mover.h:34,38), an aggressive monster (m_bActiveAttack) red
//     :2874-2903  a monster's level arrow at ( x + 30, 30 - 20 ): LvUp2 above 5, LvUp above 0, LvDn2 below -5, LvDn below -1
//     :2913-2927  to a game master, "Health: %d/%d" (TID_GAME_SELECT_OBJECT_INFORMATION_MONSTER) at ( x, 30 + 12 )

import type { WebMover } from '@flyffweb/formats';
import type { Texts } from '../gameData';
import { isGameMaster } from '../fx/combatEffects';
import { Belli } from '../sim/constants';
import type { Mover } from '../WorldState';
import { cssRgb, themeUrl } from './frame';
import type { UiArt } from './frame';
import { Gauge } from './gauge';
import { formatText } from './messages';

/** The gauge's width (`nWidthClient = 200`) and where it stands from the top (`rect.top = 30`). */
const GAUGE_WIDTH = 200;
const GAUGE_TOP = 30;
const EMPTY_COLOR = 0xc8ffffff; // D3DCOLOR_ARGB( 200, 255, 255, 255 )
const FILL_COLOR = 0x80ff0f0f; // D3DCOLOR_ARGB( 128, 255, 15, 15 )
/** `COLOR_PLAYER`, `COLOR_MONSTER` (`_Common/Mover.h:34,38`) and the aggressive monster's red (`:2868`). */
const COLOR_PLAYER = 0xffffffff;
const COLOR_MONSTER = 0xffffffa0;
const COLOR_AGGRESSIVE = 0xffff0000;
/** `JOB_KNIGHT_MASTER` to `JOB_ELEMENTOR_MASTER`, `JOB_KNIGHT_HERO` to `JOB_ELEMENTOR_HERO` (`Resource/defineJob.h:66-84`). */
const MASTER_JOBS = { from: 16, to: 23 } as const;
const HERO_JOBS = { from: 24, to: 31 } as const;

/** The arrow of a level difference (`monster - player`), or none for -1 to 0. */
export function levelArrow(difference: number): 'LvUp2' | 'LvUp' | 'LvDn' | 'LvDn2' | null {
  if (difference > 0) return difference > 5 ? 'LvUp2' : 'LvUp';
  if (difference < -1) return difference < -5 ? 'LvDn2' : 'LvDn';
  return null;
}

/** What `RenderSelectObj` writes over the bar for `target`, the player being of `ownLevel` (`:2790-2847`). */
export function targetText(
  target: Mover, ownLevel: number, moverProps: ReadonlyMap<number, Pick<WebMover, 'hideLevel'>>, gameMaster: boolean,
): string {
  const { name, level } = target;
  if (target.added.isPlayer) {
    if (!gameMaster && ownLevel + 20 <= level) return `${name} <Lvl ??>`;
    const job = target.added.player?.job ?? 0;
    if (job >= HERO_JOBS.from && job <= HERO_JOBS.to) return `${name} <Lvl ${level}-H>`;
    if (job >= MASTER_JOBS.from && job <= MASTER_JOBS.to) return `${name} <Lvl ${level}-M>`;
    return `${name} <Lvl ${level}>`;
  }
  if (moverProps.get(target.added.index)?.hideLevel === 1) return name;
  return `${name} <Lvl ${level}>`;
}

/**
 * The target bar. `update` is given, each frame, the mover `RenderSelectObj` would draw (`m_pRenderTargetObj`, else the
 * focus; null for none), the player's level and whether the player is a game master. The gauge needs the mover's maximum
 * HP: one with none (no catalog row) gets the empty gauge alone. Another player's maximum leaves out its items and buffs
 * (`WorldState`), so its gauge is near, not exact.
 */
export class TargetBar {
  readonly element: HTMLElement;
  private readonly name: HTMLElement;
  private readonly arrow: HTMLElement;
  private readonly fill: Gauge;
  private readonly info: HTMLElement;

  constructor(
    private readonly art: UiArt,
    private readonly moverProps: ReadonlyMap<number, Pick<WebMover, 'hideLevel' | 'level'>>,
    doc: Document = document,
  ) {
    const element = doc.createElement('div');
    element.className = 'hud-target';
    element.hidden = true;
    element.style.width = `${GAUGE_WIDTH}px`;

    const empty = new Gauge(art, 'GauEmptyNormal.bmp', EMPTY_COLOR, 'target-empty', doc);
    empty.set(GAUGE_WIDTH);
    empty.element.style.top = `${GAUGE_TOP}px`;
    this.fill = new Gauge(art, 'GauEmptyNormal.bmp', FILL_COLOR, 'target', doc);
    this.fill.element.style.top = `${GAUGE_TOP}px`;

    this.name = doc.createElement('div');
    this.name.className = 'hud-target-name';
    this.name.style.top = `${GAUGE_TOP - 18}px`;

    this.arrow = doc.createElement('div');
    this.arrow.className = 'hud-target-arrow';
    this.arrow.hidden = true;
    this.arrow.style.left = '30px';
    this.arrow.style.top = `${GAUGE_TOP - 20}px`;

    this.info = doc.createElement('div');
    this.info.className = 'hud-target-info';
    this.info.style.top = `${GAUGE_TOP + 12}px`;

    element.append(empty.element, this.fill.element, this.arrow, this.name, this.info);
    this.element = element;
  }

  /**
   * Draws `target` for a player of `ownLevel` (`gameMaster`: `g_pPlayer->IsAuthHigher( AUTH_GAMEMASTER )`), or hides the
   * bar: no target, a peaceful mover that is not a player, or a game master's target for a player who is not one.
   */
  update(target: Mover | null, ownLevel: number, texts: Texts, gameMaster = false): void {
    const shown = target !== null && (target.added.isPlayer || target.added.belligerence !== Belli.PEACEFUL) &&
      (gameMaster || !isGameMaster(target.added.player?.authorization ?? 0));
    if (this.element.hidden === shown) this.element.hidden = !shown;
    if (!shown) return;

    const max = target.maxHp;
    this.fill.set(max === null || max <= 0 ? 0 : Math.trunc((GAUGE_WIDTH * target.hp) / max));

    const text = targetText(target, ownLevel, this.moverProps, gameMaster);
    if (this.name.textContent !== text) this.name.textContent = text;
    const player = target.added.isPlayer;
    // ( 16 - strlen ) * 3 for a player's text of 16 characters at most (`__CSC_VER11_1`, :2852-2857)
    const left = 50 + (player && text.length <= 16 ? (16 - text.length) * 3 : 0);
    this.name.style.left = `${left}px`;
    const color = player ? COLOR_PLAYER : (target.added.npc?.activeAttack ?? 0) !== 0 ? COLOR_AGGRESSIVE : COLOR_MONSTER;
    this.name.style.color = cssRgb(color);

    // a monster's arrow, from its row's dwLevel (the mover's own level when the catalog has no row)
    const arrow = player ? null : levelArrow((this.moverProps.get(target.added.index)?.level ?? target.level) - ownLevel);
    this.arrow.hidden = arrow === null;
    if (arrow !== null && this.arrow.dataset.art !== arrow) {
      this.arrow.dataset.art = arrow;
      this.arrow.style.backgroundImage = themeUrl(this.art, `${arrow}.bmp`);
    }

    // a game master's line: a monster's HP and maximum (a player's adds penya and EXP, which the browser has not)
    const info = gameMaster && !player && max !== null
      ? formatText(texts.get('TID_GAME_SELECT_OBJECT_INFORMATION_MONSTER')?.text ?? '', [target.hp, max])
      : '';
    if (this.info.textContent !== info) this.info.textContent = info;
  }
}

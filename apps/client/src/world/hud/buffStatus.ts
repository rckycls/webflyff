// The own skill buffs' icons (Piece 7 M2, [R §10]): `CWndBuffStatus` (APP_BUFF_STATUS, `Resource/resdata.inc:6113`;
// `_Interface/WndField.cpp:18467-19106`). No frame; 7 icons a row on a 34 px pitch, each the skill's icon at 1.2 times
// (38.4 px, overlapping) and ARGB(192, 255, 255, 255), a harmful one tinted (a, 255, 120, 255); under 20 s left the alpha
// moves 6 a frame between 64 and 192; the seconds left on the icon; a tooltip of the name and level, the description, a
// line per parameter and the time left. In ascending skill id (the buffs' map order). The vertical layout of a double
// click is left out.
//
// Piece 7 M3 ([R §5]): the item buffs too (BUFF_ITEM, BUFF_ITEM2), which Neuz draws in the world's own buff row with the
// item's icon (`CWndWorld::RenderBuffIcon`, `_Interface/WndWorld.cpp:9691-9760`), here after the skill buffs (ruling);
// the Scroll of Return's always blinks (:9725), and a double-click on it, which the buff window hands the world
// (`WndField.cpp:18552-18572`), sends RETURNSCROLL -1 (`WndWorld.cpp:7265-7266`); on a phone, two taps within 500 ms.
//
// 2026-11-05 ([R] = docs/superpowers/specs/2026-11-05-buffs-premium-research.md):
// - It moves (§2): a press on an icon and a drag carry it (`WBS_MOVE`'s pickup, `WndBase.cpp:1362-1370`); a press
//   beside the icons goes to the world (the box takes no pointer). It is kept on its layer, above the task bar, and goes
//   against an edge within 10 px (`m_bCling`, `WndBase.cpp:1251-1276`). Kept by the icons' extent, not Neuz's fixed
//   window, so that a few icons reach any edge. Where it was put lives as long as the page (`place`, `onPlace`).
// - On a phone it is half the size (§3, the owner).
// - Each item buff has its time under it in `RenderOptBuffTime`'s units (`WndWorld.cpp:9315-9336, 11197-11227`); the ES
//   scrolls of a kind share one icon (`RenderExpBuffIcon`, :10236-10517); the premium timers (SM modes) follow the item
//   buffs (`RenderSMBuff`, :10519-10624).
//
// 2026-11-09 (pets R2): the raised pet's `BUFF_PET` (2), whose id is the pet's item, with the item's icon by the own pet's
// level (`GetSystemPetTextureKey`, `WndWorld.cpp:9160-9182`, :9219-9228; petBuffIcon), no time and no blinking (its total
// is 0), and the pet's tooltip (`PutPetTooltipInfo`, :9371-9379). The item buffs are now in the buffs' map order
// (`MAKELONG( id, type )`, `buff.h:212`): the BUFF_ITEMs by id, the pet's, then the BUFF_ITEM2s by id.
//
// 2026-11-09 (pets B1): the buff pet's `BUFF_EQUIP` (4, `SetPetVisDST`, `MoverSkill.cpp:4122`), last of the item buffs, with
// the pet item's icon (`RenderBuffIcon`, `WndWorld.cpp:9209-9218`; its texture, :3594-3596), no time under it (:9323-9325),
// and the tooltip of its name and the buff pet's vis (`PutVisPetInfo` of `GetVisPetItem` of that item, :9392-9401).

import type { WebItemProp, WebSkill } from '@flyffweb/formats';
import type { BuffShown } from '../buffs';
import { petBuffIcon } from '../pets/petStatus';
import type { UiArt } from './art';
import { formatText } from './format';
import { layoutBottomOf } from './frame';

/** `BUFF_SKILL` (`_Common/buff.h`): the window shows these. */
const BUFF_SKILL = 1;
/** Piece 7 M3: `BUFF_ITEM` and `BUFF_ITEM2`: an item's buffs, shown with the item's icon. */
const BUFF_ITEM = 0;
const BUFF_ITEM2 = 3;
/** 2026-11-09 (pets R2): `BUFF_PET` (`_Common/SkillInfluence.h:6`), the raised pet's stat, and `IK3_EGG`. */
const BUFF_PET = 2;
const IK3_EGG = 120;
/** 2026-11-09 (pets B1): `BUFF_EQUIP` (`_Common/buff.h`), the buff pet item's, and `IK3_PET`. */
const BUFF_EQUIP = 4;
const IK3_PET = 100;
/** `II_SYS_SYS_SCR_RETURN`: its icon always blinks, and its double-click goes back. */
const RETURN_SCROLL = 10469;
/** 2026-11-05: `II_SYS_SYS_SCR_PARTYSUMMON`: a party member's summon buff, whose double-click asks to go to the leader. */
const PARTY_SUMMON = 26202;
/**
 * 2026-11-09 (pets R3): `II_SYS_SYS_SCR_PET_FEED_POCKET`: the feed pocket's buff, whose double-click turns it off
 * (`SendFeedPocketInactive`, `CWndWorld::OnLButtonDblClk`, `WndWorld.cpp:7280-7283`).
 */
const FEED_POCKET = 21035;
/** Two taps of a finger this near are a double-click (Windows' own double-click time). */
const DOUBLE_TAP_MS = 500;
/** An item buff of `dwSkillTime` 999999999 shows no time (`WndWorld.cpp:9318`). */
const ENDLESS_MS = 999_999_999;

export type ItemsOf = ReadonlyMap<number, Pick<WebItemProp, 'name' | 'icon'> & { circleTime?: number; kind3?: number }>;

/** A premium timer (`m_dwSMTime[type]`): its `SM_*` type and the seconds it has left. */
export interface SmShown { type: number; seconds: number }

/**
 * `_ADDSMMODE::dwSMItemID` (`_Network/CmnHdr.h:509-556`): the item each SM mode is shown with. The resist modes (16-18)
 * take theirs from the worn element (`OnSMMode`), which the browser does not follow: left out.
 */
const SM_ITEMS: ReadonlyMap<number, number> = new Map([
  [0, 10216], [1, 10217], [2, 10214], [3, 10215], [4, 10212], [5, 10213], [6, 10207], [7, 10208], [8, 10209], [9, 10210],
  [10, 10218], [11, 10366], [12, 10367], [13, 10369], [14, 10368], [15, 10270], [19, 10435], [20, 10430], [21, 10432],
  [22, 30057], [23, 30058], [24, 26557], [25, 26559],
]);
/**
 * The element stones' modes, `SM_RESIST_ATTACK_LEFT` 16, `_RIGHT` 17 and `SM_RESIST_DEFENSE` 18: the stone of the element
 * RESISTSMMODE names (`OnResistSMMode`, `DPClient.cpp:6070-6125`), by `SAI79` FIRE 1, WATER 2, ELECTRICITY 3, WIND 4,
 * EARTH 5: the attack stones 10277, 10278, 10280, 10279, 10281 and the defence ones 10282, 10283, 10285, 10284, 10286.
 */
const RESIST_ATTACK: readonly number[] = [0, 10277, 10278, 10280, 10279, 10281];
const RESIST_DEFENSE: readonly number[] = [0, 10282, 10283, 10285, 10284, 10286];
/** The elements RESISTSMMODE gave, 0xff for none. */
export interface ResistElements { left: number; right: number; defense: number }

/** `SM_STR_DOWN` .. `SM_INT_DOWN`: shown whatever their time. */
const SM_PENALTIES: ReadonlySet<number> = new Set([11, 12, 13, 14]);
/** `SM_REVIVAL`: it never blinks. */
const SM_REVIVAL = 20;

/**
 * The ES scrolls' kinds (`RenderBuff`, `WndWorld.cpp:10678-10690`): A, B, C, D and S are each three ids drawn as one
 * icon of the first; E is one of its own, which does not stack. S is the special one (`bSpecial`, `__S_ADD_EXP`).
 */
const ES_KINDS: ReadonlyArray<{ base: number; ids: readonly number[]; special?: boolean }> = [
  { base: 26205, ids: [26205, 26206, 26207] }, { base: 26208, ids: [26208, 26209, 26210] },
  { base: 26211, ids: [26211, 26212, 26213] }, { base: 26214, ids: [26214, 26215, 26216] }, { base: 26219, ids: [26219] },
  { base: 30148, ids: [30148, 30149, 30150], special: true },
];

/** What an icon shows: its name, picture, tint, tooltip lines, how it blinks, and what it says under it. */
interface Look {
  /** What the icons are made again for when it changes. */
  key: string;
  name: string;
  icon: string | null;
  /** Half-size copies of the icon under it (an ES scroll's second and third). */
  copies: number;
  harmful: boolean;
  tooltip: () => string[];
  /** 'never', 'always', or 'under' the time `blinkUnder` (ms). */
  blink: 'never' | 'always' | 'under';
  blinkLeftMs: number;
  blinkUnderMs: number;
  /** The skill buffs' seconds on the icon, or an item's time in units under it, or nothing. */
  label: { kind: 'seconds' | 'time'; text: string } | null;
  /** The Scroll of Return's: a double-click goes back (the party summon's and, pets R3, the feed pocket's do their own). */
  goesBack: boolean;
  /** 2026-11-10: the angel's: a press asks for the full angel's item (`OnLButtonDown`, WndWorld.cpp:6769-6794). */
  press?: () => void;
}
const PER_ROW = 7;
const PITCH = 34;
/** The icon of 32 px at 1.2 times (`vScale( 1.2f, 1.2f )`). */
const ICON_PX = 38.4;
/** How many rows the CSS box holds. */
const ROWS = 4;
/** The alphas of an icon: 192, and between 64 and 192 under 20 s left, 6 a frame. */
const ALPHA = 192;
const ALPHA_LOW = 64;
const ALPHA_STEP = 6;
const BLINK_MS = 20000;
/** `m_bCling`: within this of an edge, a dragged window goes against it. */
const CLING = 10;
/** The owner's phone size: half (2026-11-05). */
const PHONE_SCALE = 0.5;
const PHONE_QUERY = '(max-width: 1000px) and (pointer: coarse)';
/** Plain names of the first jobs' buffs' parameters (`DST_*`); the catalog's tooltip texts are not converted. */
const PARAM_NAMES: Readonly<Record<number, string>> = {
  1: 'STR', 2: 'DEX', 3: 'INT', 4: 'STA', 8: 'Ranged block', 11: 'Speed', 14: 'Melee block', 24: 'Attack speed',
  35: 'Max HP', 47: 'Hit rate', 57: 'Stun chance', 58: 'HP recovery', 26: 'Defense',
};

export type SkillsOf = ReadonlyMap<number, Pick<WebSkill, 'name' | 'description' | 'icon' | 'evildoing' | 'levels'>>;

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * The tooltip's time (`WndField.cpp:18880-18893`, `WndWorld.cpp:10550-10600`): `dd:hh:mm:ss` from a day, `hh:mm:ss` from
 * an hour, else `mm:ss`.
 */
export function clock(ms: number): string {
  const s = Math.trunc(ms / 1000);
  const days = Math.trunc(s / 86400), hours = Math.trunc(s / 3600) % 24, minutes = Math.trunc(s / 60) % 60, seconds = s % 60;
  if (days > 0) return `${pad(days)}:${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/** The tooltip's lines: the name and `"   Lvl %d"`, the description, a line per parameter of the level, the time left. */
export function buffTooltip(skill: Pick<WebSkill, 'name' | 'description' | 'levels'>, buff: BuffShown): string[] {
  const level = skill.levels[buff.level - 1] as { destParams?: number[]; adjParams?: number[] } | undefined;
  const params = (level?.destParams ?? []).flatMap((dst, i) => {
    const adj = level?.adjParams?.[i] ?? -1;
    if (dst === -1 || adj === -1) return [];
    return [`${PARAM_NAMES[dst] ?? `DST ${dst}`} ${adj >= 0 ? '+' : ''}${adj}`];
  });
  return [`${skill.name}   Lvl ${buff.level}`, skill.description, ...params, ...(buff.totalMs > 0 ? [clock(buff.leftMs)] : [])]
    .filter((line) => line !== '');
}

/** The alpha of a blinking icon, one frame on: 6 down, or up once it reached 64, back down at 192. */
export function blink(state: { alpha: number; up: boolean }): number {
  state.alpha += state.up ? ALPHA_STEP : -ALPHA_STEP;
  if (state.alpha <= ALPHA_LOW) { state.alpha = ALPHA_LOW; state.up = true; }
  if (state.alpha >= ALPHA) { state.alpha = ALPHA; state.up = false; }
  return state.alpha;
}

/** `RenderExpBuffIcon`'s bonus (:10403-10436): of `count` scrolls of a kind at `level`, in percent. */
export function esBonus(count: number, level: number, special: boolean): number {
  let factor = 1;
  if (count === 1) factor = 1.5;
  else if (count === 2) factor = special || level < 61 ? 2.0 : 1.5;
  else if (count >= 3) factor = special || level < 41 ? 2.5 : level < 61 ? 2.0 : 1.5;
  return Math.trunc((factor - 1) * 100);
}

export interface BuffStatusOptions {
  /** The item buffs' items (Piece 7 M3; without it only skill buffs show). */
  items?: ItemsOf;
  /** A double-click (or a double tap) on the Scroll of Return's icon. */
  onReturnScroll?: () => void;
  /** 2026-11-05: a double-click (or a double tap) on the party summon's buff icon. */
  onPartySummon?: () => void;
  /** 2026-11-09 (pets R3): a double-click (or a double tap) on the feed pocket's buff icon. */
  onFeedPocket?: () => void;
  /** The taps' clock (ms). */
  now?: () => number;
  /** A text by its TID, for the time units and the tooltips (the English fallbacks when absent). */
  texts?: (tid: string) => string | undefined;
  /** Whether the page is a phone's (half size); by default the windows' query. */
  phone?: () => boolean;
  /** Where it was put before (CSS pixels of its layer), or null for the CSS's place. */
  place?: { x: number; y: number } | null;
  /** Hears where a drag left it. */
  onPlace?: (at: { x: number; y: number }) => void;
  /** The room the task bar takes off the layer's bottom; by default the windows' (`setLayoutBottom`). */
  layoutBottom?: () => number;
  /** 2026-11-09 (pets R2): the own summoned raised pet's level (`g_pPlayer->GetPet()->GetLevel()`), null for none. */
  petLevel?: () => number | null;
  /** 2026-11-09 (pets R2): the own pet item's tooltip (`PutPetTooltipInfo( GetPetItem() )`), null with none. */
  petTooltip?: () => string[] | null;
  /**
   * 2026-11-09 (pets B1): `PutVisPetInfo`'s lines of the own buff pet item when it is of item `itemId` (`GetVisPetItem`),
   * null when it is not.
   */
  visPetTooltip?: (itemId: number) => string[] | null;
  /**
   * 2026-11-10 (Summon Angel): the own angel's EXP percent when `itemId` is an angel's buff (`IK3_ANGEL_BUFF`), else null:
   * its tooltip says it (`"   %d%%"`, WndWorld.cpp:9359-9370) and at 100 it blinks (:9267-9275).
   */
  angelPercent?: (itemId: number) => number | null;
  /** 2026-11-10: a press on the angel's icon (`SendAngelBuff` on a PK server, WndWorld.cpp:6769-6794). */
  onAngelPress?: () => void;
}

/** The time units under an item's icon (`RenderOptBuffTime`, `WndWorld.cpp:11197-11227`). */
const UNITS: ReadonlyArray<[string, string, number]> = [
  ['TID_PK_LIMIT_DAY', '%.1dday', 86400], ['TID_PK_LIMIT_HOUR', '%.1dhr', 3600], ['TID_PK_LIMIT_MINUTE', '%.1dmin', 60],
];

export class BuffStatus {
  readonly element: HTMLElement;
  private readonly blinks = new Map<string, { alpha: number; up: boolean }>();
  private scale = 1;
  private placed: { x: number; y: number } | null;
  private drag: { pointerId: number; dx: number; dy: number; moved: boolean } | null = null;
  /** The icons' extent in CSS pixels: what is kept on the layer. */
  private extent = { w: 0, h: 0 };

  constructor(
    private readonly art: UiArt,
    private readonly doc: Document = document,
    private readonly options: BuffStatusOptions = {},
  ) {
    this.element = doc.createElement('div');
    this.element.className = 'hud-buffs';
    this.element.hidden = true;
    this.placed = options.place ?? null;
  }

  /**
   * The own buffs at `now` (ms): the skill buffs in their order, then the item buffs (Piece 7 M3), then the premium
   * timers `extra.sm` (2026-11-05); `extra.level` is the own level, which an ES scroll's bonus depends on. One call a
   * frame (the blinking). The icons are made again only when what they show changes; from frame to frame their alpha,
   * time and tooltip change in place (a tooltip, and a phone's frames, need the same element).
   */
  update(buffs: readonly BuffShown[], skills: SkillsOf, now: number, extra: { sm?: readonly SmShown[]; level?: number; resist?: ResistElements } = {}): void {
    void now;
    const scale = this.phone() ? PHONE_SCALE : 1;
    const looks: Look[] = [
      ...buffs.filter((b) => b.buffType === BUFF_SKILL && skills.has(b.id)).sort((a, b) => a.id - b.id)
        .map((b) => this.skillLook(b, skills.get(b.id)!)),
      ...this.itemLooks(buffs, extra.level ?? 1),
      ...this.smLooks(extra.sm ?? [], extra.resist),
    ];
    this.element.hidden = looks.length === 0;
    const listed = `${scale}|${looks.map((look) => look.key).join(',')}`;
    if (listed !== this.listed) {
      this.listed = listed;
      this.scale = scale;
      this.element.toggleAttribute('data-phone', scale !== 1);
      Object.assign(this.element.style, { width: `${PER_ROW * PITCH * scale}px`, height: `${ROWS * PITCH * scale}px` });
      this.element.replaceChildren(...looks.map((look, i) => this.icon(look, i)));
      const n = looks.length, cols = Math.min(n, PER_ROW), rows = Math.ceil(n / PER_ROW);
      this.extent = n === 0 ? { w: 0, h: 0 } : { w: ((cols - 1) * PITCH + ICON_PX) * scale, h: ((rows - 1) * PITCH + ICON_PX) * scale };
      this.refit();
    }
    looks.forEach((look, i) => this.refresh(this.element.children[i] as HTMLElement, look));
  }

  /** Keeps a placed display on its layer after the screen changed size (as `WindowFrame.refit`). */
  refit(): void {
    if (this.placed !== null) this.moveTo(this.placed.x, this.placed.y, false);
  }

  dispose(): void {
    this.endDrag();
    this.element.remove();
  }

  /** What the icons were last made for. */
  private listed = '';

  private phone(): boolean {
    if (this.options.phone !== undefined) return this.options.phone();
    return this.doc.defaultView?.matchMedia?.(PHONE_QUERY).matches === true;
  }

  private text(tid: string, fallback: string): string {
    return this.options.texts?.(tid) ?? fallback;
  }

  /** `RenderOptBuffTime`: the largest whole unit of the time left. */
  private units(ms: number): string {
    const s = Math.trunc(ms / 1000);
    for (const [tid, fallback, unit] of UNITS) if (s >= unit) return formatText(this.text(tid, fallback), [Math.trunc(s / unit)]);
    return formatText(this.text('TID_PK_LIMIT_SECOND', '%.1dsec'), [s]);
  }

  private skillLook(buff: BuffShown, skill: SkillsOf extends ReadonlyMap<number, infer S> ? S : never): Look {
    return {
      key: `${buff.buffType}:${buff.id}:${buff.level}:${buff.totalMs > 0}`, name: skill.name, icon: skill.icon, copies: 0,
      harmful: skill.evildoing < 0, tooltip: () => buffTooltip(skill, buff), blink: 'under', blinkLeftMs: buff.totalMs > 0 ? buff.leftMs : Infinity,
      blinkUnderMs: BLINK_MS, label: buff.totalMs > 0 ? { kind: 'seconds', text: String(Math.trunc(buff.leftMs / 1000)) } : null,
      goesBack: false,
    };
  }

  /**
   * The item buffs in the map's order (`MAKELONG( id, type )`: by type, then id), the ES scrolls of a kind as one icon
   * where the first of them is, the raised pet's among them (2026-11-09).
   */
  private itemLooks(buffs: readonly BuffShown[], level: number): Look[] {
    const items = this.options.items;
    if (items === undefined) return [];
    const shown = buffs
      .filter((b) => (b.buffType === BUFF_ITEM || b.buffType === BUFF_ITEM2 || b.buffType === BUFF_PET || b.buffType === BUFF_EQUIP) &&
        items.has(b.id))
      .sort((a, b) => a.buffType - b.buffType || a.id - b.id);
    const looks: Look[] = [];
    const esDone = new Set<number>();
    for (const buff of shown) {
      if (buff.buffType === BUFF_PET) {
        const look = this.petLook(buff, items.get(buff.id)!);
        if (look !== null) looks.push(look);
        continue;
      }
      const kind = ES_KINDS.find((k) => k.ids.includes(buff.id));
      if (kind !== undefined) {
        if (esDone.has(kind.base)) continue;
        esDone.add(kind.base);
        const of = shown.filter((b) => kind.ids.includes(b.id)).slice(0, kind.ids.length === 1 ? 1 : 3);
        looks.push(this.esLook(kind, of, level));
        continue;
      }
      const item = items.get(buff.id)!;
      // 2026-11-09 (pets B1): BUFF_EQUIP shows no time, under the icon or in the tooltip (:9323-9325, :9510-9511)
      const equip = buff.buffType === BUFF_EQUIP;
      const timed = buff.totalMs > 0 && buff.totalMs !== ENDLESS_MS && !equip;
      const vis = (): string[] | null => (item.kind3 === IK3_PET ? this.options.visPetTooltip?.(buff.id) ?? null : null);
      // 2026-11-10 (Summon Angel): the angel's percent after its name, and its blink at 100 (WndWorld.cpp:9247-9277, :9359-9370)
      const angel = this.options.angelPercent?.(buff.id) ?? null;
      looks.push({
        key: `${buff.buffType}:${buff.id}:${timed}`, name: item.name, icon: item.icon, copies: 0, harmful: false,
        tooltip: () => [angel === null ? item.name : `${item.name}   ${angel}%`, ...(vis() ?? (buff.totalMs > 0 && !equip ? [clock(buff.leftMs)] : []))],
        blink: buff.id === RETURN_SCROLL || angel === 100 ? 'always' : 'under', blinkLeftMs: buff.totalMs > 0 ? buff.leftMs : Infinity,
        blinkUnderMs: BLINK_MS, label: timed && buff.leftMs > 0 ? { kind: 'time', text: this.units(buff.leftMs) } : null,
        goesBack: buff.id === RETURN_SCROLL || buff.id === PARTY_SUMMON || buff.id === FEED_POCKET,
        ...(angel !== null ? { press: () => this.options.onAngelPress?.() } : {}),
      });
    }
    return looks;
  }

  /**
   * 2026-11-09 (pets R2): a `BUFF_PET` (`RenderBuffIcon`, `WndWorld.cpp:9219-9228`): the texture of
   * `GetSystemPetTextureKey`, none of which leaves the icon out (`pp == NULL`, :9230-9231; Neuz keeps its place empty);
   * no time and no blinking (`GetTotal()` is 0, :9239-9246); an `IK3_EGG` item's tooltip is the own pet item's
   * (`PutPetTooltipInfo`, :9371-9379), else the item's name.
   */
  private petLook(buff: BuffShown, item: ItemsOf extends ReadonlyMap<number, infer I> ? I : never): Look | null {
    const icon = petBuffIcon({ id: buff.id, icon: item.icon, kind3: item.kind3 ?? -1 }, this.options.petLevel?.() ?? null);
    if (icon === null) return null;
    return {
      key: `${BUFF_PET}:${buff.id}:${icon}`, name: item.name, icon, copies: 0, harmful: false,
      tooltip: () => (item.kind3 === IK3_EGG ? this.options.petTooltip?.() : null) ?? [item.name],
      blink: 'never', blinkLeftMs: Infinity, blinkUnderMs: 0, label: null, goesBack: false,
    };
  }

  /** `RenderExpBuffIcon`: one icon of the kind's first id, the copies under it, the bonus and each one's time. */
  private esLook(kind: (typeof ES_KINDS)[number], of: readonly BuffShown[], level: number): Look {
    const item = this.options.items!.get(kind.base) ?? this.options.items!.get(of[0]!.id)!;
    const order = ['TID_GAME_EXP_COUTMSG1', 'TID_GAME_EXP_COUTMSG2', 'TID_GAME_EXP_COUTMSG3'];
    const fallbacks = ['First:', 'Second:', 'Third:'];
    const time = (ms: number): string => {
      const s = Math.trunc(ms / 1000);
      return s >= 3600 ? ` ${pad(Math.trunc(s / 3600))}:${pad(Math.trunc(s / 60) % 60)}:${pad(s % 60)} ` : ` ${pad(Math.trunc(s / 60))}:${pad(s % 60)} `;
    };
    return {
      key: `es:${kind.base}:${of.length}`, name: item.name, icon: item.icon, copies: of.length - 1, harmful: false,
      tooltip: () => [
        item.name,
        `${this.text('TID_GAME_EXPITEM_TOOLTIP', 'Acquired EXP')} ${esBonus(of.length, level, kind.special === true)}% ${this.text('TID_GAME_EXPITEM_TOOLTIP1', 'Increases')}`,
        this.text('TID_GAME_EXP_COUTMSG0', 'The time left'),
        ...of.map((b, i) => `  ${this.text(order[i]!, fallbacks[i]!)}${time(b.leftMs)}`),
      ],
      blink: 'never', blinkLeftMs: Infinity, blinkUnderMs: 0, label: null, goesBack: false,
    };
  }

  /** `RenderSMBuff`: each SM mode in its last 30 minutes (the stat penalties always), with its item's icon. */
  private smLooks(sm: readonly SmShown[], resist?: ResistElements): Look[] {
    const items = this.options.items;
    if (items === undefined) return [];
    return [...sm].sort((a, b) => a.type - b.type).flatMap(({ type, seconds }): Look[] => {
      const itemId = smItem(type, resist), item = items.get(itemId);
      // `0 == days && 0 == hours && minutes <= 30`: to 30:59
      if (seconds <= 0 || item === undefined || (seconds >= 31 * 60 && !SM_PENALTIES.has(type))) return [];
      const whenDying = item.circleTime === 1;
      return [{
        key: `sm:${type}:${itemId}`, name: item.name, icon: item.icon, copies: 0, harmful: false,
        tooltip: () => [item.name, whenDying ? this.text('TID_GAME_COND_USE', 'Takes effect when player dies.') : clock(seconds * 1000)],
        blink: type === SM_REVIVAL ? 'never' : 'under', blinkLeftMs: seconds * 1000, blinkUnderMs: 60_000,
        label: whenDying ? null : { kind: 'time', text: this.units(seconds * 1000) }, goesBack: false,
      }];
    });
  }

  private icon(look: Look, i: number): HTMLElement {
    const s = this.scale;
    const icon = this.doc.createElement('div');
    icon.className = 'hud-buff';
    Object.assign(icon.style, {
      position: 'absolute', left: `${(i % PER_ROW) * PITCH * s}px`, top: `${Math.trunc(i / PER_ROW) * PITCH * s}px`,
      width: `${ICON_PX * s}px`, height: `${ICON_PX * s}px`,
    });
    if (look.harmful) icon.dataset.harmful = '';
    const picture = (alt: string): HTMLImageElement => {
      const img = this.doc.createElement('img');
      img.alt = alt;
      img.draggable = false;
      img.src = look.icon === null ? '' : this.art.url(look.icon);
      return img;
    };
    const img = picture(look.name);
    Object.assign(img.style, { width: '100%', height: '100%' });
    icon.append(img);
    // the second at (5, 30) and the third at (22, 30) of a 32 px icon, at half size, here at 1.2 times
    for (let j = 1; j <= look.copies; j++) {
      const copy = picture('');
      copy.className = 'hud-buff-copy';
      Object.assign(copy.style, {
        position: 'absolute', left: `${(j === 1 ? 5 : 22) * 1.2 * s}px`, top: `${30 * 1.2 * s}px`,
        width: `${(ICON_PX / 2) * s}px`, height: `${(ICON_PX / 2) * s}px`,
      });
      icon.append(copy);
    }
    if (look.label !== null) {
      const label = this.doc.createElement('span');
      label.className = look.label.kind === 'seconds' ? 'hud-buff-seconds' : 'hud-buff-time';
      icon.append(label);
    }
    icon.addEventListener('pointerdown', (event) => this.startDrag(event as PointerEvent));
    if (look.goesBack) this.goesBack(icon, this.doubleClickOf(look.key));
    // 2026-11-10: the angel's icon: a press (a click that did not move the display)
    const press = look.press;
    if (press !== undefined) icon.addEventListener('click', () => { if (!this.dragged) press(); });
    return icon;
  }

  /** What a double-click on the icon of `key` does: the party summon's, the feed pocket's (pets R3) or the Scroll of Return's. */
  private doubleClickOf(key: string): () => void {
    if (key.includes(`:${PARTY_SUMMON}:`)) return () => this.options.onPartySummon?.();
    if (key.includes(`:${FEED_POCKET}:`)) return () => this.options.onFeedPocket?.();
    return () => this.options.onReturnScroll?.();
  }

  /**
   * Piece 7 M3: the Scroll of Return's icon: a double-click, or two taps within 500 ms, goes back; 2026-11-05: the party
   * summon's asks to go to the leader (`CWndWorld::OnLButtonDblClk`, WndWorld.cpp:7268-7279).
   */
  private goesBack(icon: HTMLElement, back: () => void): void {
    icon.addEventListener('dblclick', back);
    let lastTap = -Infinity;
    icon.addEventListener('pointerup', (event) => {
      if ((event as PointerEvent).pointerType !== 'touch' || this.dragged) return;
      const now = this.options.now?.() ?? performance.now();
      if (now - lastTap <= DOUBLE_TAP_MS) {
        lastTap = -Infinity;
        back();
      } else {
        lastTap = now;
      }
    });
  }

  /** A frame of an icon: its alpha (blinking under its time, or always), its tooltip and its time. */
  private refresh(icon: HTMLElement, look: Look): void {
    const blinking = look.blink === 'always' || (look.blink === 'under' && look.blinkLeftMs < look.blinkUnderMs);
    let alpha = ALPHA;
    if (blinking) {
      const state = this.blinks.get(look.key) ?? { alpha: ALPHA, up: false };
      this.blinks.set(look.key, state);
      alpha = blink(state);
    } else {
      this.blinks.delete(look.key);
    }
    icon.style.opacity = String(alpha / 255);
    const title = look.tooltip().join('\n');
    if (icon.title !== title) icon.title = title;
    const label = icon.querySelector('.hud-buff-seconds, .hud-buff-time');
    if (label !== null && look.label !== null && label.textContent !== look.label.text) label.textContent = look.label.text;
  }

  /** The last drag moved the display (a touch's pointerup is then no tap). */
  private dragged = false;

  /** `m_bPickup` on a press on an icon: the display follows the pointer until it is let go. */
  private startDrag(event: PointerEvent): void {
    if ((event.button ?? 0) !== 0 || this.drag !== null) return;
    const at = this.position();
    this.drag = { pointerId: event.pointerId ?? 0, dx: event.clientX - at.x, dy: event.clientY - at.y, moved: false };
    this.dragged = false;
    const view = this.doc.defaultView;
    view?.addEventListener('pointermove', this.onMove);
    view?.addEventListener('pointerup', this.onUp);
    view?.addEventListener('pointercancel', this.onUp);
  }

  private readonly onMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (drag === null || (event.pointerId ?? 0) !== drag.pointerId) return;
    drag.moved = true;
    this.dragged = true;
    this.moveTo(event.clientX - drag.dx, event.clientY - drag.dy, true);
  };

  private readonly onUp = (event: PointerEvent): void => {
    const drag = this.drag;
    if (drag === null || (event.pointerId ?? 0) !== drag.pointerId) return;
    this.endDrag();
    if (drag.moved && this.placed !== null) this.options.onPlace?.({ ...this.placed });
  };

  private endDrag(): void {
    this.drag = null;
    const view = this.doc.defaultView;
    view?.removeEventListener('pointermove', this.onMove);
    view?.removeEventListener('pointerup', this.onUp);
    view?.removeEventListener('pointercancel', this.onUp);
  }

  /** Where it is: its top left in CSS pixels of its layer (where it was put, or where the CSS puts it). */
  private position(): { x: number; y: number } {
    if (this.placed !== null) return this.placed;
    const layer = this.element.parentElement;
    const box = this.element.getBoundingClientRect(), room = layer?.getBoundingClientRect();
    return { x: box.left - (room?.left ?? 0), y: box.top - (room?.top ?? 0) };
  }

  /** As `WindowFrame.moveTo`: kept on the layer above the task bar, against an edge within 10 px while dragged. */
  private moveTo(x: number, y: number, cling: boolean): void {
    const layer = this.element.parentElement;
    const right = layer?.clientWidth ?? 0;
    const bottom = (layer?.clientHeight ?? 0) - (this.options.layoutBottom?.() ?? (layer === null ? 0 : layoutBottomOf(layer)));
    const { w, h } = this.extent;
    let px = Math.round(x);
    let py = Math.round(y);
    if (right > 0 && bottom > 0) {
      if (cling) {
        if (px < CLING && px > 0) px = 0;
        if (py < CLING && py > 0) py = 0;
        if (px + w > right - CLING && px + w < right) px = Math.round(right - w);
        if (py + h > bottom - CLING && py + h < bottom) py = Math.round(bottom - h);
      }
      if (px + w > right) px = Math.round(right - w);
      if (py + h > bottom) py = Math.round(bottom - h);
      if (px < 0) px = 0;
      if (py < 0) py = 0;
    }
    if (cling) this.placed = { x: px, y: py };
    this.element.style.left = `${px}px`;
    this.element.style.top = `${py}px`;
  }
}

/** The item an SM mode is shown with: `dwSMItemID`, an element stone's by the element RESISTSMMODE named (0: none). */
function smItem(type: number, resist: ResistElements | undefined): number {
  if (type === 16 || type === 17 || type === 18) {
    const element = resist === undefined ? 0xff : type === 16 ? resist.left : type === 17 ? resist.right : resist.defense;
    return (type === 18 ? RESIST_DEFENSE : RESIST_ATTACK)[element] ?? 0;
  }
  return SM_ITEMS.get(type) ?? 0;
}

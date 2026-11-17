/**
 * custom (owner 2026-11-15): Auto Play. The farm bot's, the auto pots' and the auto skills' settings, one set per
 * character (skills and items differ by job), kept in localStorage under `flyffweb.autoPlay.<playerId>`. V15 has no
 * such feature (docs/superpowers/specs/2026-11-15-auto-play-design.md, 6.12).
 * (2026-11-16: the farm bot's looting follows the Pet Filter, items/petFilter.ts, a setting of its own.)
 */

export type GaugeRow = 'hp' | 'mp' | 'fp';
export const GAUGE_ROWS: readonly GaugeRow[] = ['hp', 'mp', 'fp'];

export interface PotionRow {
  /** The item's prop index (`InventoryItem.itemId`), 0 for none: any stack of it in the bag is used. */
  itemIndex: number;
  /** Use the item below this percent of the gauge's maximum. */
  below: number;
  on: boolean;
}

export interface AutoPlaySettings {
  version: 1;
  farm: {
    radius: number; loot: boolean; stopAfterMin: number /* 0 = off */;
    /** 2026-11-17 (owner): bosses, mid-bosses and giants left alone. */
    avoidGiants: boolean;
    /** 2026-11-17 (owner): the monster kinds (`added.index`) to fight, max 16; empty: every kind. */
    only: number[];
    /**
     * 2026-11-18 (owner): the hunting area's centre: where the last monster died ('lastKill', the default: the area moves
     * with the bot, which never walks back) or where Start was pressed ('start', the first behaviour: it walks back there).
     */
    center: 'lastKill' | 'start';
  };
  pots: { enabled: boolean; rows: Record<GaugeRow, PotionRow> };
  skills: {
    actionSlot: boolean;
    /** Skill indexes, max 4. */
    ready: number[];
    /** Max 8. */
    buffs: Array<{ kind: 'skill' | 'item'; index: number }>;
  };
  /** 2026-11-17 (owner): Support mode, for a buffer: the partner (any player targeted), heals, buffs on them, raising them. */
  support: {
    partnerPlayerId: number; partnerName: string;
    /** Heal skill slots, max 2. */
    heals: number[];
    partnerBelow: number; selfBelow: number;
    /** Buff skill slots cast on the partner, max 8. */
    buffs: number[];
    resurrect: boolean;
  };
  /** Which mode the AUTO button starts: the one last started. */
  mode: 'farm' | 'support';
}

export type BuffEntry = AutoPlaySettings['skills']['buffs'][number];

export const RADIUS = { min: 5, max: 30, step: 5, initial: 15 } as const;
export const BELOW = { min: 10, max: 90, step: 5 } as const;
export const STOP_AFTER = { min: 60, max: 720, step: 60 } as const;
export const MAX_READY = 4;
export const MAX_BUFFS = 8;
export const MAX_ONLY = 16;
export const MAX_HEALS = 2;
export const MAX_PARTNER_BUFFS = 8;
const STORE_KEY = 'flyffweb.autoPlay.';

export function defaultSettings(): AutoPlaySettings {
  return {
    version: 1,
    farm: { radius: RADIUS.initial, loot: true, stopAfterMin: 0, avoidGiants: true, only: [], center: 'lastKill' },
    pots: {
      enabled: false,
      rows: {
        hp: { itemIndex: 0, below: 50, on: true },
        mp: { itemIndex: 0, below: 30, on: true },
        fp: { itemIndex: 0, below: 30, on: true },
      },
    },
    skills: { actionSlot: true, ready: [], buffs: [] },
    support: { partnerPlayerId: 0, partnerName: '', heals: [], partnerBelow: 70, selfBelow: 50, buffs: [], resurrect: true },
    mode: 'farm',
  };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isIndex = (v: unknown): v is number => isNumber(v) && Number.isInteger(v) && v > 0;
/** A job-skill slot (`m_aJobSkill`): 0 is the first. */
const isSlot = (v: unknown): v is number => isNumber(v) && Number.isInteger(v) && v >= 0;

/** `value` to the nearest `step` within `min`..`max`, or `fallback` when it is not a number. */
function stepped(value: unknown, min: number, max: number, step: number, fallback: number): number {
  if (!isNumber(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value / step) * step));
}

/** Any stored value made safe: bad or missing fields take their defaults, numbers are clamped to their steps. */
export function clampSettings(raw: unknown): AutoPlaySettings {
  const s = defaultSettings();
  if (!isObject(raw) || raw.version !== 1) return s;
  const farm = isObject(raw.farm) ? raw.farm : {};
  s.farm.radius = stepped(farm.radius, RADIUS.min, RADIUS.max, RADIUS.step, RADIUS.initial);
  if (typeof farm.loot === 'boolean') s.farm.loot = farm.loot;
  if (typeof farm.avoidGiants === 'boolean') s.farm.avoidGiants = farm.avoidGiants;
  if (farm.center === 'start') s.farm.center = 'start';
  if (Array.isArray(farm.only)) s.farm.only = [...new Set(farm.only.filter(isIndex))].slice(0, MAX_ONLY);
  s.farm.stopAfterMin = isNumber(farm.stopAfterMin) && farm.stopAfterMin > 0
    ? stepped(farm.stopAfterMin, STOP_AFTER.min, STOP_AFTER.max, STOP_AFTER.step, 0) : 0;
  const pots = isObject(raw.pots) ? raw.pots : {};
  if (typeof pots.enabled === 'boolean') s.pots.enabled = pots.enabled;
  const rows = isObject(pots.rows) ? pots.rows : {};
  for (const name of GAUGE_ROWS) {
    const row = isObject(rows[name]) ? rows[name] as Record<string, unknown> : {};
    const out = s.pots.rows[name];
    if (isIndex(row.itemIndex)) out.itemIndex = row.itemIndex;
    out.below = stepped(row.below, BELOW.min, BELOW.max, BELOW.step, out.below);
    if (typeof row.on === 'boolean') out.on = row.on;
  }
  const skills = isObject(raw.skills) ? raw.skills : {};
  if (typeof skills.actionSlot === 'boolean') s.skills.actionSlot = skills.actionSlot;
  if (Array.isArray(skills.ready)) s.skills.ready = skills.ready.filter(isSlot).slice(0, MAX_READY);
  if (Array.isArray(skills.buffs)) {
    s.skills.buffs = skills.buffs
      .filter((b): b is BuffEntry => isObject(b) && ((b.kind === 'skill' && isSlot(b.index)) || (b.kind === 'item' && isIndex(b.index))))
      .map((b) => ({ kind: b.kind, index: b.index }))
      .slice(0, MAX_BUFFS);
  }
  const support = isObject(raw.support) ? raw.support : {};
  const out = s.support;
  if (isIndex(support.partnerPlayerId)) out.partnerPlayerId = support.partnerPlayerId;
  if (typeof support.partnerName === 'string') out.partnerName = support.partnerName.slice(0, 32);
  if (Array.isArray(support.heals)) out.heals = support.heals.filter(isSlot).slice(0, MAX_HEALS);
  if (Array.isArray(support.buffs)) out.buffs = support.buffs.filter(isSlot).slice(0, MAX_PARTNER_BUFFS);
  out.partnerBelow = stepped(support.partnerBelow, BELOW.min, BELOW.max, BELOW.step, out.partnerBelow);
  out.selfBelow = stepped(support.selfBelow, BELOW.min, BELOW.max, BELOW.step, out.selfBelow);
  if (typeof support.resurrect === 'boolean') out.resurrect = support.resurrect;
  if (raw.mode === 'support') s.mode = 'support';
  return s;
}

/** The character's settings, or the defaults when the store is missing, blocked or holds something unreadable. */
export function loadSettings(store: Pick<Storage, 'getItem'> | null, playerId: number): AutoPlaySettings {
  try {
    const text = store?.getItem(STORE_KEY + playerId);
    return text ? clampSettings(JSON.parse(text)) : defaultSettings();
  } catch {
    return defaultSettings();
  }
}

/** Keeps the character's settings; a missing or blocked store is ignored (the settings then last this visit only). */
export function saveSettings(store: Pick<Storage, 'setItem'> | null, playerId: number, s: AutoPlaySettings): void {
  try {
    store?.setItem(STORE_KEY + playerId, JSON.stringify(s));
  } catch {
    // private window, full or blocked storage: keep going without saving
  }
}

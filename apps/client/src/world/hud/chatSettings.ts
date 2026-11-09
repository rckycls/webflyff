// What the desktop chat keeps for the next time (2026-11-09): Neuz keeps the chat's Lock and place in regInfo.dat
// (`CWndChat::SerializeRegInfo`, WndCommunication.cpp:592-612, after `CWndNeuz::SerializeRegInfo`'s rectangle) and each
// tab's filter in neuz.ini (`ChatFilter0` to `4`, HwOption.cpp:898-923, :1107-1111). The browser keeps them in its
// storage, which can be missing or throw (a private window, blocked site data): every access is tried, and anything
// unreadable gives Neuz's defaults.

import { DEFAULT_FILTERS } from './chatRules';

export interface ChatSettings {
  /** WIDC_CHECK1, `m_bChatLock`. */
  lock: boolean;
  /** Each tab's filter (`m_dwChatFilter[ 5 ]`), its chat styles only (neuz.ini's are read so, :899). */
  filters: number[];
  /** Where the chat was put and its size; none while it was never moved nor resized (it stays on the task bar). */
  place?: { x: number; y: number; width: number; height: number };
}

const KEY = 'flyffweb.chat';
/** The five chat styles a filter keeps (`~( CHATSTY_HELP | CHATSTY_SYSTEM | CHATSTY_GAME )`, HwOption.cpp:899). */
const CHAT_STYLES = 0x1f;

const defaults = (): ChatSettings => ({ lock: false, filters: [...DEFAULT_FILTERS] });
const whole = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export function readChatSettings(storage: Storage | null | undefined): ChatSettings {
  try {
    const text = storage?.getItem(KEY);
    if (text === null || text === undefined) return defaults();
    const saved = JSON.parse(text) as Partial<ChatSettings> | null;
    const filters = Array.isArray(saved?.filters) && saved.filters.length === DEFAULT_FILTERS.length && saved.filters.every(whole)
      ? saved.filters.map((filter) => filter & CHAT_STYLES)
      : [...DEFAULT_FILTERS];
    const place = saved?.place;
    const settings: ChatSettings = { lock: saved?.lock === true, filters };
    if (place !== undefined && whole(place.x) && whole(place.y) && whole(place.width) && whole(place.height)) {
      settings.place = { x: place.x, y: place.y, width: place.width, height: place.height };
    }
    return settings;
  } catch {
    return defaults();
  }
}

export function writeChatSettings(storage: Storage | null | undefined, settings: ChatSettings): void {
  try {
    storage?.setItem(KEY, JSON.stringify(settings));
  } catch {
    // not kept: the next time starts from the defaults
  }
}

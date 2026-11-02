// The two volume steps the browser remembers (Piece 6 design §3.3), and nothing else: Neuz keeps them in neuz.ini as
// `Sound <voice> <effect> <bgm>` (HwOption.cpp:869-874, :1102), starting at 1.0 and 0.5 (:208-209). Kept in steps of
// the sliders, 0 to 10 (WndOptionGame.cpp:77-78). Storage can be missing or throw (a private window, blocked site data),
// so every access is tried, and anything unreadable gives the defaults.

export interface SoundSettings {
  /** The "Sound Effect" slider, 0-10. */
  effects: number;
  /** The "BGM" slider, 0-10. */
  music: number;
}

export const DEFAULT_SOUND: Readonly<SoundSettings> = { effects: 10, music: 5 };

const KEY = 'flyffweb.sound';

const step = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10 ? value : fallback;

export function readSoundSettings(storage: Storage | null): SoundSettings {
  try {
    const text = storage?.getItem(KEY);
    if (text === null || text === undefined) return { ...DEFAULT_SOUND };
    const saved = JSON.parse(text) as Partial<SoundSettings> | null;
    return { effects: step(saved?.effects, DEFAULT_SOUND.effects), music: step(saved?.music, DEFAULT_SOUND.music) };
  } catch {
    return { ...DEFAULT_SOUND };
  }
}

export function writeSoundSettings(storage: Storage | null, settings: SoundSettings): void {
  try {
    storage?.setItem(KEY, JSON.stringify({ effects: settings.effects, music: settings.music }));
  } catch {
    // not kept: the next page starts from the defaults
  }
}

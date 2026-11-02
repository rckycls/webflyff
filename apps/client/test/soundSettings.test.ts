import { describe, expect, it } from 'vitest';
import { DEFAULT_SOUND, readSoundSettings, writeSoundSettings } from '../src/audio/soundSettings';
import { loadAudio } from '../src/audio/audioCatalog';

/** A Storage over a map. */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); },
    clear: () => map.clear(), key: (i) => [...map.keys()][i] ?? null, get length() { return map.size; },
  };
}

describe('the sound settings the browser keeps', () => {
  it('start at Neuz\'s 1.0 and 0.5 (HwOption.cpp:208-209), in slider steps', () => {
    expect(DEFAULT_SOUND).toEqual({ effects: 10, music: 5 });
    expect(readSoundSettings(null)).toEqual({ effects: 10, music: 5 });
  });

  it('survive a round trip', () => {
    const storage = memoryStorage();
    writeSoundSettings(storage, { effects: 3, music: 9 });
    expect(readSoundSettings(storage)).toEqual({ effects: 3, music: 9 });
  });

  it('give the defaults for a bad value, and for a storage that throws', () => {
    const storage = memoryStorage();
    storage.setItem('flyffweb.sound', JSON.stringify({ effects: 11, music: 'loud' }));
    expect(readSoundSettings(storage)).toEqual({ effects: 10, music: 5 });
    storage.setItem('flyffweb.sound', '{not json');
    expect(readSoundSettings(storage)).toEqual({ effects: 10, music: 5 });
    const throwing = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } } as unknown as Storage;
    expect(readSoundSettings(throwing)).toEqual({ effects: 10, music: 5 });
    expect(() => writeSoundSettings(throwing, { effects: 1, music: 1 })).not.toThrow();
  });
});

describe('loadAudio', () => {
  it('says once what to run when the index has no audio.json', async () => {
    const errors: Error[] = [];
    const audio = await loadAudio({ url: () => null, json: async () => { throw new Error('unreachable'); } }, (e) => errors.push(e));
    expect(audio).toBeNull();
    expect(errors.map((e) => e.message)).toEqual(['audio.json missing: run npm run convert -- --only audio,data']);
  });
});

// The effects player: CSoundManager::Play (Source/_DirectX/dsutil.cpp:250-322) on Web Audio. Each play is a one-shot
// buffer source, placed once when it starts (soundRules: placeSound, pannerPosition) and never stopped early, with the
// volume of the moment it starts. docs/superpowers/specs/2026-11-02-piece6-m2-sound-research.md §7.
//
// Files are fetched the first time they play (the 1,150 WAVs are 164 MB), decoded once and kept, at most 64, the least
// recently played dropped first. A file that fails is said once and never fetched again. A play whose file is not ready
// within 500 ms is dropped, so a slow first download never plays a sound out of time (the plan's ruling 7).

import { SoundCopies, pannerPosition } from '../world/sound/soundRules';
import type { Vec } from '../world/sound/soundRules';

/** Decoded files kept. */
export const CACHE_SIZE = 64;
/** How late after its request a sound may still start. */
export const LATE_MS = 500;

export interface EffectsDeps {
  url(key: string): string | null;
  fetch(url: string): Promise<ArrayBuffer>;
  now(): number;
  report(error: Error): void;
}

export class EffectsPlayer {
  private readonly cache = new Map<string, AudioBuffer>();
  private readonly loading = new Map<string, Promise<AudioBuffer | null>>();
  private readonly fetching = new Map<string, Promise<ArrayBuffer>>();
  private readonly failed = new Set<string>();
  private readonly copies = new SoundCopies();
  private readonly active = new Map<AudioBufferSourceNode, string>();

  constructor(private readonly deps: EffectsDeps) {}

  /** Starts `key` on `context` now, or when its file is ready (within LATE_MS); `ready()` is asked again then. */
  play(context: AudioContext, key: string, local: Vec | null, gain: number, ready: () => boolean): void {
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      this.start(context, key, cached, local, gain);
      return;
    }
    const asked = this.deps.now();
    void this.load(context, key).then((buffer) => {
      if (buffer === null || this.deps.now() - asked > LATE_MS || !ready()) return;
      this.start(context, key, buffer, local, gain);
    });
  }

  /** Fetches the files of `keys` ahead of their first play, without decoding them (there may be no context yet). */
  prefetch(keys: Iterable<string>): void {
    for (const key of keys) {
      if (!this.cache.has(key) && !this.failed.has(key)) void this.bytes(key).catch(() => {});
    }
  }

  /** Ends every sound now playing. */
  stopAll(): void {
    for (const [source, key] of this.active) {
      source.onended = null;
      this.copies.release(key);
      try {
        source.stop();
      } catch {
        // already ended
      }
      source.disconnect();
    }
    this.active.clear();
  }

  private start(context: AudioContext, key: string, buffer: AudioBuffer, local: Vec | null, gain: number): void {
    if (!this.copies.take(key)) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const level = context.createGain();
    level.gain.value = gain;
    if (local === null) {
      source.connect(level);
    } else {
      // DirectSound's 3D buffer: min 4, max 70 (dsutil.cpp:312-313), the inverse roll-off of factor 1 (:609-611)
      const panner = context.createPanner();
      panner.panningModel = 'equalpower';
      panner.distanceModel = 'inverse';
      panner.refDistance = 4;
      panner.rolloffFactor = 1;
      panner.maxDistance = 10000;
      const at = pannerPosition(local);
      panner.positionX.value = at.x;
      panner.positionY.value = at.y;
      panner.positionZ.value = at.z;
      source.connect(panner);
      panner.connect(level);
    }
    level.connect(context.destination);
    this.active.set(source, key);
    source.onended = () => {
      this.active.delete(source);
      this.copies.release(key);
      source.disconnect();
    };
    source.start();
  }

  private load(context: AudioContext, key: string): Promise<AudioBuffer | null> {
    if (this.failed.has(key)) return Promise.resolve(null);
    const known = this.loading.get(key);
    if (known !== undefined) return known;
    const loaded = this.bytes(key)
      .then((bytes) => context.decodeAudioData(bytes))
      .then((buffer) => {
        this.fetching.delete(key);
        this.cache.set(key, buffer);
        while (this.cache.size > CACHE_SIZE) this.cache.delete(this.cache.keys().next().value!);
        return buffer;
      })
      .catch((error: unknown) => {
        this.fetching.delete(key);
        this.fail(key, error instanceof Error ? error.message : String(error));
        return null;
      })
      .finally(() => this.loading.delete(key));
    this.loading.set(key, loaded);
    return loaded;
  }

  private bytes(key: string): Promise<ArrayBuffer> {
    let bytes = this.fetching.get(key);
    if (bytes === undefined) {
      const url = this.deps.url(key);
      bytes = url === null ? Promise.reject(new Error('not in the asset index')) : this.deps.fetch(url);
      this.fetching.set(key, bytes);
    }
    return bytes;
  }

  private fail(key: string, why: string): void {
    if (this.failed.has(key)) return;
    this.failed.add(key);
    this.deps.report(new Error(`sound ${key}: ${why}`));
  }
}

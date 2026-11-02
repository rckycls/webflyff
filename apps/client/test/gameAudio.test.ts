// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { WebAudio } from '@flyffweb/formats';
import { GameAudio } from '../src/audio/gameAudio';

/** An AudioParam's value. */
class Param { value = 1; setValueAtTime(v: number) { this.value = v; } }

class Node {
  connected: unknown[] = [];
  connect(to: unknown) { this.connected.push(to); return to; }
  disconnect() { this.connected = []; }
}

class Source extends Node {
  buffer: unknown = null;
  onended: (() => void) | null = null;
  started = false;
  start() { this.started = true; }
  stop() { this.onended?.(); }
}

class Panner extends Node {
  panningModel = ''; distanceModel = ''; refDistance = 0; rolloffFactor = 0; maxDistance = 0;
  positionX = new Param(); positionY = new Param(); positionZ = new Param();
}

/** Enough of an AudioContext for the players. */
class FakeContext {
  state: 'suspended' | 'running' = 'suspended';
  destination = new Node();
  sources: Source[] = [];
  gains: Array<Node & { gain: Param }> = [];
  panners: Panner[] = [];
  decoded = 0;
  suspends = 0;
  resumes = 0;
  elementSources = 0;
  createBufferSource() { const s = new Source(); this.sources.push(s); return s; }
  createGain() { const g = Object.assign(new Node(), { gain: new Param() }); this.gains.push(g); return g; }
  createPanner() { const p = new Panner(); this.panners.push(p); return p; }
  createMediaElementSource() { this.elementSources++; return new Node(); }
  async decodeAudioData(bytes: ArrayBuffer) { this.decoded++; return { bytes }; }
  async resume() { this.resumes++; this.state = 'running'; }
  async suspend() { this.suspends++; this.state = 'suspended'; }
}

/** Enough of an HTMLAudioElement: `play` resolves unless `refuse` is set; events are fired by hand. */
class FakeMedia {
  src = '';
  loop = false;
  currentTime = 0;
  volume = 1;
  preload = '';
  plays: string[] = [];
  pauses = 0;
  refuse: string | null = null;
  ogg = true;
  private listeners = new Map<string, Array<() => void>>();
  canPlayType(type: string) { return type.includes('ogg') ? (this.ogg ? 'probably' : '') : 'maybe'; }
  play() { this.plays.push(this.src); return this.refuse === null ? Promise.resolve() : Promise.reject(new DOMException('no', this.refuse)); }
  pause() { this.pauses++; }
  addEventListener(type: string, fn: () => void) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]); }
  removeEventListener() {}
  fire(type: string) { for (const fn of this.listeners.get(type) ?? []) fn(); }
}

const CATALOG: WebAudio = {
  sounds: Object.fromEntries(Array.from({ length: 70 }, (_, i) => [i + 1, `sound/s${i + 1}.wav`])),
  music: {
    1: { ogg: 'music/title.ogg', mp3: 'music/title.mp3' },
    2: { ogg: 'music/flaris.ogg', mp3: null },
  },
  worlds: {}, effects: {}, items: {}, skills: {}, movers: {}, npcMusic: {},
};

function setup(over: { media?: FakeMedia; storage?: Storage | null } = {}) {
  const context = new FakeContext();
  const media = over.media ?? new FakeMedia();
  const errors: string[] = [];
  const fetched: string[] = [];
  let clock = 0;
  const audio = new GameAudio({
    context: () => context as unknown as AudioContext,
    media: () => media as unknown as HTMLAudioElement,
    doc: document,
    storage: over.storage ?? null,
    report: (e) => errors.push(e.message),
    now: () => clock,
    fetch: async (url) => { fetched.push(url); return new ArrayBuffer(8); },
  });
  audio.setCatalog(CATALOG, { url: (key) => `/assets/${key}` });
  const tap = () => document.dispatchEvent(new Event('pointerdown'));
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return { audio, context, media, errors, fetched, tap, settle, tick: (ms: number) => { clock += ms; } };
}

let made: GameAudio[] = [];
afterEach(() => {
  for (const a of made) a.dispose();
  made = [];
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});
const keep = <T extends { audio: GameAudio }>(s: T): T => { made.push(s.audio); return s; };

describe('GameAudio: music before and after the first gesture', () => {
  it('keeps a track logically playing until the first tap, then starts only the current one', async () => {
    const { audio, media, tap } = keep(setup());
    audio.music.playFile('music/title.ogg', 0);
    audio.music.playFile('music/flaris.ogg', 1);
    expect(audio.music.isStopped()).toBe(false);
    expect(media.plays).toEqual([]);
    tap();
    expect(media.plays).toEqual(['/assets/music/flaris.ogg']);
    tap();
    expect(media.plays).toHaveLength(1);
  });

  it('a start the browser refuses keeps the track playing, and the next gesture tries again', async () => {
    const media = new FakeMedia();
    media.refuse = 'NotAllowedError';
    const { audio, tap, settle, errors } = keep(setup({ media }));
    tap();
    audio.music.playFile('music/title.ogg', 0);
    await settle();
    expect(audio.music.isStopped()).toBe(false);
    media.refuse = null;
    tap();
    expect(media.plays.at(-1)).toBe('/assets/music/title.ogg');
    expect(errors).toEqual([]);
  });

  it('routes the music through a gain node, which takes the BGM step', () => {
    const { audio, context, media, tap } = keep(setup());
    tap();
    expect(context.elementSources).toBe(1);
    expect(context.gains[0]!.gain.value).toBe(0.5);
    expect(media.volume).toBe(1); // not the step twice: on the element and on the node
    audio.setMusic(3);
    expect(context.gains[0]!.gain.value).toBeCloseTo(0.3, 6);
    expect(media.volume).toBe(1);
  });
});

describe('GameAudio: which file and what fails', () => {
  it('takes the MP3 where the browser plays no Ogg, and says once when there is none', async () => {
    const media = new FakeMedia();
    media.ogg = false;
    const { audio, tap, errors } = keep(setup({ media }));
    tap();
    audio.music.playFile('music/title.ogg', 0);
    expect(media.plays.at(-1)).toBe('/assets/music/title.mp3');
    audio.music.playFile('music/flaris.ogg', 1);
    audio.music.playFile('music/flaris.ogg', 1);
    expect(errors).toHaveLength(1);
    expect(audio.music.isStopped()).toBe(true);
    expect(media.plays).toHaveLength(1);
  });

  it('remembers a track that failed and never asks for it again', () => {
    const { audio, media, tap, errors } = keep(setup());
    tap();
    audio.music.playFile('music/flaris.ogg', 1);
    media.fire('error');
    expect(audio.music.isStopped()).toBe(true);
    audio.music.playFile('music/flaris.ogg', 1);
    audio.music.playFile('music/flaris.ogg', 1);
    expect(media.plays).toEqual(['/assets/music/flaris.ogg']);
    expect(errors).toHaveLength(1);
  });

  it('a track played once is stopped when it ends; a looping one is not', () => {
    const { audio, media, tap } = keep(setup());
    tap();
    audio.music.playFile('music/flaris.ogg', 1);
    expect(media.loop).toBe(false);
    media.fire('ended');
    expect(audio.music.isStopped()).toBe(true);
    audio.music.playFile('music/title.ogg', 0);
    expect(media.loop).toBe(true);
  });
});

describe('GameAudio: effects', () => {
  it('plays at most 10 copies of a file, and an 11th is dropped', async () => {
    const { audio, context, tap, settle } = keep(setup());
    tap();
    for (let i = 0; i < 11; i++) audio.play(1);
    await settle();
    expect(context.sources.filter((s) => s.started)).toHaveLength(10);
  });

  it('fetches a file once for two plays, and keeps at most 64 decoded files', async () => {
    const { audio, fetched, tap, settle } = keep(setup());
    tap();
    audio.play(1);
    audio.play(1);
    await settle();
    expect(fetched).toEqual(['/assets/sound/s1.wav']);
    for (let id = 2; id <= 65; id++) audio.play(id);
    await settle();
    audio.play(1); // the least recently used, evicted by the 65th
    await settle();
    expect(fetched.filter((u) => u === '/assets/sound/s1.wav')).toHaveLength(2);
  });

  it('fetches nothing for a sound more than 100 m away, or before the first gesture', async () => {
    const { audio, fetched, tap, settle } = keep(setup());
    audio.play(1);
    await settle();
    expect(fetched).toEqual([]);
    tap();
    audio.setListener({ x: 0, y: 0, z: 0 }, 0);
    audio.play(2, { x: 120, y: 0, z: 0 });
    await settle();
    expect(fetched).toEqual([]);
  });

  it('places a positioned sound with Neuz\'s distances', async () => {
    const { audio, context, tap, settle } = keep(setup());
    tap();
    audio.setListener({ x: 0, y: 0, z: 0 }, 0);
    audio.play(3, { x: 10, y: 0, z: 0 });
    await settle();
    const panner = context.panners[0]!;
    expect([panner.distanceModel, panner.refDistance, panner.rolloffFactor]).toEqual(['inverse', 4, 1]);
    expect([panner.positionX.value, panner.positionY.value, panner.positionZ.value]).toEqual([10, 0, -0]);
  });

  it('drops an effect whose file comes more than 500 ms after it was asked for', async () => {
    const { audio, context, tap, tick } = keep(setup());
    tap();
    audio.play(4);
    tick(600);
    await new Promise((r) => setTimeout(r, 0));
    expect(context.sources).toEqual([]);
  });

  it('plays nothing at the Sound Effect step 0, and keeps the steps', async () => {
    const storage = new Map<string, string>();
    const store = { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => { storage.set(k, v); } } as unknown as Storage;
    const { audio, context, tap, settle } = keep(setup({ storage: store }));
    tap();
    audio.setEffects(0);
    audio.play(5);
    await settle();
    expect(context.sources).toEqual([]);
    expect(JSON.parse(storage.get('flyffweb.sound')!)).toEqual({ effects: 0, music: 5 });
  });
});

describe('GameAudio: a hidden tab', () => {
  it('pauses everything, drops the effects asked for meanwhile, and resumes the current track', async () => {
    const { audio, context, media, tap, settle } = keep(setup());
    tap();
    audio.music.playFile('music/title.ogg', 0);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(context.suspends).toBe(1);
    expect(media.pauses).toBeGreaterThan(0);
    expect(audio.music.isStopped()).toBe(false);
    audio.play(6);
    await settle();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(context.sources).toEqual([]);
    expect(media.plays.at(-1)).toBe('/assets/music/title.ogg');
  });

  it('stopWorld ends the effects that play and stops the music', async () => {
    const { audio, context, tap, settle } = keep(setup());
    tap();
    audio.play(7);
    await settle();
    audio.music.playFile('music/flaris.ogg', 1);
    audio.stopWorld();
    expect(audio.music.isStopped()).toBe(true);
    audio.play(7);
    await settle();
    expect(context.sources.filter((s) => s.started)).toHaveLength(2); // its copy was released
  });
});

describe('GameAudio: the title track and where errors go', () => {
  it('plays the title track forever, once the catalog is in if it is not yet', () => {
    const { audio, media, tap } = keep(setup());
    tap();
    audio.title();
    expect(media.plays.at(-1)).toBe('/assets/music/title.ogg');
    expect(media.loop).toBe(true);
    audio.title(); // already playing: not restarted
    expect(media.plays).toHaveLength(1);
    audio.setCatalog(null, { url: () => null });
    audio.music.stop();
    audio.title();
    expect(media.plays).toHaveLength(1);
    audio.setCatalog(CATALOG, { url: (key) => `/assets/${key}` });
    expect(media.plays).toHaveLength(2);
  });

  it('a stopped world forgets a title that waited for the catalog', () => {
    const { audio, media, tap } = keep(setup());
    tap();
    audio.setCatalog(null, { url: () => null });
    audio.title();
    audio.stopWorld();
    audio.setCatalog(CATALOG, { url: (key) => `/assets/${key}` });
    expect(media.plays).toEqual([]);
  });

  it('says a failure where setReport says, from then on', () => {
    const { audio, media, tap, errors } = keep(setup());
    const world: string[] = [];
    audio.setReport((e) => world.push(e.message));
    tap();
    audio.music.playFile('music/flaris.ogg', 1);
    media.fire('error');
    expect(world).toHaveLength(1);
    expect(errors).toEqual([]);
  });
});

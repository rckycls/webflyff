// The page's audio (Piece 6 M2): one for the lobby and the world, made by main.ts. It holds the two players, the sound
// settings, the listener and the browser's rules (Piece 6 design §3.3):
//
// - audio starts with the first tap, click or key (MDN's autoplay rules); before it, effects are dropped and the music
//   waits (the plan's ruling 9). A refusal never blocks the game.
// - a hidden tab pauses both players; effects asked for meanwhile are dropped, and the current track resumes on return
//   (ruling 8).
// - `stopWorld` ends the world's sounds and its track, on travel and on leaving.
//
// The game never waits for it: every call returns at once, and a missing file is said once in the overlay.

import type { WebAudio } from '@flyffweb/formats';
import { EffectsPlayer } from './effectsPlayer';
import { MusicPlayer } from './musicPlayer';
import { BGM_TITLE } from './soundIds';
import { readSoundSettings, writeSoundSettings } from './soundSettings';
import type { SoundSettings } from './soundSettings';
import type { MusicPort } from '../world/sound/musicRules';
import { audible, effectsGain, musicGain, placeSound } from '../world/sound/soundRules';
import type { Vec } from '../world/sound/soundRules';

export interface GameAudioDeps {
  /** A new AudioContext, or null where there is none. Called once, on the first gesture. */
  context(): AudioContext | null;
  /** The <audio> element the music streams through. */
  media(): HTMLAudioElement;
  doc: Document;
  storage: Storage | null;
  report(error: Error): void;
  now?(): number;
  fetch?(url: string): Promise<ArrayBuffer>;
}

/** What the test hooks read: the effects asked for (that would play) and the tracks started, in order. */
export interface AudioPlayed {
  sounds: number[];
  music: string[];
}

const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'keydown', 'click'] as const;

export class GameAudio {
  readonly music: MusicPort;
  readonly played: AudioPlayed = { sounds: [], music: [] };
  private readonly player: MusicPlayer;
  private readonly effects: EffectsPlayer;
  private context: AudioContext | null = null;
  private unlocked = false;
  private hidden: boolean;
  private catalog: WebAudio | null = null;
  private url: (key: string) => string | null = () => null;
  private listener: Vec = { x: 0, y: 0, z: 0 };
  private angle = 0;
  private current: SoundSettings;
  /** `title()` came before the catalog: it plays when the catalog is in. */
  private titleWanted = false;
  private report: (error: Error) => void;
  private readonly onGesture = (): void => this.unlock();
  private readonly onVisibility = (): void => this.setHidden(this.deps.doc.visibilityState === 'hidden');

  constructor(private readonly deps: GameAudioDeps) {
    this.report = deps.report;
    this.current = readSoundSettings(deps.storage);
    this.hidden = deps.doc.visibilityState === 'hidden';
    const mp3s = new Map<string, string | null>();
    this.player = new MusicPlayer(deps.media(), {
      url: (key) => this.url(key),
      mp3Of: (ogg) => {
        if (mp3s.size === 0 && this.catalog !== null) for (const t of Object.values(this.catalog.music)) mp3s.set(t.ogg, t.mp3);
        return mp3s.has(ogg) ? mp3s.get(ogg)! : undefined;
      },
    }, (error) => this.report(error), (key) => this.played.music.push(key));
    this.player.setGain(musicGain(this.current.music));
    this.music = this.player;
    const fetchBytes = deps.fetch ?? (async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.arrayBuffer();
    });
    this.effects = new EffectsPlayer({
      url: (key) => this.url(key), fetch: fetchBytes, now: deps.now ?? (() => performance.now()), report: (error) => this.report(error),
    });
    for (const type of GESTURES) deps.doc.addEventListener(type, this.onGesture, { capture: true });
    deps.doc.addEventListener('visibilitychange', this.onVisibility);
  }

  /** The catalog and where its keys are, or null for silence. */
  setCatalog(audio: WebAudio | null, store: { url(key: string): string | null }): void {
    this.catalog = audio;
    this.url = (key) => store.url(key);
    if (this.titleWanted && audio !== null) this.title();
  }

  /** Where the players say what fails, from now on: the world's overlay while it is up. */
  setReport(report: (error: Error) => void): void {
    this.report = report;
  }

  /**
   * The title track, forever (`PlayMusic( BGM_TITLE, 0 )`, Neuz.cpp:1724, and on every logout, :1465-1471); when the
   * catalog is not in yet, as soon as it is.
   */
  title(): void {
    const track = this.catalog?.music[BGM_TITLE];
    this.titleWanted = track === undefined;
    if (track !== undefined) this.player.playFile(track.ogg, 0);
  }

  /** Fetches the files of these sound ids ahead of their first play (the plan's ruling 7). */
  prefetch(ids: readonly number[]): void {
    const sounds = this.catalog?.sounds;
    if (sounds === undefined) return;
    this.effects.prefetch(ids.map((id) => sounds[id]).filter((key): key is string => key !== undefined));
  }

  /** `PLAYSND( id, pos )`: an effect at a FlyFF position, or 2D (full volume, centred) without one. */
  play(id: number, at?: Vec): void {
    const key = this.catalog?.sounds[id];
    if (key !== undefined && this.playKey(key, at)) this.played.sounds.push(id);
  }

  /**
   * `PLAYSND( file, pos )` by the file's key (an effect's own sound, mdlDyna.inc), as `play` does by id. True when it
   * is to play: the settings, the tab, the first gesture and the distance let it.
   */
  playKey(key: string, at?: Vec): boolean {
    const gain = effectsGain(this.current.effects);
    if (gain === 0 || !this.unlocked || this.hidden || this.context === null) return false;
    let local: Vec | null = null;
    if (at !== undefined) {
      local = placeSound(at, this.listener, this.angle);
      if (local === null || !audible(local)) return false;
    }
    this.effects.play(this.context, key, local, gain, () => !this.hidden);
    return true;
  }

  /** `SetListener( pos, angle )` (WndWorld.cpp:8498): the own player's FlyFF position and the listener's angle. */
  setListener(pos: Vec, angleDeg: number): void {
    this.listener = { x: pos.x, y: pos.y, z: pos.z };
    this.angle = angleDeg;
  }

  /** Ends the world's sounds and stops its track (a world change, leaving). */
  stopWorld(): void {
    this.titleWanted = false;
    this.effects.stopAll();
    this.player.stop();
  }

  get settings(): SoundSettings {
    return { ...this.current };
  }

  setEffects(step: number): void {
    this.current = { ...this.current, effects: step };
    writeSoundSettings(this.deps.storage, this.current);
  }

  setMusic(step: number): void {
    this.current = { ...this.current, music: step };
    this.player.setGain(musicGain(step));
    writeSoundSettings(this.deps.storage, this.current);
  }

  dispose(): void {
    for (const type of GESTURES) this.deps.doc.removeEventListener(type, this.onGesture, { capture: true });
    this.deps.doc.removeEventListener('visibilitychange', this.onVisibility);
    this.effects.stopAll();
    this.player.dispose();
  }

  private unlock(): void {
    if (this.context === null && !this.unlocked) {
      try {
        this.context = this.deps.context();
      } catch {
        this.context = null;
      }
    }
    this.unlocked = true;
    if (this.context !== null && this.context.state !== 'running' && !this.hidden) void this.context.resume().catch(() => {});
    this.player.unlock(this.context);
  }

  private setHidden(hidden: boolean): void {
    if (hidden === this.hidden) return;
    this.hidden = hidden;
    if (this.context !== null) {
      if (hidden) void this.context.suspend().catch(() => {});
      else if (this.unlocked) void this.context.resume().catch(() => {});
    }
    this.player.setHidden(hidden);
  }
}

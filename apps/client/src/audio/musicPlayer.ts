// The music player: Music2.cpp's PlayMusic_ / StopMusic / IsStopMusic (Source/_Common/Music2.cpp:27-169) over one
// streamed <audio> element. docs/superpowers/specs/2026-11-02-piece6-m2-sound-research.md §3, §11.
//
// - A track already playing is not restarted (the key is compared, as the C++ compares file names); any other play
//   starts its file from the beginning. Loops 0 is forever, 1 once. There is no fade.
// - The element streams the file; once the page has had a gesture it is routed through a GainNode, the only volume iOS
//   lets a page set. Before the first gesture nothing is started: the track stays logically playing, and the gesture
//   starts the current one, from its start (the plan's ruling 9).
// - Ogg where the browser plays it, else the MP3 copy (Safari before 18.4).
// - A file that fails is said once and remembered, and never asked for again: Neuz would reopen it every frame
//   (ruling 5); the silence is the same.
// - A hidden tab pauses the element and keeps the track logically playing, so the rules do not restart it (ruling 8).

import type { MusicPort } from '../world/sound/musicRules';

type State = 'none' | 'playing' | 'ended' | 'stopped' | 'failed';

export interface MusicSource {
  /** The URL of an asset key, or null when the index has none. */
  url(key: string): string | null;
  /** The MP3 copy of a track's Ogg key: its key, null when there is none, undefined when the key is not a track. */
  mp3Of(oggKey: string): string | null | undefined;
}

export class MusicPlayer implements MusicPort {
  private state: State = 'none';
  private key: string | null = null;
  /** A start that waits for a gesture or the tab: the first gesture or the tab's return makes it. */
  private pending = false;
  private unlocked = false;
  private hidden = false;
  private gainNode: GainNode | null = null;
  private gain = 1;
  private readonly failed = new Set<string>();
  private readonly ogg: boolean;

  constructor(
    private readonly element: HTMLAudioElement,
    private source: MusicSource,
    private readonly report: (error: Error) => void,
    private readonly played: (key: string) => void = () => {},
  ) {
    element.preload = 'auto';
    this.ogg = element.canPlayType('audio/ogg; codecs="vorbis"') !== '';
    element.addEventListener('ended', () => {
      if (this.state === 'playing') this.state = 'ended';
    });
    element.addEventListener('error', () => {
      if (this.state === 'playing' && this.key !== null) this.fail(this.key, 'the file could not be played');
    });
  }

  setSource(source: MusicSource): void {
    this.source = source;
  }

  playFile(key: string, loops: number): void {
    if (key === this.key && this.state === 'playing') return;
    this.key = key;
    this.pending = false;
    if (this.failed.has(key)) {
      this.state = 'failed';
      return;
    }
    const mp3 = this.source.mp3Of(key);
    const chosen = this.ogg || mp3 === undefined ? key : mp3;
    if (chosen === null) {
      this.fail(key, 'this browser plays no Ogg, and there is no MP3 copy: run the converter with FFmpeg');
      return;
    }
    const url = this.source.url(chosen);
    if (url === null) {
      this.fail(key, 'not in the asset index');
      return;
    }
    this.element.loop = loops === 0;
    this.element.src = url;
    this.state = 'playing';
    this.played(key);
    this.start();
  }

  stop(): void {
    if (this.state === 'playing') this.element.pause();
    if (this.state !== 'failed') this.state = 'stopped';
    this.pending = false;
  }

  isStopped(): boolean {
    return this.state !== 'playing';
  }

  /** A gesture happened: the element is routed through `gain` (once) and a waiting track starts. */
  unlock(context: AudioContext | null): void {
    if (!this.unlocked) {
      this.unlocked = true;
      if (context !== null) {
        try {
          const node = context.createGain();
          node.gain.value = this.gain;
          context.createMediaElementSource(this.element).connect(node);
          node.connect(context.destination);
          this.gainNode = node;
          this.element.volume = 1; // the node has the volume now; the element's would apply on top
        } catch {
          // no Web Audio route: the element's own volume, which every browser but iOS's honours
        }
      }
      this.applyGain();
    }
    if (this.pending) {
      this.element.currentTime = 0;
      this.start();
    }
  }

  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    if (this.state !== 'playing') return;
    if (hidden) this.element.pause();
    else this.start();
  }

  setGain(gain: number): void {
    this.gain = gain;
    this.applyGain();
  }

  dispose(): void {
    this.element.pause();
    this.state = 'stopped';
  }

  private applyGain(): void {
    if (this.gainNode !== null) this.gainNode.gain.value = this.gain;
    else this.element.volume = this.gain;
  }

  private start(): void {
    if (!this.unlocked || this.hidden) {
      this.pending = true;
      return;
    }
    this.pending = false;
    const key = this.key;
    this.element.play().catch((error: unknown) => {
      // refused until another gesture: the track stays playing, waiting; an AbortError is a newer play's
      if (error instanceof DOMException && error.name === 'NotAllowedError' && this.key === key && this.state === 'playing') {
        this.pending = true;
      }
    });
  }

  private fail(key: string, why: string): void {
    this.state = 'failed';
    if (this.failed.has(key)) return;
    this.failed.add(key);
    this.report(new Error(`music ${key}: ${why}`));
  }
}

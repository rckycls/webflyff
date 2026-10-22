// The on-screen measurements every route shows (global constraints: fps, memory and errors are what the pass/fail
// targets are read from, and an error appears here rather than as a blank screen). `snapshot()` is the same data as
// numbers, for the Playwright tests and `window.__viewer.stats()`.

import { deviceLabel, storeDeviceLabel } from './device';

export interface OverlaySnapshot {
  /** Frames per second over the last 60 frames. */
  fps: number;
  /** Mean frame time over the last 60 frames. */
  frameMs: number;
  /** `performance.memory.usedJSHeapSize`; null where the browser has no such thing (Safari, Firefox). */
  jsHeapBytes: number | null;
  /** The estimate callers add up with `addGpuBytes`. */
  gpuBytes: number;
  tiles: number;
  models: number;
  textures: number;
  device: string;
  /** The latest errors, oldest first (at most 100). */
  errors: string[];
}

const FRAME_WINDOW = 60;
/** The text is rewritten about four times a second: often enough to read, rarely enough to cost nothing. */
const REDRAW_SECONDS = 0.25;
const MAX_ERRORS = 100;
const SHOWN_ERRORS = 5;

// The page reaches under the notch (viewport-fit=cover in index.html), and in landscape the notch of an iPhone or iPad
// is at the top left: the padding keeps the text clear of it by the safe-area insets (0 where there is no notch).
const BOX_STYLE =
  'position:fixed;top:0;left:0;z-index:1000;max-width:min(100vw,34rem);box-sizing:border-box;' +
  'padding:max(6px, env(safe-area-inset-top)) 8px 6px max(8px, env(safe-area-inset-left));' +
  'background:rgba(0,0,0,.65);color:#e6e6e6;pointer-events:none;';
const TEXT_STYLE = 'margin:0;font:11px/1.4 ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-word;';
const BUTTON_STYLE = 'pointer-events:auto;margin-top:4px;font:11px ui-monospace,Menlo,Consolas,monospace;';

function jsHeapBytes(): number | null {
  if (typeof performance === 'undefined') return null;
  const used = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize;
  return typeof used === 'number' ? used : null;
}

function megabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export class Overlay {
  private readonly frameTimes = new Float64Array(FRAME_WINDOW);
  private frameCount = 0;
  private nextFrame = 0;
  private sinceRedraw = 0;
  private counts = { tiles: 0, models: 0, textures: 0 };
  private gpuBytes = 0;
  private errors: string[] = [];
  private device = deviceLabel();
  private readonly text: HTMLElement;

  constructor(root: HTMLElement) {
    const doc = root.ownerDocument;
    const box = doc.createElement('div');
    box.id = 'overlay';
    box.style.cssText = BOX_STYLE;
    this.text = doc.createElement('pre');
    this.text.style.cssText = TEXT_STYLE;
    const button = doc.createElement('button');
    button.textContent = 'set device name';
    button.style.cssText = BUTTON_STYLE;
    button.addEventListener('click', () => this.askDeviceName());
    box.append(this.text, button);
    root.append(box);
    this.redraw();
  }

  /** Call once per rendered frame with the time since the previous one, in seconds. Zero, negative or NaN is ignored. */
  frame(dt: number): void {
    if (!(dt > 0) || !Number.isFinite(dt)) return;
    this.frameTimes[this.nextFrame] = dt;
    this.nextFrame = (this.nextFrame + 1) % FRAME_WINDOW;
    this.frameCount = Math.min(this.frameCount + 1, FRAME_WINDOW);
    this.sinceRedraw += dt;
    if (this.sinceRedraw >= REDRAW_SECONDS) this.redraw();
  }

  setCounts(c: { tiles: number; models: number; textures: number }): void {
    this.counts = { tiles: c.tiles, models: c.models, textures: c.textures };
  }

  /** Adds to the GPU estimate; a negative number takes bytes back when something is disposed. */
  addGpuBytes(n: number): void {
    this.gpuBytes += n;
  }

  error(msg: string): void {
    this.errors.push(msg);
    if (this.errors.length > MAX_ERRORS) this.errors.splice(0, this.errors.length - MAX_ERRORS);
    this.redraw();
  }

  snapshot(): OverlaySnapshot {
    let total = 0;
    for (let i = 0; i < this.frameCount; i++) total += this.frameTimes[i]!;
    return {
      fps: total > 0 ? this.frameCount / total : 0,
      frameMs: this.frameCount > 0 ? (total / this.frameCount) * 1000 : 0,
      jsHeapBytes: jsHeapBytes(),
      gpuBytes: this.gpuBytes,
      ...this.counts,
      device: this.device,
      errors: [...this.errors],
    };
  }

  private askDeviceName(): void {
    if (typeof prompt !== 'function') return;
    const answer = prompt('Name this device (kept in this browser; empty goes back to the user agent):', this.device);
    if (answer === null) return;
    storeDeviceLabel(answer);
    this.device = deviceLabel();
    this.redraw();
  }

  private redraw(): void {
    this.sinceRedraw = 0;
    const s = this.snapshot();
    const lines = [
      `fps ${s.fps.toFixed(1)}   frame ${s.frameMs.toFixed(1)} ms`,
      `heap ${s.jsHeapBytes === null ? 'n/a' : megabytes(s.jsHeapBytes)}   gpu (est) ${megabytes(s.gpuBytes)}`,
      `tiles ${s.tiles}   models ${s.models}   textures ${s.textures}`,
      `device: ${s.device}`,
    ];
    if (s.errors.length > 0) {
      lines.push(`errors: ${s.errors.length}`);
      for (const message of s.errors.slice(-SHOWN_ERRORS)) lines.push(`! ${message}`);
    }
    this.text.textContent = lines.join('\n');
  }
}

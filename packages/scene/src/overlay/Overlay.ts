// The on-screen measurements every route shows (global constraints: fps, memory and errors are what the pass/fail
// targets are read from, and an error appears here rather than as a blank screen). `snapshot()` is the same data as
// numbers, for the Playwright tests and `window.__viewer.stats()`.

import { deviceLabel, storeDeviceLabel } from './device';

export interface OverlaySnapshot {
  /** Frames per second over the last 60 frames. */
  fps: number;
  /** Mean frame time over the last 60 frames. */
  frameMs: number;
  /**
   * The mean of the frame's own work over the last 60 times the caller gave it (`addWork`), in ms: the page's script
   * time for the frame, draw submission included. A frame time well over it is the GPU's (or the browser's). Null (and
   * no `cpu` on the fps line) until it gives one, as in the viewer, which does not.
   */
  cpuMs: number | null;
  /** `performance.memory.usedJSHeapSize`; null where the browser has no such thing (Safari, Firefox). */
  jsHeapBytes: number | null;
  /** The estimate callers add up with `addGpuBytes`. */
  gpuBytes: number;
  tiles: number;
  models: number;
  textures: number;
  /**
   * The world frame's draw calls and triangles (`renderer.info.render` right after its render), as the caller gives them;
   * null (and no line) until it gives them, as in the viewer, which does not.
   */
  drawCalls: number | null;
  triangles: number | null;
  device: string;
  /** The latest errors, oldest first (at most 100). */
  errors: string[];
}

/** What the game client counts of the world server's bundles, for the overlay's line about them. */
export interface MessageCounts {
  bundles: number;
  /** The bundles that had a table of contents. */
  indexed: number;
  skipped: number;
  mismatched: number;
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
  private readonly workTimes = new Float64Array(FRAME_WINDOW);
  private workCount = 0;
  private nextWork = 0;
  private sinceRedraw = 0;
  private counts = { tiles: 0, models: 0, textures: 0 };
  /** The world frame's draw calls and triangles; null (no line) until the caller gives them. */
  private renderCounts: { drawCalls: number; triangles: number } | null = null;
  /** The game client's bundles and the messages in them it could not read; null (no line) until it says. */
  private messageCounts: MessageCounts | null = null;
  private gpuBytes = 0;
  private errors: string[] = [];
  private device = deviceLabel();
  private readonly text: HTMLElement;
  private readonly deviceButton: HTMLButtonElement;
  private readonly toggle: HTMLButtonElement;
  private compact = false;
  private expanded = true;

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
    this.deviceButton = button;
    this.toggle = doc.createElement('button');
    this.toggle.style.cssText = BUTTON_STYLE;
    this.toggle.textContent = 'Stats';
    this.toggle.hidden = true;
    this.toggle.addEventListener('click', () => this.togglePanel());
    box.append(this.text, button, this.toggle);
    root.append(box);
    this.redraw();
  }

  setCompact(compact: boolean): void {
    if (this.compact === compact) return;
    this.compact = compact;
    this.expanded = !compact;
    this.fold();
  }

  /** Lets the client's mobile shortcuts open the same diagnostics panel. */
  togglePanel(): boolean {
    this.expanded = !this.expanded;
    this.fold();
    return this.expanded;
  }

  private fold(): void {
    this.text.hidden = this.compact && !this.expanded;
    this.deviceButton.hidden = this.text.hidden;
    this.toggle.hidden = !this.compact;
    this.toggle.ariaExpanded = String(this.expanded);
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

  /** Call once per frame with the time the frame's own work took, in ms. Negative or NaN is ignored. */
  addWork(ms: number): void {
    if (!(ms >= 0) || !Number.isFinite(ms)) return;
    this.workTimes[this.nextWork] = ms;
    this.nextWork = (this.nextWork + 1) % FRAME_WINDOW;
    this.workCount = Math.min(this.workCount + 1, FRAME_WINDOW);
  }

  setCounts(c: { tiles: number; models: number; textures: number }): void {
    this.counts = { tiles: c.tiles, models: c.models, textures: c.textures };
  }

  /** The draw calls and triangles of the frame's main render, read by the caller from `renderer.info.render` after it. */
  setRenderCounts(c: { drawCalls: number; triangles: number }): void {
    this.renderCounts = { drawCalls: c.drawCalls, triangles: c.triangles };
  }

  /**
   * The world's bundles, those of them with a table of contents (fewer than the bundles: the old world server), and their
   * messages that were skipped (of a type nothing reads) or did not end where the table says (spec §4): a line of their
   * own, from the first call on.
   */
  setMessageCounts(c: MessageCounts): void {
    this.messageCounts = { bundles: c.bundles, indexed: c.indexed, skipped: c.skipped, mismatched: c.mismatched };
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
    let work = 0;
    for (let i = 0; i < this.workCount; i++) work += this.workTimes[i]!;
    return {
      fps: total > 0 ? this.frameCount / total : 0,
      frameMs: this.frameCount > 0 ? (total / this.frameCount) * 1000 : 0,
      cpuMs: this.workCount > 0 ? work / this.workCount : null,
      jsHeapBytes: jsHeapBytes(),
      gpuBytes: this.gpuBytes,
      ...this.counts,
      drawCalls: this.renderCounts?.drawCalls ?? null,
      triangles: this.renderCounts?.triangles ?? null,
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
    this.toggle.textContent = s.errors.length > 0 ? `Stats (${s.errors.length} errors)` : 'Stats';
    const lines = [
      // the cpu part keeps the line shorter than the device line, so the box (the pictures' mask) keeps its size
      `fps ${s.fps.toFixed(1)}   frame ${s.frameMs.toFixed(1)} ms${s.cpuMs === null ? '' : `   cpu ${s.cpuMs.toFixed(1)} ms`}`,
      `heap ${s.jsHeapBytes === null ? 'n/a' : megabytes(s.jsHeapBytes)}   gpu (est) ${megabytes(s.gpuBytes)}`,
      `tiles ${s.tiles}   models ${s.models}   textures ${s.textures}`,
      `device: ${s.device}`,
    ];
    const r = this.renderCounts;
    if (r !== null) lines.splice(3, 0, `draws ${r.drawCalls}   triangles ${r.triangles.toLocaleString('en-US')}`);
    const m = this.messageCounts;
    if (m !== null) {
      lines.push(`bundles ${m.bundles}   indexed ${m.indexed}   messages skipped ${m.skipped}   mismatched ${m.mismatched}`);
    }
    if (s.errors.length > 0) {
      lines.push(`errors: ${s.errors.length}`);
      for (const message of s.errors.slice(-SHOWN_ERRORS)) lines.push(`! ${message}`);
    }
    this.text.textContent = lines.join('\n');
  }
}

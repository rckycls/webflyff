/**
 * custom (owner 2026-11-15): Auto Play keeps the screen on while the farm bot runs (`navigator.wakeLock`, the Screen Wake
 * Lock API: iOS Safari 16.4+, Chrome, Edge; home-screen web apps on iOS from 18.4). The browser lets go of the lock while
 * the page is hidden, so it is asked for again when the page is seen again. A browser without it, or one that refuses,
 * changes nothing. A locked phone stops the page whatever this does (docs/superpowers/2026-11-15-farm-bot-research.md, 6).
 */

interface WakeLockSentinelLike { release(): Promise<void> }
interface NavigatorLike { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } }
type DocLike = Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;

export class ScreenAwake {
  private held = false;
  private sentinel: WakeLockSentinelLike | null = null;
  private readonly onVisible = (): void => {
    if (this.held && this.doc.visibilityState === 'visible') this.ask();
  };

  constructor(private readonly nav: NavigatorLike, private readonly doc: DocLike) {}

  /** Keeps the screen on until `release` (asked again each time the page is seen again). */
  hold(): void {
    if (this.held) return;
    this.held = true;
    this.doc.addEventListener('visibilitychange', this.onVisible);
    this.ask();
  }

  release(): void {
    if (!this.held) return;
    this.held = false;
    this.doc.removeEventListener('visibilitychange', this.onVisible);
    const sentinel = this.sentinel;
    this.sentinel = null;
    sentinel?.release().catch(() => {});
  }

  private ask(): void {
    const lock = this.nav.wakeLock;
    if (lock === undefined) return;
    lock.request('screen').then((sentinel) => {
      if (this.held) this.sentinel = sentinel;
      else sentinel.release().catch(() => {});
    }, () => {});
  }
}

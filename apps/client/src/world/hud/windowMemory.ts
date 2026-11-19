// Neuz's regInfo.dat (2026-11-20, mouse-drag-ui): the windows' places kept from one time to the next.
//
//   CWndMgr::DestroyApplet / PutRegInfo  _Interface/WndManager.cpp:1981-1986   an applet window keeps its rect as it goes
//   CWndMgr::CreateApplet                WndManager.cpp:2514-2543             it opens there again: a WBS_THICKFRAME window
//                                                                             at its kept size too, any other at its own
//   CWndMgr::SaveRegInfo / LoadRegInfo   WndManager.cpp:7220-7294             kept with the resolution; read only when the
//                                                                             resolution is the same; top and left at least 0
//
// Here each remembered window (`WindowFrame.rememberAs`) keeps its place, and its size when its edges drag, in the browser's
// storage under its key with the screen size it was kept at; it goes back there only on a screen of that size. The storage
// may be blocked (a private window, site data off): then nothing is kept and the windows open where they always did.

/** The storage key of the kept places. */
export const WINDOW_RECTS_KEY = 'flyffweb.windowRects';

/** A window's kept place: the screen size it was kept at, its top left, and its size when its edges drag. */
export interface KeptRect {
  screen: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
}

export class WindowMemory {
  constructor(private readonly storage: Storage | null, private readonly screen: () => string) {}

  private all(): Record<string, KeptRect> {
    try {
      const text = this.storage?.getItem(WINDOW_RECTS_KEY);
      const parsed: unknown = text ? JSON.parse(text) : {};
      return parsed !== null && typeof parsed === 'object' ? parsed as Record<string, KeptRect> : {};
    } catch {
      return {};
    }
  }

  /** The place `key` was kept at on a screen of this size, top and left at least 0 (LoadRegInfo, :7270-7276); else null. */
  load(key: string): KeptRect | null {
    const kept = this.all()[key];
    if (kept === undefined || kept.screen !== this.screen() || !Number.isFinite(kept.x) || !Number.isFinite(kept.y)) return null;
    return { ...kept, x: Math.max(0, kept.x), y: Math.max(0, kept.y) };
  }

  /** Keeps `key`'s place with this screen's size (PutRegInfo). */
  save(key: string, rect: Omit<KeptRect, 'screen'>): void {
    try {
      if (this.storage === null) return;
      const all = this.all();
      all[key] = { screen: this.screen(), ...rect };
      this.storage.setItem(WINDOW_RECTS_KEY, JSON.stringify(all));
    } catch {
      // full or blocked: the place is not kept
    }
  }
}

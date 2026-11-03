import type { WorldManifest } from '@flyffweb/formats';
import type { Vec3 } from '@flyffweb/protocol';
import type { UiArt } from './art';
import { themeUrl } from './art';
import { pictureButton } from './button';
import { WindowFrame } from './frame';

export type NavigatorKind = 'player' | 'party' | 'npc' | 'monster';
export interface NavigatorMarker { id: number; kind: NavigatorKind; name: string; pos: Vec3 }
const WIDTH = 132, HEIGHT = 128;
/** CWndNavigator::OnEraseBkgnd: native positive-z north, with the own player at the center. */
export function navigatorPoint(pos: Vec3, center: Vec3, zoom: number, tileMeters: number): { x: number; y: number } {
  return pointInto({ x: 0, y: 0 }, pos, center, zoom, tileMeters);
}
/** `navigatorPoint` into `out`. */
function pointInto(out: { x: number; y: number }, pos: Vec3, center: Vec3, zoom: number, tileMeters: number): { x: number; y: number } {
  out.x = WIDTH / 2 + (pos[0] - center[0]) * zoom / tileMeters;
  out.y = HEIGHT / 2 - (pos[2] - center[2]) * zoom / tileMeters;
  return out;
}

/** APP_NAVIGATOR: resdata.inc:18741; WndField.cpp:9191-10230. Native art and per-landscape DDS tiles. */
export class Minimap {
  readonly frame: WindowFrame;
  private readonly map: HTMLElement;
  private readonly images = new Map<string, HTMLImageElement>();
  private readonly dots = new Map<number, HTMLElement>();
  private readonly arrow: HTMLElement;
  private readonly filterButton: HTMLButtonElement;
  private readonly filterMenu: HTMLElement;
  private readonly filters = new Set<NavigatorKind>(['player', 'party', 'npc', 'monster']);
  private zoomNow = 256;
  private center: Vec3 | undefined;
  private navigation: { pos: Vec3; expires: number } | undefined;
  private readonly destination: HTMLElement;
  // `update` runs every frame: it keeps what it last wrote and writes an element only when that changes, and makes no
  // set, key or point of its own each time (Piece 6 M5, part B: it allocated 0.4 MB/s standing still)
  private readonly visible = new Set<string>();
  private readonly shown = new Set<number>();
  private readonly point = { x: 0, y: 0 };
  /** A tile's key and its picture's URL, by `tz * width + tx`. */
  private readonly tileSources = new Map<number, { key: string; src: string | null }>();
  /** What an image or a marker was last placed with: left, top and size (an image) or sprite (a marker). */
  private readonly placedAt = new WeakMap<HTMLElement, [number, number, number]>();
  private heading = NaN;
  constructor(private readonly art: UiArt, private readonly manifest: WorldManifest, private readonly folder: string,
    private readonly url: (key: string) => string | null, private readonly doc: Document = document) {
    this.frame = new WindowFrame('Navigator', art, { width: 144, height: 160, mobileScale: 0.85 }, doc);
    this.frame.element.classList.add('hud-navigator'); this.frame.escapeCloses = false;
    this.map = doc.createElement('div'); this.map.className = 'navigator-map';
    this.map.setAttribute('aria-label', 'Local map');
    this.map.style.backgroundImage = themeUrl(art, 'NavDunFog.tga');
    this.arrow = doc.createElement('span'); this.arrow.className = 'navigator-player'; this.arrow.setAttribute('aria-label', 'Your position and viewing direction');
    this.arrow.style.backgroundImage = themeUrl(art, 'ImgNavArrow.bmp');
    this.destination = doc.createElement('span'); this.destination.className = 'navigator-destination'; this.destination.hidden = true;
    this.destination.style.backgroundImage = themeUrl(art, 'ImgNavPos.tga');
    this.filterMenu = doc.createElement('div'); this.filterMenu.className = 'navigator-filters'; this.filterMenu.hidden = true;
    for (const [kind, label] of [['player', 'Player'], ['party', 'Party'], ['npc', 'NPC'], ['monster', 'Monster']] as const) {
      const button = doc.createElement('button'); button.type = 'button'; button.textContent = label; button.dataset.filter = kind;
      button.setAttribute('aria-pressed', 'true');
      button.addEventListener('click', () => {
        if (this.filters.has(kind)) this.filters.delete(kind); else this.filters.add(kind);
        button.setAttribute('aria-pressed', String(this.filters.has(kind)));
      }); this.filterMenu.append(button);
    }
    const control = (name: string, label: string, texture: string, top: number, press: () => void) => {
      const button = pictureButton(doc, art, texture, { left: 0, top, width: 12, height: 12 }, 12, press);
      button.dataset.nav = name; button.setAttribute('aria-label', label); button.title = label;
      this.frame.body.append(button); return button;
    };
    this.frame.body.append(this.map);
    this.filterButton = control('filter', 'Navigator filters', 'ButtNavLeft.tga', 1, () => { this.filterMenu.hidden = !this.filterMenu.hidden; });
    this.filterButton.disabled = manifest.indoor === true;
    control('zoom-in', 'Zoom in', 'ButtNavZoomIn.tga', 54, () => { this.zoomNow = Math.min(352, this.zoomNow + 32); });
    control('zoom-out', 'Zoom out', 'ButtNavZoomOut.tga', 70, () => { this.zoomNow = Math.max(128, this.zoomNow - 32); });
    this.frame.body.append(this.filterMenu);
    this.map.append(this.destination, this.arrow);
    this.frame.body.addEventListener('pointerdown', event => event.stopPropagation());
    this.map.addEventListener('click', event => {
      if (this.center === undefined) return;
      const rect = this.map.getBoundingClientRect(), scale = rect.width / WIDTH;
      const units = manifest.mapSize * manifest.mpu / this.zoom;
      const x = this.center[0] + ((event.clientX - rect.left) / scale - WIDTH / 2) * units;
      const z = this.center[2] - ((event.clientY - rect.top) / scale - HEIGHT / 2) * units;
      if (x < 0 || z < 0 || x >= manifest.size[0] * manifest.mapSize * manifest.mpu || z >= manifest.size[1] * manifest.mapSize * manifest.mpu) return;
      this.navigation = { pos: [x, this.center[1], z], expires: performance.now() + 200 * 1000 / 60 };
    });
  }
  get zoom(): number { return this.zoomNow; }
  open(): void { this.frame.open({ x: this.frame.element.parentElement?.clientWidth ?? 0, y: 0 }); }
  toggle(): void { if (this.frame.isOpen) this.frame.close(); else this.open(); }
  update(center: Vec3, heading: number, markers: readonly NavigatorMarker[]): void {
    if (!this.frame.isOpen || !center.every(Number.isFinite)) return;
    this.center = center;
    const meters = this.manifest.mapSize * this.manifest.mpu, ratio = this.zoom / meters;
    const visible = this.visible; visible.clear();
    if (!this.manifest.indoor) {
      const cx = Math.floor(center[0] / meters), cz = Math.floor(center[2] / meters);
      for (let tx = cx - 1; tx <= cx + 1; tx++) for (let tz = cz - 1; tz <= cz + 1; tz++) {
        if (tx < 0 || tz < 0 || tx >= this.manifest.size[0] || tz >= this.manifest.size[1]) continue;
        const { key, src } = this.tileSource(tx, tz);
        if (src === null) continue;
        visible.add(key); let image = this.images.get(key);
        if (image === undefined) {
          image = this.doc.createElement('img'); image.src = src; image.alt = ''; image.draggable = false;
          this.images.set(key, image); this.map.prepend(image);
        }
        const left = WIDTH / 2 + (tx * meters - center[0]) * ratio, top = HEIGHT / 2 - ((tz + 1) * meters - center[2]) * ratio;
        if (this.moved(image, left, top, this.zoom)) {
          image.style.cssText = `left:${left}px;top:${top}px;width:${this.zoom}px;height:${this.zoom}px`;
        }
      }
    }
    // forEach, not for...of: no [key, value] pair a frame per image and marker
    this.images.forEach((image, key) => { if (!visible.has(key)) { image.remove(); this.images.delete(key); } });
    const shown = this.shown; shown.clear();
    if (!this.manifest.indoor) for (const marker of markers) {
      if (!this.filters.has(marker.kind)) continue;
      const point = pointInto(this.point, marker.pos, center, this.zoom, meters);
      if (!Number.isFinite(point.x + point.y) || point.x < 2 || point.y < 2 || point.x > WIDTH - 2 || point.y > HEIGHT - 2) continue;
      shown.add(marker.id); let dot = this.dots.get(marker.id);
      if (dot === undefined) {
        dot = this.doc.createElement('span'); dot.className = 'navigator-marker'; dot.dataset.marker = String(marker.id);
        dot.style.backgroundImage = themeUrl(this.art, 'ImgNavObj.bmp'); this.map.append(dot); this.dots.set(marker.id, dot);
      }
      const sprite = marker.kind === 'npc' ? 1 : marker.kind === 'monster' ? 2 : marker.kind === 'party' ? 4 : 0;
      if (dot.title !== marker.name) dot.title = marker.name;
      if (dot.dataset.kind !== marker.kind) dot.dataset.kind = marker.kind;
      if (this.moved(dot, point.x, point.y, sprite)) {
        dot.style.left = `${point.x - 2}px`; dot.style.top = `${point.y - 2}px`;
        dot.style.backgroundPosition = `${-(sprite % 4) * 5}px ${-Math.floor(sprite / 4) * 5}px`;
      }
    }
    this.dots.forEach((dot, id) => { if (!shown.has(id)) { dot.remove(); this.dots.delete(id); } });
    if (heading !== this.heading) {
      this.heading = heading;
      this.arrow.style.transform = `translate(-50%, -50%) rotate(${heading * 180 / Math.PI}deg)`;
    }
    this.destination.hidden = this.navigation === undefined || this.navigation.expires <= performance.now();
    if (!this.destination.hidden) {
      const point = pointInto(this.point, this.navigation!.pos, center, this.zoom, meters);
      this.destination.style.left = `${point.x}px`; this.destination.style.top = `${point.y}px`;
      this.destination.style.backgroundPosition = `${-(Math.floor(performance.now() / 120) % 4) * 16}px 0`;
    }
  }
  /** Tile (tx, tz)'s key and picture URL, made once. */
  private tileSource(tx: number, tz: number): { key: string; src: string | null } {
    const index = tz * this.manifest.size[0] + tx;
    let source = this.tileSources.get(index);
    if (source === undefined) {
      const key = `${tx}_${tz}`;
      source = { key, src: this.url(`minimaps/${this.folder}/${key}.png`) };
      this.tileSources.set(index, source);
    }
    return source;
  }
  /** Whether `element` was last placed elsewhere (or never); keeps (a, b, c) as where it is now. */
  private moved(element: HTMLElement, a: number, b: number, c: number): boolean {
    const at = this.placedAt.get(element);
    if (at !== undefined && at[0] === a && at[1] === b && at[2] === c) return false;
    if (at === undefined) this.placedAt.set(element, [a, b, c]); else { at[0] = a; at[1] = b; at[2] = c; }
    return true;
  }
  dispose(): void { this.frame.close(); this.frame.element.remove(); this.images.clear(); this.dots.clear(); }
}

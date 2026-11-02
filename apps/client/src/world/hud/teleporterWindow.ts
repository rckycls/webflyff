import type { WebNpc } from '@flyffweb/formats';
import type { UiArt } from './art';
import { themeUrl } from './art';
import { WindowFrame } from './frame';

/** CWorldMap::WorldPosToMapPos map 0 (WorldMap.cpp:1359): the actual bounds of WORLD_Flyff.dds. */
export function teleportPoint(pos: { x: number; z: number }): { x: number; y: number } {
  return { x: pos.x / 11800 * 788, y: (9757 - pos.z) / (9757 - 1298) * 591 };
}

/** NPC-only teleport selection; native map art/markers and SendTeleporterReq indexes, without a general world map. */
export class TeleporterWindow {
  readonly frame: WindowFrame;
  private id: number | null = null;
  constructor(private readonly art: UiArt, private readonly valid: (id: number) => boolean,
    private readonly send: (key: string, index: number) => void, private readonly doc: Document = document) {
    this.frame = new WindowFrame('Teleporter', art, { width: 800, height: 624, mobileScale: 1, fitWhole: true }, doc);
    this.frame.element.classList.add('hud-teleporter');
    this.frame.onClose = () => { this.id = null; };
  }
  open(id: number, npc: WebNpc): void {
    if (!this.valid(id) || !npc.menus?.includes(146) || !npc.teleports?.length) return;
    this.id = id;
    const map = this.doc.createElement('div'); map.className = 'teleporter-map';
    map.style.backgroundImage = themeUrl(this.art, 'WORLD_Flyff.dds');
    npc.teleports.forEach((destination, index) => {
      const point = teleportPoint(destination);
      if (!Number.isFinite(point.x + point.y) || point.x < 0 || point.y < 0 || point.x > 788 || point.y > 591) return;
      const button = this.doc.createElement('button'); button.type = 'button'; button.dataset.destination = String(index);
      button.setAttribute('aria-label', `Teleport destination ${index + 1}`);
      button.style.left = `${point.x}px`; button.style.top = `${point.y}px`;
      button.style.backgroundImage = themeUrl(this.art, 'ButtTeleport.bmp');
      button.addEventListener('click', () => {
        if (!this.update()) return;
        this.send(npc.key, index); this.frame.close();
      });
      map.append(button);
    });
    this.frame.body.replaceChildren(map); this.frame.open('center');
  }
  update(): boolean {
    if (this.id === null || !this.frame.isOpen) return false;
    if (!this.valid(this.id)) { this.frame.close(); return false; }
    return true;
  }
  dispose(): void { this.frame.close(); this.frame.element.remove(); }
}

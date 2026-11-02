import type { GroundItem } from '@flyffweb/protocol';
import type { Camera } from 'three';
import { Vector3 } from 'three';
import { toWebPosition } from '@flyffweb/formats';
import type { GameData } from '../gameData';
import type { UiArt } from '../hud/art';

/** Screen-space item icons remain anchored to their world positions and disappear on DEL_OBJ. */
export class GroundItems {
  readonly element: HTMLElement;
  private readonly buttons = new Map<number, HTMLButtonElement>();
  constructor(private readonly data: GameData, private readonly art: UiArt, private readonly pick: (id: number) => void,
    private readonly doc: Document = document) {
    this.element = doc.createElement('div'); this.element.className = 'world-ground-items';
  }
  update(items: ReadonlyMap<number, GroundItem>, camera: Camera): void {
    for (const [id, button] of this.buttons) if (!items.has(id)) { button.remove(); this.buttons.delete(id); }
    for (const [id, drop] of items) {
      let button = this.buttons.get(id);
      if (!button) {
        const prop = this.data.itemProps.get(drop.item.itemId);
        button = this.doc.createElement('button'); button.type = 'button'; button.dataset.groundItem = String(id);
        button.title = `${prop?.name ?? 'Item'} ×${drop.item.count}`; button.setAttribute('aria-label', `Pick up ${button.title}`);
        if (prop?.icon) { const img = this.doc.createElement('img'); img.src = this.art.url(prop.icon); img.alt = ''; button.append(img); }
        else button.textContent = '◆';
        let touch: { id: number; x: number; y: number } | null = null, suppressClick = false;
        button.addEventListener('pointerdown', (event) => {
          if (event.pointerType !== 'touch') return;
          touch = { id: event.pointerId, x: event.clientX, y: event.clientY };
          button!.setPointerCapture?.(event.pointerId);
        });
        button.addEventListener('pointerup', (event) => {
          if (touch?.id !== event.pointerId) return;
          suppressClick = true;
          if (Math.hypot(event.clientX - touch.x, event.clientY - touch.y) < 8) this.pick(id);
          touch = null;
        });
        button.addEventListener('pointercancel', () => { touch = null; });
        button.addEventListener('click', () => {
          if (suppressClick) { suppressClick = false; return; } this.pick(id);
        });
        this.buttons.set(id, button); this.element.append(button);
      }
      const pos = new Vector3(...toWebPosition(drop.pos)); pos.y += 0.25;
      const distance = pos.distanceTo(camera.position);
      const near = distance < 40;
      // Perspective-like apparent size, separate from the invisible touch target.
      const size = Math.max(8, Math.min(28, 128 / Math.max(1, distance)));
      button.style.setProperty('--drop-icon-size', `${size}px`);
      pos.project(camera);
      button.hidden = !near || pos.z < -1 || pos.z > 1 || Math.abs(pos.x) > 1 || Math.abs(pos.y) > 1;
      button.style.left = `${(pos.x + 1) * 50}%`; button.style.top = `${(1 - pos.y) * 50}%`;
    }
  }
  dispose(): void { this.buttons.clear(); this.element.remove(); }
}

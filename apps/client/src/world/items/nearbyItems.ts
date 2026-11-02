import type { GroundItem, Vec3 } from '@flyffweb/protocol';
import type { GameData } from '../gameData';
import type { UiArt } from '../hud/art';

export const PICKUP_LIST_RANGE = 5;

/** A stable row per drop: movement updates distances without replacing the button under a pressed finger. */
export class NearbyItems {
  readonly element: HTMLElement;
  private readonly list: HTMLElement;
  private readonly rows = new Map<number, { button: HTMLButtonElement; text: HTMLElement; icon: HTMLImageElement }>();
  constructor(private readonly data: Pick<GameData, 'itemProps'>, private readonly art: UiArt,
    private readonly pick: (id: number) => void, private readonly doc: Document = document, pickAll?: () => void) {
    this.element = doc.createElement('section'); this.element.className = 'hud-nearby-items'; this.element.hidden = true;
    this.element.setAttribute('aria-label', 'Nearby items');
    const title = doc.createElement('strong'); title.textContent = 'Nearby items · 5m';
    this.list = doc.createElement('div'); this.list.className = 'nearby-items-list';
    this.element.append(title, this.list);
    if (pickAll) {
      const all = doc.createElement('button'); all.type = 'button'; all.className = 'nearby-pickup-all';
      all.textContent = 'Pick up all'; all.setAttribute('aria-label', 'Pick up nearby items');
      all.addEventListener('click', () => { pickAll(); all.blur(); }); this.element.append(all);
    }
  }
  update(items: ReadonlyMap<number, GroundItem>, pos: Vec3 | null): void {
    const visible = new Set<number>();
    if (pos) for (const [id, drop] of items) {
      const distance = Math.hypot(drop.pos[0] - pos[0], drop.pos[1] - pos[1], drop.pos[2] - pos[2]);
      const prop = this.data.itemProps.get(drop.item.itemId);
      if (distance > PICKUP_LIST_RANGE || !Number.isFinite(distance) || !prop || drop.item.count <= 0) continue;
      visible.add(id);
      let row = this.rows.get(id);
      if (!row) {
        const button = this.doc.createElement('button'); button.type = 'button'; button.dataset.pickupItem = String(id);
        const icon = this.doc.createElement('img'); icon.alt = '';
        const text = this.doc.createElement('span'); button.append(icon, text);
        let suppressClick = false;
        button.addEventListener('pointerdown', (event) => {
          suppressClick = false;
          if (event.pointerType === 'touch' && !event.isPrimary) {
            event.preventDefault(); suppressClick = true; this.pick(id);
          }
        });
        button.addEventListener('click', () => { if (suppressClick) { suppressClick = false; return; } this.pick(id); button.blur(); });
        row = { button, text, icon }; this.rows.set(id, row); this.list.append(button);
      }
      const label = `${prop.name} ×${drop.item.count} · ${distance.toFixed(1)}m`;
      if (row.text.textContent !== label) row.text.textContent = label;
      row.button.setAttribute('aria-label', `Pick up nearby ${prop.name} ×${drop.item.count}`);
      const src = prop.icon ? this.art.url(prop.icon) : '';
      if (row.icon.getAttribute('src') !== src) { if (src) row.icon.src = src; else row.icon.removeAttribute('src'); }
      row.icon.hidden = !src;
    }
    for (const [id, row] of this.rows) if (!visible.has(id)) { row.button.remove(); this.rows.delete(id); }
    this.element.hidden = visible.size === 0;
  }
  dispose(): void { this.rows.clear(); this.element.remove(); }
}

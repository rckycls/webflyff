import type { InventoryItem } from '@flyffweb/protocol';
import type { WebItemProp } from '@flyffweb/formats';

/** Shared item information for bag and shop hover cards. */
export function createItemDetails(doc: Document, item: InventoryItem, prop: WebItemProp | undefined): HTMLElement {
    const details = doc.createElement('div'); details.className = 'inventory-details';
    details.setAttribute('role', 'group'); details.setAttribute('aria-label', 'Item details');
    const title = doc.createElement('strong'); title.textContent = prop?.name ?? `Unknown item #${item.itemId}`;
    const count = doc.createElement('div'); count.className = 'inventory-item-info'; count.textContent = `Quantity: ${item.count}`;
    details.append(title, count);
    if (prop) {
      const info = doc.createElement('div'); info.className = 'inventory-item-info';
      const names: Record<number, string> = { 2: 'Suit', 4: 'Gloves', 5: 'Boots', 6: 'Helmet', 8: 'Cloak', 10: 'Weapon', 11: 'Shield', 19: 'Necklace', 20: 'Ring', 22: 'Earring', 26: 'Fashion hat', 27: 'Fashion suit', 28: 'Fashion gloves', 29: 'Fashion boots' };
      info.textContent = prop.part >= 0 ? `${names[prop.part] ?? 'Equipment'}${prop.abilityMax > 0 ? ` · ${prop.kind1 === 1 ? 'Attack' : 'Defence'} ${prop.abilityMin}–${prop.abilityMax}` : ''}` : [11, 12, 14].includes(prop.kind2) ? 'Consumable' : 'Item';
      details.append(info);
      if (prop.description) {
        const description = doc.createElement('div'); description.className = 'inventory-item-description';
        description.textContent = prop.description; details.append(description);
      }
    }
    return details;
}

export function positionItemDetails(details: HTMLElement, anchorElement: HTMLElement, doc: Document): void {
  const anchor = anchorElement.getBoundingClientRect(), rect = details.getBoundingClientRect(), view = doc.defaultView;
  const width = rect.width || 230, height = rect.height || 80;
  const x = anchor.right + width + 8 <= (view?.innerWidth ?? 1280) ? anchor.right + 8 : anchor.left - width - 8;
  details.style.left = Math.max(8, x) + 'px'; details.style.right = 'auto';
  details.style.top = Math.max(8, Math.min(anchor.top, (view?.innerHeight ?? 720) - height - 8)) + 'px';
}

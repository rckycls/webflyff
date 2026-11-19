/**
 * 2026-11-20 (mouse-drag-ui): a drag shows the item's own 32 x 32 icon with its middle on the cursor, as Neuz draws the
 * carried shortcut's texture at the cursor -16, -16 over every window (Neuz/Neuz.cpp:819-830), in place of the browser's
 * picture of the cell. Only a loaded picture is taken (one not loaded yet leaves the browser's own).
 */
export function setIconDrag(event: DragEvent, icon: HTMLImageElement | null): void {
  if (icon === null || !event.dataTransfer || typeof event.dataTransfer.setDragImage !== 'function') return;
  if (!icon.complete || icon.naturalWidth === 0) return;
  event.dataTransfer.setDragImage(icon, 16, 16);
}

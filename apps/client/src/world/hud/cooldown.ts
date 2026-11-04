// The cool-down's sweep over an item's slot (2026-11-05): `RenderRadar` (`_Interface/WndManager.cpp:143-180`) draws a
// white wash of ARGB(120, 255, 255, 255) over the 32 px cell and one of 128 sweep frames (`g_pCoolTexArry`) for the share
// of the time gone, on the task bar's item slots (`WndTaskBar.cpp:848-857, 960-970`) and the bag's (`WndItemCtrl.cpp:540-
// 550`). Here the sweep is the CSS's conic gradient over the part still to come (style.css, `[data-cooling]`): the frames'
// pictures are not converted.

/** Shows `done` (0 to 1, the share of the cool-down gone) over `slot`, or clears it for null. */
export function drawCooldown(slot: HTMLElement, done: number | null): void {
  if (done === null) {
    if (slot.hasAttribute('data-cooling')) {
      slot.removeAttribute('data-cooling');
      slot.style.removeProperty('--cool-done');
    }
    return;
  }
  slot.setAttribute('data-cooling', '');
  slot.style.setProperty('--cool-done', `${Math.round(done * 1000) / 10}%`);
}

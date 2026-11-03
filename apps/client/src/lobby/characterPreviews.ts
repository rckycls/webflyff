import { attachHeld, loadGltf, loopMotion } from '@flyffweb/scene';
import type { CharacterSummary } from '@flyffweb/protocol';
import { page3d, sceneAssets } from '../world/page3d';
import { characterLook } from '../world/render/looks';
import { loadHeldItems, loadMoverModel } from '../world/render/moverModels';
import { renderPortrait } from '../world/render/portrait';
import { Mti } from '../world/sim/constants';

/** Draw saved equipment with the existing inventory renderer. Late results never draw over a later world screen. */
export async function characterPreviews(element: HTMLElement, characters: CharacterSummary[]): Promise<void> {
  try {
    const page = page3d(element.ownerDocument);
    const { services, data } = await sceneAssets(page);
    for (const character of characters) {
      if (!element.isConnected) return;
      const target = element.querySelector<HTMLElement>(`.character-preview[data-slot="${character.slot}"]`);
      if (!target) continue;
      const details = target.closest('.slot')?.querySelector('.slot-info > span');
      const job = data.jobs[character.job]?.title;
      if (details && job) details.textContent = `Level ${character.level} · ${job}`;
      const look = characterLook(character, data);
      const report = (message: string): void => console.warn(`Character preview: ${message}`);
      const model = await loadMoverModel(services)(look, report);
      const held: Awaited<ReturnType<ReturnType<typeof loadHeldItems>>> = [];
      try {
        held.push(...await loadHeldItems(services, data)(look, report));
        for (const item of held) attachHeld(model, item.item, item.slot);
        const key = look.motion(Mti.STAND);
        const clip = key ? (await loadGltf(services.store, services.loaders.gltf, key)).animations[0] : undefined;
        if (!element.isConnected) return;
        // read back without holding the page (Piece 6 M5); the list may have gone meanwhile
        const picture = await renderPortrait(page.renderer, model, clip ? loopMotion(clip) : null, element.ownerDocument, true);
        if (!target.isConnected) return;
        target.replaceChildren(picture);
      } finally {
        for (const item of held) { item.item.removeFromParent(); item.release(); }
        model.release();
      }
    }
  } catch (error) {
    // Appearance must not prevent choosing a character or logging out on an unsupported/failed GPU.
    if (element.isConnected) console.warn('Character previews unavailable:', error);
  }
}

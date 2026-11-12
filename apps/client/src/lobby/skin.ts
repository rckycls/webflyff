import { pageAssets } from '../pageAssets';
import { themeKey } from '../world/hud/art';

/** The lobby's asset store: the page's (`pageAssets`), which the 3-D side reads too; rejects when it cannot be had. */
export const lobbyAssets = pageAssets;

/**
 * 2026-11-12: the New Character and Delete Character windows' buttons (resdata.inc:11012-11060, :24546-24773) and the
 * nine pieces of their edits (WndEditTile00 to 08, CWndBase::AdditionalSkinTexture).
 */
const WINDOW_ART = ['ButtOk.tga', 'ButtCancel.tga', 'ButtMale.bmp', 'ButtFemale.bmp', 'ButtLeft.bmp', 'ButtRight.bmp',
  ...Array.from({ length: 9 }, (_, i) => `WndEditTile${String(i).padStart(2, '0')}.tga`)];

/** Original Default.thm wallpaper and window/button textures; login remains usable if assets are unavailable. */
export async function skinLobby(root: HTMLElement): Promise<void> {
  try {
    const store = await lobbyAssets();
    const pictures = ['Screen.bmp', 'WndSelectChar.tga', 'ButtLogin.bmp', 'ButtBack.tga', 'ButtNext.tga',
      'ButtCreate.tga', 'ButtDelete.tga', 'ButtAccept.tga',
      ...Array.from({ length: 12 }, (_, i) => `WndTile${String(i).padStart(2, '0')}.tga`),
      ...WINDOW_ART];
    for (const picture of pictures) {
      const url = store.url(themeKey(picture));
      if (url) root.style.setProperty(`--lobby-${picture.split('.')[0]!.toLowerCase()}`, `url(${JSON.stringify(url)})`);
    }
    if (pictures.slice(0, 8).every(picture => store.url(themeKey(picture)))) root.style.setProperty('--lobby-button-label-size', '0px');
    // the select, create and delete windows draw their buttons and edits from the theme once all of it is converted
    // (lobby.css: `.lobby-skinned`); before that their buttons keep their words
    root.classList.toggle('lobby-skinned', [...pictures.slice(3, 8), ...WINDOW_ART].every((picture) => store.url(themeKey(picture))));
  } catch {
    // the page's store forgets a failed index itself: the login stays usable without the skin
  }
}

/** CWndNeuz::AdditionalSkinTexture's twelve pieces, repeated through the center of a resizable dialog. */
export function frameLobby(element: HTMLElement): void {
  const frame = document.createElement('div');
  frame.className = 'lobby-frame';
  frame.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 12; i++) {
    const tile = document.createElement('span');
    tile.style.backgroundImage = `var(--lobby-wndtile${String(i).padStart(2, '0')})`;
    frame.append(tile);
  }
  element.prepend(frame);
}

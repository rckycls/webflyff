// The game's pictures for the site's pages, without the game's code: the asset index (`/assets/index.json`, which /play
// reads too, so the browser has it ready there) is read with a plain `fetch`, as AssetStore.load reads it.

/** The login screen's wallpaper (Default.thm's Screen.bmp, which lobby/skin.ts shows): it carries the FlyFF logo. */
export const LOBBY_SCREEN = 'ui/screen.png';

/** The url of `key` in the asset index, or null when the index or the picture cannot be had. */
export async function lobbyPicture(fetchFn: typeof fetch, key = LOBBY_SCREEN): Promise<string | null> {
  try {
    const response = await fetchFn('/assets/index.json', { cache: 'no-cache' });
    if (!response.ok) return null;
    const index = (await response.json()) as { version?: unknown; files?: unknown };
    if (index.version !== 1 || typeof index.files !== 'object' || index.files === null) return null;
    const file = (index.files as Record<string, unknown>)[key];
    return typeof file === 'string' && Object.hasOwn(index.files, key) ? `/assets/${file}` : null;
  } catch {
    return null;
  }
}

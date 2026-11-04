// The page's one asset index (2026-11-04 loading audit: the lobby and the 3-D side each fetched and parsed index.json,
// 2 MB, once a page), and the game data started from it as the page loads.
import { afterEach, describe, expect, it, vi } from 'vitest';

const INDEX = { version: 1, files: {} };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

function stubFetch(fail: () => boolean) {
  const urls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    urls.push(String(url));
    if (fail()) return new Response('nope', { status: 404 });
    return new Response(JSON.stringify(INDEX), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  return urls;
}

describe('pageAssets', () => {
  it('fetches index.json once a page, however many ask', async () => {
    const urls = stubFetch(() => false);
    const { pageAssets } = await import('../src/pageAssets');
    const [a, b] = await Promise.all([pageAssets(), pageAssets()]);
    expect(a).toBe(b);
    expect(await pageAssets()).toBe(a);
    expect(urls.filter((url) => url.endsWith('index.json'))).toHaveLength(1);
  });

  it('forgets a failure, so the next call tries again', async () => {
    let failing = true;
    const urls = stubFetch(() => failing);
    const { pageAssets } = await import('../src/pageAssets');
    await expect(pageAssets()).rejects.toThrow();
    failing = false;
    await expect(pageAssets()).resolves.toBeDefined();
    expect(urls.filter((url) => url.endsWith('index.json')).length).toBeGreaterThanOrEqual(2);
  });

  it('the game data comes from that same index, and a failed load is forgotten too', async () => {
    const urls = stubFetch(() => false);
    const { pageAssets, pageGameData } = await import('../src/pageAssets');
    // an index without the catalogs: the game data rejects (GameDataMissingError), and is asked again next time
    await expect(pageGameData()).rejects.toThrow();
    await expect(pageGameData()).rejects.toThrow();
    await pageAssets();
    expect(urls.filter((url) => url.endsWith('index.json'))).toHaveLength(1);
  });
});

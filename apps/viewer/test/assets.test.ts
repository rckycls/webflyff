import { BoxGeometry, DataTexture, Group, Mesh, MeshStandardMaterial, RGBAFormat, Texture, UnsignedByteType } from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeTileBin } from '@flyffweb/formats';
import type { AssetIndex, WebTile, WorldManifest } from '@flyffweb/formats';
import { AssetStore } from '../src/assets/AssetStore';
import { AssetLoadError, fetchWithRetry } from '../src/assets/fetchWithRetry';
import { TextureCache, applyTextures } from '../src/assets/loaders';
import { checkerTexture } from '../src/assets/placeholder';

const noSleep = async (): Promise<void> => {};

describe('fetchWithRetry', () => {
  it('gives up after 3 retries', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('network down'));
    const sleep = vi.fn(async (_ms: number) => {});

    const failure = await fetchWithRetry('/assets/a.glb', { fetchFn, sleep }).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(AssetLoadError);
    expect((failure as AssetLoadError).attempts).toBe(4);
    expect((failure as AssetLoadError).url).toBe('/assets/a.glb');
    expect((failure as AssetLoadError).message).toContain('network down');
    expect(fetchFn).toHaveBeenCalledTimes(4);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([500, 1000, 2000]);
  });

  it('succeeds on the third attempt and returns that response', async () => {
    const good = new Response('ok');
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('flaky'))
      .mockRejectedValueOnce(new TypeError('flaky'))
      .mockResolvedValueOnce(good);
    const sleep = vi.fn(async (_ms: number) => {});

    const response = await fetchWithRetry('/assets/a.glb', { fetchFn, sleep });

    expect(response).toBe(good);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([500, 1000]);
  });

  it('counts an HTTP error status as a failed attempt', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 503, statusText: 'Service Unavailable' }))
      .mockResolvedValueOnce(new Response('fine'));

    const response = await fetchWithRetry('/x', { fetchFn, sleep: noSleep });
    expect(await response.text()).toBe('fine');

    const alwaysMissing = vi.fn<typeof fetch>().mockImplementation(async () => new Response('', { status: 404 }));
    const failure = await fetchWithRetry('/y', { fetchFn: alwaysMissing, sleep: noSleep }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(AssetLoadError);
    expect((failure as AssetLoadError).message).toContain('404');
  });

  it('does not sleep when the first attempt works', async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    await fetchWithRetry('/x', { fetchFn: async () => new Response('ok'), sleep });
    expect(sleep).not.toHaveBeenCalled();
  });

  it('honours retries and baseDelayMs, and passes init to fetch', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new Error('down'));
    const sleep = vi.fn(async (_ms: number) => {});
    const failure = await fetchWithRetry('/x', {
      retries: 1,
      baseDelayMs: 10,
      fetchFn,
      sleep,
      init: { cache: 'no-cache' },
    }).catch((e: unknown) => e);

    expect((failure as AssetLoadError).attempts).toBe(2);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([10]);
    expect(fetchFn).toHaveBeenCalledWith('/x', { cache: 'no-cache' });
  });
});

/** A fetch that answers from a table of URL to body and records what it was asked for. */
function fakeFetch(routes: Record<string, string | Uint8Array>) {
  return vi.fn<typeof fetch>(async (input) => {
    const body = routes[String(input)];
    if (body === undefined) return new Response('', { status: 404 });
    return new Response(typeof body === 'string' ? body : new Blob([body as BlobPart]));
  });
}

function blankTile(x: number, y: number): WebTile {
  const heights = new Float32Array(129 * 129);
  heights[0] = 12.5;
  return { x, y, heights, water: new Uint8Array(0), landAttr: new Uint8Array(256), layers: [], objects: [] };
}

const INDEX: AssetIndex = {
  version: 1,
  files: {
    'models/a.glb': 'models/a.1111111111.glb',
    'models/b.glb': 'models/b.2222222222.glb',
    'textures/a.dds.ktx2': 'textures/a.dds.3333333333.ktx2',
    'worlds/wdtest/manifest.json': 'worlds/wdtest/manifest.4444444444.json',
  },
};

const MANIFEST = {
  name: 'WdTest',
  tiles: { '0_0': 'worlds/wdtest/tiles/0_0.5555555555.bin' },
} as unknown as WorldManifest;

function routes(): Record<string, string | Uint8Array> {
  return {
    '/assets/index.json': JSON.stringify(INDEX),
    '/assets/models/a.1111111111.glb': new Uint8Array([1, 2, 3]),
    '/assets/worlds/wdtest/manifest.4444444444.json': JSON.stringify(MANIFEST),
    '/assets/worlds/wdtest/tiles/0_0.5555555555.bin': encodeTileBin(blankTile(0, 0)),
  };
}

describe('AssetStore', () => {
  it('maps logical keys to hashed urls under the base', async () => {
    const store = await AssetStore.load('/assets/', { fetchFn: fakeFetch(routes()), sleep: noSleep });

    expect(store.url('models/a.glb')).toBe('/assets/models/a.1111111111.glb');
    expect(store.url('models/missing.glb')).toBeNull();
    expect(store.url('constructor')).toBeNull();
    expect(store.keys('models/')).toEqual(['models/a.glb', 'models/b.glb']);
    expect(store.keys('nothing/')).toEqual([]);
  });

  it('adds the missing slash to the base and asks the server to revalidate the index', async () => {
    const fetchFn = fakeFetch(routes());
    const store = await AssetStore.load('/assets', { fetchFn, sleep: noSleep });

    expect(fetchFn).toHaveBeenCalledWith('/assets/index.json', { cache: 'no-cache' });
    expect(store.url('models/a.glb')).toBe('/assets/models/a.1111111111.glb');
  });

  it('rejects an index it cannot use, and a download that keeps failing', async () => {
    const wrongVersion = fakeFetch({ '/assets/index.json': JSON.stringify({ version: 2, files: {} }) });
    await expect(AssetStore.load('/assets/', { fetchFn: wrongVersion, sleep: noSleep })).rejects.toThrow(/version/);

    const down = fakeFetch({});
    await expect(AssetStore.load('/assets/', { fetchFn: down, sleep: noSleep })).rejects.toBeInstanceOf(AssetLoadError);
    expect(down).toHaveBeenCalledTimes(4);
  });

  it('reads json and bytes through the index', async () => {
    const store = await AssetStore.load('/assets/', { fetchFn: fakeFetch(routes()), sleep: noSleep });

    expect(await store.json<WorldManifest>('worlds/wdtest/manifest.json')).toMatchObject({ name: 'WdTest' });
    expect(Array.from(await store.bytes('models/a.glb'))).toEqual([1, 2, 3]);
    await expect(store.bytes('models/nope.glb')).rejects.toThrow('models/nope.glb');
  });

  it('streams a tile by world web name, null when the world has no such tile', async () => {
    const fetchFn = fakeFetch(routes());
    const store = await AssetStore.load('/assets/', { fetchFn, sleep: noSleep });

    const tile = await store.tile('wdtest', 0, 0);
    expect(tile).toMatchObject({ x: 0, y: 0 });
    expect(tile!.heights[0]).toBe(12.5);

    expect(await store.tile('wdtest', 7, 7)).toBeNull();
    // the manifest is fetched once, and an absent tile costs no download
    const urls = fetchFn.mock.calls.map(([input]) => String(input));
    expect(urls.filter((u) => u.includes('manifest'))).toHaveLength(1);
    expect(urls.filter((u) => u.includes('/tiles/'))).toHaveLength(1);
  });

  it('retries a manifest that failed instead of remembering the failure', async () => {
    const real = fakeFetch(routes());
    const manifestUrl = '/assets/worlds/wdtest/manifest.4444444444.json';
    let fail = true;
    const fetchFn = vi.fn<typeof fetch>(async (input, init) => {
      if (String(input) === manifestUrl && fail) return new Response('', { status: 500 });
      return real(input, init);
    });
    const store = await AssetStore.load('/assets/', { fetchFn, sleep: noSleep, retries: 0 });

    await expect(store.tile('wdtest', 0, 0)).rejects.toBeInstanceOf(AssetLoadError);
    fail = false;
    expect(await store.tile('wdtest', 0, 0)).not.toBeNull();
  });
});

function overlayStub() {
  return { error: vi.fn<(message: string) => void>(), addGpuBytes: vi.fn<(bytes: number) => void>() };
}

async function storeWithTextures(...keys: string[]): Promise<AssetStore> {
  const files = Object.fromEntries(keys.map((key) => [key, key.replace(/\.ktx2$/, '.abcdef0123.ktx2')]));
  return AssetStore.load('/assets/', {
    fetchFn: fakeFetch({ '/assets/index.json': JSON.stringify({ version: 1, files }) }),
    sleep: noSleep,
  });
}

function rgbaTexture(size = 4): DataTexture {
  return new DataTexture(new Uint8Array(size * size * 4), size, size, RGBAFormat, UnsignedByteType);
}

describe('checkerTexture', () => {
  it('is one shared 64x64 magenta and black board of 8-pixel squares', () => {
    const texture = checkerTexture();
    expect(checkerTexture()).toBe(texture);
    const image = texture.image as { width: number; height: number; data: Uint8Array };
    expect(image.width).toBe(64);
    expect(image.height).toBe(64);

    const data = image.data;
    const pixel = (x: number, y: number): number[] => Array.from(data.subarray((y * 64 + x) * 4, (y * 64 + x) * 4 + 4));
    expect(pixel(0, 0)).toEqual([255, 0, 255, 255]);
    expect(pixel(7, 7)).toEqual([255, 0, 255, 255]);
    expect(pixel(8, 0)).toEqual([0, 0, 0, 255]);
    expect(pixel(0, 8)).toEqual([0, 0, 0, 255]);
    expect(pixel(8, 8)).toEqual([255, 0, 255, 255]);
    expect(pixel(63, 63)).toEqual([255, 0, 255, 255]);
  });
});

describe('TextureCache', () => {
  it('falls back to the checkerboard and tells the overlay once', async () => {
    const store = await storeWithTextures('textures/x.ktx2');
    const overlay = overlayStub();
    const cache = new TextureCache(store, () => Promise.reject(new Error('decode failed')), overlay);

    const texture = await cache.acquire('textures/x.ktx2');
    expect(texture).toBe(checkerTexture());
    expect((texture.image as { width: number }).width).toBe(64);
    expect(overlay.error).toHaveBeenCalledTimes(1);
    expect(overlay.error.mock.calls[0]![0]).toContain('textures/x.ktx2');

    // a null key is the same board and is no error
    expect(await cache.acquire(null)).toBe(texture);
    expect(overlay.error).toHaveBeenCalledTimes(1);
  });

  it('falls back for a key the index does not know, without loading anything', async () => {
    const store = await storeWithTextures();
    const overlay = overlayStub();
    const load = vi.fn(async (_url: string) => rgbaTexture());
    const cache = new TextureCache(store, load, overlay);

    expect(await cache.acquire('textures/ghost.ktx2')).toBe(checkerTexture());
    expect(load).not.toHaveBeenCalled();
    expect(overlay.error).toHaveBeenCalledTimes(1);
    expect(overlay.error.mock.calls[0]![0]).toContain('textures/ghost.ktx2');
  });

  it('ref-counts: one load for two acquires, dispose after the second release', async () => {
    const store = await storeWithTextures('textures/a.ktx2');
    const texture = rgbaTexture();
    const dispose = vi.spyOn(texture, 'dispose');
    const load = vi.fn(async (_url: string) => texture);
    const cache = new TextureCache(store, load, overlayStub());

    const [first, second] = await Promise.all([cache.acquire('textures/a.ktx2'), cache.acquire('textures/a.ktx2')]);
    expect(first).toBe(texture);
    expect(second).toBe(texture);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith('/assets/textures/a.abcdef0123.ktx2');
    expect(cache.size()).toBe(1);

    cache.release('textures/a.ktx2');
    expect(dispose).not.toHaveBeenCalled();
    expect(cache.size()).toBe(1);

    cache.release('textures/a.ktx2');
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(cache.size()).toBe(0);

    // a texture that was let go is loaded again on the next acquire
    await cache.acquire('textures/a.ktx2');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('counts the uploaded bytes in the overlay and takes them back on dispose', async () => {
    const store = await storeWithTextures('textures/a.ktx2');
    const overlay = overlayStub();
    const texture = rgbaTexture(4); // 4 x 4 rgba8, one level, no mipmaps: 64 bytes
    texture.generateMipmaps = false;
    const cache = new TextureCache(store, async () => texture, overlay);

    await cache.acquire('textures/a.ktx2');
    expect(overlay.addGpuBytes).toHaveBeenLastCalledWith(64);
    cache.release('textures/a.ktx2');
    expect(overlay.addGpuBytes).toHaveBeenLastCalledWith(-64);
  });

  it('never disposes the shared board, and ignores releases it does not know', async () => {
    const store = await storeWithTextures('textures/x.ktx2');
    const overlay = overlayStub();
    const cache = new TextureCache(store, () => Promise.reject(new Error('nope')), overlay);
    const dispose = vi.spyOn(checkerTexture(), 'dispose');

    await cache.acquire('textures/x.ktx2');
    cache.release('textures/x.ktx2');
    cache.release(null);
    cache.release('textures/never-acquired.ktx2');

    expect(dispose).not.toHaveBeenCalled();
    expect(overlay.addGpuBytes).not.toHaveBeenCalled();
    expect(cache.size()).toBe(0);
    dispose.mockRestore();
  });

  it('disposes a texture that was released while it was still loading', async () => {
    const store = await storeWithTextures('textures/a.ktx2');
    const overlay = overlayStub();
    const texture = rgbaTexture();
    const dispose = vi.spyOn(texture, 'dispose');
    let arrive!: (t: Texture) => void;
    const cache = new TextureCache(store, () => new Promise<Texture>((resolve) => (arrive = resolve)), overlay);

    const pending = cache.acquire('textures/a.ktx2');
    cache.release('textures/a.ktx2');
    arrive(texture);
    await pending;
    await Promise.resolve();

    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

describe('applyTextures', () => {
  afterEach(() => vi.restoreAllMocks());

  function meshWith(...materials: MeshStandardMaterial[]): Mesh {
    return new Mesh(new BoxGeometry(), materials.length === 1 ? materials[0] : materials);
  }
  function material(texture: string | null | undefined): MeshStandardMaterial {
    const m = new MeshStandardMaterial();
    if (texture !== undefined) m.userData.texture = texture;
    return m;
  }

  it('sets map from userData.texture and returns the keys it acquired', async () => {
    const store = await storeWithTextures('textures/a.ktx2', 'textures/b.ktx2');
    const loaded = new Map<string, Texture>();
    const cache = new TextureCache(
      store,
      async (url) => {
        const t = rgbaTexture();
        loaded.set(url, t);
        return t;
      },
      overlayStub(),
    );

    const a = material('textures/a.ktx2');
    const b = material('textures/b.ktx2');
    const unnamed = material(undefined);
    const root = new Group();
    root.add(meshWith(a), meshWith(b, unnamed));
    const nested = new Group();
    nested.add(meshWith(a)); // the same material object again: acquired once
    root.add(nested);

    const keys = await applyTextures(root, cache);

    expect(keys.sort()).toEqual(['textures/a.ktx2', 'textures/b.ktx2']);
    expect(a.map).toBe(loaded.get('/assets/textures/a.abcdef0123.ktx2'));
    expect(b.map).toBe(loaded.get('/assets/textures/b.abcdef0123.ktx2'));
    expect(unnamed.map).toBeNull();
    expect(cache.size()).toBe(2);
  });

  it('gives a material whose texture is null the checkerboard, and a broken key too', async () => {
    const store = await storeWithTextures('textures/broken.ktx2');
    const overlay = overlayStub();
    const cache = new TextureCache(store, () => Promise.reject(new Error('bad')), overlay);
    const none = material(null);
    const broken = material('textures/broken.ktx2');
    const root = new Group();
    root.add(meshWith(none), meshWith(broken));

    const keys = await applyTextures(root, cache);

    expect(none.map).toBe(checkerTexture());
    expect(broken.map).toBe(checkerTexture());
    expect(keys).toEqual(['textures/broken.ktx2']);
    expect(overlay.error).toHaveBeenCalledTimes(1);
  });

  it('releasing the returned keys lets every texture go', async () => {
    const store = await storeWithTextures('textures/a.ktx2');
    const texture = rgbaTexture();
    const dispose = vi.spyOn(texture, 'dispose');
    const cache = new TextureCache(store, async () => texture, overlayStub());
    const root = new Group();
    root.add(meshWith(material('textures/a.ktx2')), meshWith(material('textures/a.ktx2')));

    const keys = await applyTextures(root, cache);
    expect(keys).toEqual(['textures/a.ktx2', 'textures/a.ktx2']);
    for (const key of keys) cache.release(key);

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(cache.size()).toBe(0);
  });
});

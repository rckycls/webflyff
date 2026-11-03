// @vitest-environment jsdom
// The portraits' readback (Piece 6 M5): under a software renderer a blocking readRenderTargetPixels held the page for
// seconds, so the picture is read back with the asynchronous read, and only the newest of several portraits is kept.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnimationMixer, BoxGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, WebGLRenderTarget } from 'three';
import type { Material, WebGLRenderer } from 'three';
import type { AssembledCharacter } from '@flyffweb/scene';
import { latestOnly, renderPortrait } from '../src/world/render/portrait';

afterEach(() => vi.restoreAllMocks());

/** A renderer that records what it is asked, with an asynchronous read the test settles. */
function stubRenderer() {
  const calls: string[] = [];
  let settle: { resolve: () => void; reject: (error: Error) => void } | null = null;
  const old = { name: 'old target' };
  const renderer = {
    getPixelRatio: () => 1,
    getRenderTarget: () => old,
    getClearColor: (color: unknown) => color,
    getClearAlpha: () => 1,
    setRenderTarget: (target: unknown) => calls.push(target === old ? 'setRenderTarget(old)' : 'setRenderTarget(target)'),
    setClearColor: () => {},
    clear: () => calls.push('clear'),
    render: () => calls.push('render'),
    readRenderTargetPixels: () => calls.push('readRenderTargetPixels'),
    readRenderTargetPixelsAsync: () => {
      calls.push('readRenderTargetPixelsAsync');
      return new Promise<void>((resolve, reject) => { settle = { resolve, reject }; });
    },
  };
  return { renderer: renderer as unknown as WebGLRenderer, calls, settle: () => settle! };
}

function model(): AssembledCharacter {
  const root = new Group();
  return { root, mixer: new AnimationMixer(root) } as unknown as AssembledCharacter;
}

function quiet(): void {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
}

describe('renderPortrait', () => {
  it("draws the model's see-through two-sided parts unlit, in one pass (Piece 6 M5, part B)", async () => {
    quiet();
    const { renderer, settle } = stubRenderer();
    const character = model();
    const part: Mesh<BoxGeometry, Material> = new Mesh(new BoxGeometry(), new MeshLambertMaterial({ transparent: true, side: DoubleSide }));
    character.root.add(part);
    const picture = renderPortrait(renderer, character, null, document, true);
    settle().resolve();
    await picture;
    expect(part.material).toBeInstanceOf(MeshBasicMaterial);
    expect((part.material as MeshBasicMaterial).forceSinglePass).toBe(true);
  });

  it('reads the pixels with readRenderTargetPixelsAsync, never the blocking read', async () => {
    quiet();
    const { renderer, calls, settle } = stubRenderer();
    const picture = renderPortrait(renderer, model(), null, document, true);
    settle().resolve();
    await picture;
    expect(calls).toContain('readRenderTargetPixelsAsync');
    expect(calls).not.toContain('readRenderTargetPixels');
  });

  it('gives the render target back before the read resolves, and disposes the target after', async () => {
    quiet();
    const dispose = vi.spyOn(WebGLRenderTarget.prototype, 'dispose');
    const { renderer, calls, settle } = stubRenderer();
    const picture = renderPortrait(renderer, model(), null, document, true);
    expect(calls).toEqual(['setRenderTarget(target)', 'clear', 'render', 'setRenderTarget(old)', 'readRenderTargetPixelsAsync']);
    expect(dispose).not.toHaveBeenCalled();
    settle().resolve();
    const canvas = await picture;
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(canvas.tagName).toBe('CANVAS');
  });

  it('rejects when the read rejects, and still disposes the target', async () => {
    quiet();
    const dispose = vi.spyOn(WebGLRenderTarget.prototype, 'dispose');
    const { renderer, settle } = stubRenderer();
    const picture = renderPortrait(renderer, model(), null, document, true);
    settle().reject(new Error('context lost'));
    await expect(picture).rejects.toThrow('context lost');
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

describe('latestOnly', () => {
  it('an older task that finishes after a newer one gives null', async () => {
    const latest = latestOnly<string>();
    let finishOld!: (value: string) => void;
    const older = latest(new Promise<string>((resolve) => { finishOld = resolve; }));
    const newer = latest(Promise.resolve('new'));
    expect(await newer).toBe('new');
    finishOld('old');
    expect(await older).toBeNull();
  });

  it('the newest task gives its value', async () => {
    const latest = latestOnly<number>();
    expect(await latest(Promise.resolve(1))).toBe(1);
    expect(await latest(Promise.resolve(2))).toBe(2);
  });
});

// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene, Sprite, SpriteMaterial } from 'three';
import { SpeechBubbleLayer, shoutPicture } from '../src/world/render/SpeechBubbleLayer';

it('replaces each speaker bubble, follows the head, fades, and releases expired or removed messages', () => {
  const context = { font: '', measureText: (text: string) => ({ width: text.length * 6 }), scale: vi.fn(), beginPath: vi.fn(), roundRect: vi.fn(), fill: vi.fn(), stroke: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), fillText: vi.fn() };
  const mock = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  let now = 0; const scene = new Scene(), camera = new PerspectiveCamera(60, 1, .1, 200);
  const layer = new SpeechBubbleLayer(scene, document, () => now);
  const place = () => ({ at: [0, 0, -5] as [number, number, number], head: [0, 2, -5] as [number, number, number] });
  try {
    layer.say(1, '<img src=x>'); expect(context.fillText).toHaveBeenCalledWith('<img src=x>', 8, 6);
    layer.update(camera, 600, place);
    const first = scene.getObjectByName('speech bubble 1') as Sprite;
    expect(first.visible).toBe(true); expect(first.position.y).toBe(2);
    const disposed = vi.spyOn(first.material, 'dispose');
    layer.say(1, 'replacement'); expect(disposed).toHaveBeenCalledOnce(); expect(scene.children).toHaveLength(1);
    now = 4500; layer.update(camera, 600, place);
    expect(((scene.children[0] as Sprite).material as SpriteMaterial).opacity).toBe(.5);
    now = 5000; layer.update(camera, 600, place); expect(scene.children).toHaveLength(0);
    layer.say(2, 'gone'); layer.remove(2); expect(scene.children).toHaveLength(0);
    layer.say(3, 'cleanup'); layer.dispose(); expect(scene.children).toHaveLength(0);
  } finally { layer.dispose(); mock.mockRestore(); }
});

// 2026-11-17: a shout's picture by its length in characters (DialogMsg.cpp:485-509)
it('picks the shout picture by the length of the text', () => {
  const of = (length: number) => shoutPicture('x'.repeat(length));
  expect([1, 2, 3, 4, 5, 6, 9, 10, 20, 21, 40, 41, 60, 61, 260].map(of)).toEqual([
    'texDialogBoxShout00.bmp', 'texDialogBoxShout01.bmp', 'texDialogBoxShout01.bmp', 'texDialogBoxShout02.bmp',
    'texDialogBoxShout02.bmp', 'texDialogBoxShout03.bmp', 'texDialogBoxShout03.bmp', 'texDialogBoxShout04.bmp',
    'texDialogBoxShout04.bmp', 'texDialogBoxShout05.bmp', 'texDialogBoxShout05.bmp', 'texDialogBoxShout06.bmp',
    'texDialogBoxShout06.bmp', 'texDialogBoxShout07.bmp', 'texDialogBoxShout07.bmp',
  ]);
  expect(shoutPicture('안녕')).toBe('texDialogBoxShout01.bmp');
});

// 2026-11-17: the shout's balloon as Neuz sizes and draws it (DialogMsg.cpp:896-919, :452-516, :612-624)
it('draws a shout over the shouter with the shout picture, sized as Neuz does, and the plain balloon without the picture', () => {
  const context = { font: '', globalAlpha: 1, measureText: (text: string) => ({ width: text.length * 6 }), scale: vi.fn(), beginPath: vi.fn(), roundRect: vi.fn(), fill: vi.fn(), stroke: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), fillText: vi.fn(), clearRect: vi.fn(), drawImage: vi.fn() };
  const mock = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);
  const images: HTMLImageElement[] = [];
  const create = document.createElement.bind(document);
  const made = vi.spyOn(document, 'createElement').mockImplementation(((name: string) => {
    const element = create(name);
    if (name === 'img') images.push(element as HTMLImageElement);
    return element;
  }) as typeof document.createElement);
  const scene = new Scene();
  const urls: string[] = [];
  const layer = new SpeechBubbleLayer(scene, document, () => 0, (key) => { urls.push(key); return key.includes('shout') ? `/assets/${key}` : ''; });
  try {
    // "Hello world": 66 px wide, so cx = 96 (82 rounded up to 16), one line, cy = 32; the picture 0.9 * 96 + 50 by 0.75 * 32 + 40
    layer.say(7, 'Hello world', 'shout');
    expect(urls).toEqual(['ui/texdialogboxshout04.png']);
    expect(images).toHaveLength(1); expect(images[0]!.getAttribute('src')).toBe('/assets/ui/texdialogboxshout04.png');
    expect(context.fillText).toHaveBeenCalledWith('Hello world', 28, 28);
    expect(context.roundRect).not.toHaveBeenCalled();
    const sprite = scene.getObjectByName('speech bubble 7') as Sprite;
    // the head 20 + cx / 2 in, and GAP 28 under the point 4 below the picture's foot
    expect(sprite.center.x).toBeCloseTo(68 / 137); expect(sprite.center.y).toBeCloseTo(-32 / 64);
    images[0]!.dispatchEvent(new Event('load'));
    expect(context.drawImage).toHaveBeenCalledWith(images[0], 0, 0, 0.9 * 96 + 50, 64);
    expect(context.fillText).toHaveBeenLastCalledWith('Hello world', 28, 28);
    // a long shout: cx 160, its lines broken at 144 px (24 characters), not cut off
    context.fillText.mockClear();
    const long = 'a'.repeat(60);
    layer.say(7, long, 'shout');
    expect(context.fillText.mock.calls).toEqual([['a'.repeat(24), 28, 28], ['a'.repeat(24), 28, 43], ['a'.repeat(12), 28, 58]]);
    // a balloon replaced before its picture came is not painted over
    context.drawImage.mockClear();
    layer.say(7, 'plain now');
    images[0]!.dispatchEvent(new Event('load'));
    expect(context.drawImage).not.toHaveBeenCalled();
    expect(context.roundRect).toHaveBeenCalledOnce();
    // no picture in the store (not converted yet): the plain balloon
    const plainLayer = new SpeechBubbleLayer(scene, document, () => 0);
    context.roundRect.mockClear();
    plainLayer.say(8, 'Hello', 'shout');
    expect(context.roundRect).toHaveBeenCalledOnce(); expect(context.fillText).toHaveBeenLastCalledWith('Hello', 8, 6);
    plainLayer.dispose();
  } finally { layer.dispose(); made.mockRestore(); mock.mockRestore(); }
});

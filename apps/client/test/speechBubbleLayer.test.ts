// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene, Sprite, SpriteMaterial } from 'three';
import { SpeechBubbleLayer } from '../src/world/render/SpeechBubbleLayer';

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

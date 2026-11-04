import { describe, expect, it } from 'vitest';
import { Scene, Sprite, SpriteMaterial } from 'three';
import type { WebUiSheets } from '@flyffweb/formats';
import type { Mover } from '../src/world/WorldState';
import { WorldIndicatorLayer } from '../src/world/render/WorldIndicatorLayer';
import type { QuestMarker } from '../src/world/quests/questMarkers';

describe('original FlyFF world indicator artwork', () => {
  it('uses client frames 1/2/3/4 for quest states and frame 0 for queued attack reactions', async () => {
    const scene = new Scene();
    const doc = { createElement(tag: string) {
      if (tag === 'img') return { src: '', naturalWidth: 256, naturalHeight: 32, decode: async () => {} };
      const canvas = { width: 0, height: 0, crop: [] as number[], getContext: () => ({
        drawImage: (_image: unknown, ...args: number[]) => { canvas.crop = args; },
      }) };
      return canvas;
    } } as unknown as Document;
    const frames = Array.from({ length: 5 }, (_, i) => ({ x: i * 32, y: 0, w: 32, h: 32 }));
    const sheets = { questEmoticons: { image: 'quest.png', frames }, dialogEmoticons: { image: 'dialog.png', frames } } as WebUiSheets;
    const layer = new WorldIndicatorLayer(scene, doc);
    layer.attack(2, 0); // server event can arrive before artwork decoding finishes
    await layer.loadArtwork(sheets, (key) => key);
    const movers = new Map([[1, { objectId: 1, kind: 'npc' } as Mover], [2, { objectId: 2, kind: 'monster' } as Mover]]);
    const crop = (name: string): number[] => {
      const sprite = scene.children.find((child) => child.name === name) as Sprite;
      return ((sprite.material as SpriteMaterial).map!.image as { crop: number[] }).crop;
    };
    for (const [state, frame] of [['available', 1], ['inProgress', 2], ['ready', 3], ['future', 4]] as const) {
      layer.sync(movers, () => state as QuestMarker, 1000);
      expect(crop('quest marker 1')).toEqual([frame * 32, 0, 32, 32, 0, 0, 32, 32]);
    }
    expect(crop('attack emote 2')).toEqual([0, 0, 32, 32, 0, 0, 32, 32]);
    layer.sync(movers, () => null, 5000);
    expect(scene.children).toHaveLength(0);
    layer.dispose();
  });
});

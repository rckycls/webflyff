import type { Vec3, WebUiSheets, WebUiSheet } from '@flyffweb/formats';
import type { PerspectiveCamera, Scene } from 'three';
import { CanvasTexture, LinearFilter, SRGBColorSpace, Sprite, SpriteMaterial, Vector3 } from 'three';
import type { Mover } from '../WorldState';
import type { QuestMarker } from '../quests/questMarkers';

const EMOTE_MS = 5000;
const QUEST_FRAMES: Record<QuestMarker, number> = { available: 1, inProgress: 2, ready: 3, future: 4 };

interface Indicator {
  quest: QuestMarker | null;
  questSprite: Sprite | null;
  emoteUntil: number;
  emoteSprite: Sprite | null;
}

const at = new Vector3();

/** Billboarded v15 quest markers and the short `DLGEMOT_ATTACK` reaction above movers. */
export class WorldIndicatorLayer {
  private readonly indicators = new Map<number, Indicator>();
  private readonly textures = new Map<string, CanvasTexture>();

  private disposed = false;

  constructor(private readonly scene: Scene, private readonly doc: Document) {}

  /** Crop the original client atlas pixels using its .inc frame indices; no replacement artwork. */
  async loadArtwork(sheets: WebUiSheets, urlOf: (key: string) => string | null): Promise<void> {
    const load = async (sheet: WebUiSheet | undefined, frames: Record<string, number>): Promise<void> => {
      if (sheet === undefined) throw new Error('Original FlyFF indicator sheet is missing; rebuild UI assets');
      const url = urlOf(sheet.image);
      if (url === null) throw new Error(sheet.image + ' is not in the asset index');
      const image = this.doc.createElement('img');
      image.src = url;
      await image.decode();
      if (this.disposed) return;
      for (const [name, index] of Object.entries(frames)) {
        const frame = sheet.frames[index];
        if (!frame || frame.x + frame.w > image.naturalWidth || frame.y + frame.h > image.naturalHeight) {
          throw new Error(sheet.image + ': indicator frame ' + index + ' is outside the image');
        }
        const canvas = this.doc.createElement('canvas');
        canvas.width = frame.w;
        canvas.height = frame.h;
        const context = canvas.getContext('2d');
        if (context === null) throw new Error('Cannot create indicator texture');
        context.drawImage(image, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
        const texture = new CanvasTexture(canvas);
        texture.colorSpace = SRGBColorSpace;
        texture.minFilter = LinearFilter;
        texture.generateMipmaps = false;
        this.textures.set(name, texture);
      }
    };
    await Promise.all([load(sheets.questEmoticons, QUEST_FRAMES), load(sheets.dialogEmoticons, { attack: 0 })]);
  }

  /** Synchronizes per-character quest markers and drops indicators for movers that left view. */
  sync(movers: ReadonlyMap<number, Mover>, markerOf: (mover: Mover) => QuestMarker | null, now: number): void {
    for (const [id, indicator] of this.indicators) {
      if (!movers.has(id)) {
        this.remove(indicator.questSprite);
        this.remove(indicator.emoteSprite);
        this.indicators.delete(id);
      }
    }
    for (const mover of movers.values()) {
      const marker = mover.kind === 'npc' ? markerOf(mover) : null;
      let indicator = this.indicators.get(mover.objectId);
      if (marker === null && indicator?.questSprite) {
        this.remove(indicator.questSprite);
        indicator.questSprite = null;
        indicator.quest = null;
      }
      if (marker !== null && this.textures.has(marker)) {
        indicator ??= this.make(mover.objectId);
        if (indicator.quest !== marker) {
          this.remove(indicator.questSprite);
          indicator.questSprite = this.sprite(this.textures.get(marker)!, `quest marker ${mover.objectId}`);
          indicator.quest = marker;
        }
      }
      if (indicator && indicator.emoteUntil > now && indicator.emoteSprite === null && this.textures.has('attack')) {
        indicator.emoteSprite = this.sprite(this.textures.get('attack')!, `attack emote ${mover.objectId}`);
      }
      if (indicator?.emoteSprite && indicator.emoteUntil <= now) {
        this.remove(indicator.emoteSprite);
        indicator.emoteSprite = null;
        indicator.emoteUntil = 0;
      }
      if (indicator && indicator.questSprite === null && indicator.emoteSprite === null && indicator.emoteUntil <= now) this.indicators.delete(mover.objectId);
    }
  }

  /** A v15 `!0` from an aggressive monster, shown for the native five-second dialog-emoticon lifetime. */
  attack(objectId: number, now: number): void {
    let indicator = this.indicators.get(objectId);
    if (indicator === undefined) {
      indicator = this.make(objectId);
    }
    if (indicator.emoteSprite === null && this.textures.has('attack')) indicator.emoteSprite = this.sprite(this.textures.get('attack')!, `attack emote ${objectId}`);
    indicator.emoteUntil = now + EMOTE_MS;
  }

  update(
    camera: PerspectiveCamera,
    heightPx: number,
    placeOf: (objectId: number) => { at: Vec3; head: Vec3 } | null,
    now: number,
  ): void {
    const pixel = 2 / (camera.projectionMatrix.elements[5]! * Math.max(1, heightPx));
    this.indicators.forEach((indicator, objectId) => {
      const place = placeOf(objectId);
      if (place === null) {
        if (indicator.questSprite) indicator.questSprite.visible = false;
        if (indicator.emoteSprite) indicator.emoteSprite.visible = false;
        return;
      }
      const distance = camera.position.distanceTo(at.set(place.at[0], place.at[1], place.at[2]));
      const alpha = Math.min(1, Math.max(0, (100 - distance) / 10));
      const set = (sprite: Sprite | null, centerY: number, visible: boolean, scale = 1): void => {
        if (sprite === null) return;
        sprite.visible = visible && alpha > 0;
        sprite.position.set(place.head[0], place.head[1], place.head[2]);
        sprite.center.set(0.5, centerY);
        (sprite.material as SpriteMaterial).opacity = alpha;
        const size = 32 * scale;
        sprite.scale.set(size * pixel, size * pixel, 1);
      };
      // Native pulse: 1.0 to 1.2, 0.01 per 60 Hz tick (WndWorld.cpp:7981).
      const pulse = 1 + 0.2 * (1 - Math.abs((now % (2000 / 3)) / (1000 / 3) - 1));
      set(indicator.questSprite, 0.5 - 50 / (32 * pulse), true, pulse);
      set(indicator.emoteSprite, 0, indicator.emoteUntil > now);
    });
  }

  dispose(): void {
    this.disposed = true;
    for (const indicator of this.indicators.values()) {
      this.remove(indicator.questSprite);
      this.remove(indicator.emoteSprite);
    }
    this.indicators.clear();
    for (const texture of this.textures.values()) texture.dispose();
    this.textures.clear();
  }

  private make(id: number): Indicator {
    const indicator: Indicator = { quest: null, questSprite: null, emoteUntil: 0, emoteSprite: null };
    this.indicators.set(id, indicator);
    return indicator;
  }

  private sprite(texture: CanvasTexture, name: string): Sprite {
    const sprite = new Sprite(new SpriteMaterial({
      map: texture, transparent: true, depthTest: false, depthWrite: false, fog: false, sizeAttenuation: false,
    }));
    sprite.name = name;
    sprite.center.set(0.5, 0.5);
    sprite.renderOrder = 2;
    sprite.visible = false;
    this.scene.add(sprite);
    return sprite;
  }

  private remove(sprite: Sprite | null): void {
    if (sprite === null) return;
    sprite.removeFromParent();
    (sprite.material as SpriteMaterial).dispose();
  }

}

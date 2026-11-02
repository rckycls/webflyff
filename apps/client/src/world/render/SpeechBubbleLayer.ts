import type { Vec3 } from '@flyffweb/formats';
import { CanvasTexture, LinearFilter, SRGBColorSpace, Sprite, SpriteMaterial, Vector3 } from 'three';
import type { PerspectiveCamera, Scene } from 'three';

interface Bubble { sprite: Sprite; texture: CanvasTexture; width: number; height: number; expires: number }
const position = new Vector3();
/** Native CDialogMsg uses a 5000ms lifetime. Messages enter only from server echoes. */
export class SpeechBubbleLayer {
  private readonly bubbles = new Map<number, Bubble>();
  constructor(private readonly scene: Scene, private readonly doc: Document, private readonly now = () => performance.now()) {}

  say(objectId: number, text: string): void {
    if (!text.trim()) return;
    const canvas = this.doc.createElement('canvas'), context = canvas.getContext('2d');
    if (!context) return;
    context.font = '12px Arial, sans-serif';
    const lines: string[] = []; let line = '';
    // Wrap by measured characters, including long words, with a bounded six-line bubble.
    for (const character of text.slice(0, 1023)) {
      if (character === '\n' || context.measureText(line + character).width > 170) {
        lines.push(line); line = '';
        if (lines.length === 6) break;
      }
      if (character !== '\n') line += character;
    }
    if (line && lines.length < 6) lines.push(line);
    const width = Math.ceil(Math.max(30, ...lines.map(value => context.measureText(value).width))) + 16;
    const height = lines.length * 15 + 20;
    const ratio = Math.min(this.doc.defaultView?.devicePixelRatio ?? 1, 2);
    canvas.width = Math.ceil(width * ratio); canvas.height = Math.ceil(height * ratio);
    context.scale(ratio, ratio); context.font = '12px Arial, sans-serif';
    context.fillStyle = '#fffdf0'; context.strokeStyle = '#857d67'; context.lineWidth = 1;
    context.beginPath(); context.roundRect(0.5, 0.5, width - 1, height - 8, 5); context.fill(); context.stroke();
    context.beginPath(); context.moveTo(width / 2 - 5, height - 8); context.lineTo(width / 2, height - 1);
    context.lineTo(width / 2 + 5, height - 8); context.fill(); context.stroke();
    context.fillStyle = '#29271f'; context.textBaseline = 'top';
    lines.forEach((value, index) => context.fillText(value, 8, 6 + index * 15));
    const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter; texture.generateMipmaps = false;
    const material = new SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, fog: false, sizeAttenuation: false });
    const sprite = new Sprite(material); sprite.name = `speech bubble ${objectId}`;
    sprite.center.set(0.5, -28 / height); sprite.renderOrder = 2; sprite.visible = false;
    this.remove(objectId); this.scene.add(sprite);
    this.bubbles.set(objectId, { sprite, texture, width, height, expires: this.now() + 5000 });
  }

  update(camera: PerspectiveCamera, heightPx: number, placeOf: (id: number) => { at: Vec3; head: Vec3 } | null): void {
    const now = this.now(), pixel = 2 / (camera.projectionMatrix.elements[5]! * Math.max(1, heightPx));
    for (const [id, bubble] of this.bubbles) {
      if (now >= bubble.expires) { this.remove(id); continue; }
      const place = placeOf(id);
      bubble.sprite.visible = place !== null && camera.position.distanceTo(position.set(...place.at)) < 100;
      if (!place) continue;
      bubble.sprite.position.set(...place.head); bubble.sprite.scale.set(bubble.width * pixel, bubble.height * pixel, 1);
      (bubble.sprite.material as SpriteMaterial).opacity = Math.min(1, (bubble.expires - now) / 1000);
    }
  }
  remove(id: number): void {
    const bubble = this.bubbles.get(id); if (!bubble) return;
    bubble.sprite.removeFromParent(); bubble.texture.dispose(); (bubble.sprite.material as SpriteMaterial).dispose(); this.bubbles.delete(id);
  }
  dispose(): void { for (const id of this.bubbles.keys()) this.remove(id); }
}

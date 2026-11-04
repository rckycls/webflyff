// @vitest-environment jsdom
// The HP bars over the party's members (Piece 7 M4, [R §9.3]): CWndWorld::OnEraseBkgnd (WndWorld.cpp:1009-1031) calls
// CMover::RenderHP (MoverRender.cpp:1736-1844) for each member but oneself.

import { PerspectiveCamera } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import type { UiArt } from '../src/world/hud/art';
import { PartyHpBars } from '../src/world/render/PartyHpBars';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };

/** A camera at the origin looking down -Z, with a square view. */
function camera(): PerspectiveCamera {
  const view = new PerspectiveCamera(60, 1, 0.1, 1000);
  view.updateMatrixWorld();
  view.updateProjectionMatrix();
  return view;
}

const bars = (layer: PartyHpBars) => [...layer.element.querySelectorAll<HTMLElement>('.party-hp-bar')].filter((bar) => !bar.hidden);

afterEach(() => {
  document.body.replaceChildren();
});

describe('PartyHpBars (CMover::RenderHP)', () => {
  it('a bar per member in view and in front, none for the own player; the fill 112 × HP / max texture px at 0.8 × 0.55', () => {
    const layer = new PartyHpBars(art, document);
    document.body.append(layer.element);
    layer.update(camera(), [
      { objectId: 7, head: [0, 0, -10], hp: 115, maxHp: 230 },
      // oneself
      { objectId: 1, head: [0, 0, -10], hp: 230, maxHp: 230 },
      // behind the camera
      { objectId: 8, head: [0, 0, 10], hp: 230, maxHp: 230 },
      { objectId: 9, head: [0, 0, -10], hp: 1, maxHp: 230 },
    ], 1, 800, 600);
    const shown = bars(layer);
    expect(shown.map((bar) => bar.dataset.object)).toEqual(['7', '9']);
    const [bar] = shown;
    // straight ahead, the middle of an 800 x 600 view: 34 px up, at (x − 42, y − 5)
    expect([bar!.style.left, bar!.style.top]).toEqual(['358px', '261px']);
    expect([bar!.style.width, bar!.style.height]).toEqual(['89.6px', '8.8px']);
    expect(bar!.style.opacity).toBe(String(200 / 255));
    const bg = bar!.querySelector<HTMLImageElement>('img[data-piece="bg"]')!;
    expect(bg.getAttribute('src')).toBe('/assets/ui/gaupartyhpbg.png');
    const fill = bar!.querySelector<HTMLElement>('.party-hp-fill')!;
    // 112 * 115 / 230 = 56 texture px, at 0.8: 44.8 px; the picture inside it whole
    expect(fill.style.width).toBe('44.8px');
    expect(fill.querySelector<HTMLImageElement>('img')!.getAttribute('src')).toBe('/assets/ui/gaupartyhp.png');
    expect(fill.querySelector<HTMLImageElement>('img')!.style.width).toBe('89.6px');
    // 112 * 1 / 230 = 0: no fill
    expect(shown[1]!.querySelector<HTMLElement>('.party-hp-fill')!.style.width).toBe('0px');
    // a member gone hides its bar
    layer.update(camera(), [{ objectId: 9, head: [0, 0, -10], hp: 230, maxHp: 230 }], 1, 800, 600);
    expect(bars(layer).map((b) => [b.dataset.object, b.querySelector<HTMLElement>('.party-hp-fill')!.style.width])).toEqual([['9', '89.6px']]);
    layer.update(camera(), [], 1, 800, 600);
    expect(bars(layer)).toEqual([]);
    layer.dispose();
    expect(layer.element.isConnected).toBe(false);
  });
});

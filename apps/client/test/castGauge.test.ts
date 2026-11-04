// @vitest-environment jsdom
// An item cast's gauge over the own head (Piece 7 M3): CMover::RenderCasting, MoverRender.cpp:1982-2043.

import { PerspectiveCamera } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import type { UiArt } from '../src/world/hud/art';
import { CastGauge } from '../src/world/render/CastGauge';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };

/** A camera at the origin looking down -Z, with a square view. */
function camera(): PerspectiveCamera {
  const view = new PerspectiveCamera(60, 1, 0.1, 1000);
  view.updateMatrixWorld();
  view.updateProjectionMatrix();
  return view;
}

const piece = (gauge: CastGauge, name: string): HTMLImageElement =>
  gauge.element.querySelector<HTMLImageElement>(`img[data-piece="${name}"]`)!;

afterEach(() => {
  document.body.replaceChildren();
});

describe('CastGauge (CMover::RenderCasting)', () => {
  it('the gauge sits 48 px above the head and 42 px left of it, in GauAccelBG at alpha 200', () => {
    const gauge = new CastGauge(art, document);
    document.body.append(gauge.element);
    // straight ahead: the middle of an 800 x 600 view; 300 - 48 - 5 = 247, 400 - 42 = 358
    gauge.update(56, [0, 0, -10], camera(), 800, 600);
    expect(gauge.element.hidden).toBe(false);
    expect([gauge.element.style.left, gauge.element.style.top]).toEqual(['358px', '247px']);
    const bg = piece(gauge, 'bg');
    expect(bg.getAttribute('src')).toBe('/assets/ui/gauaccelbg.png');
    expect([bg.style.width, bg.style.height]).toEqual(['89.6px', '8.8px']); // 112 x 16 at 0.8 x 0.55
    expect(Number(bg.style.opacity)).toBeCloseTo(200 / 255);
    expect(piece(gauge, 'fill').getAttribute('src')).toBe('/assets/ui/gauaccelinner.png');
    gauge.dispose();
  });

  it('the fill is fill x 0.8 px wide, opaque', () => {
    const gauge = new CastGauge(art, document);
    gauge.update(56, [0, 0, -10], camera(), 800, 600);
    const fill = piece(gauge, 'fill');
    expect([fill.style.width, fill.style.height]).toEqual(['44.8px', '8.8px']);
    expect(fill.style.opacity === '' || fill.style.opacity === '1').toBe(true);
    gauge.update(112, [0, 0, -10], camera(), 800, 600);
    expect(fill.style.width).toBe('89.6px');
    gauge.update(0, [0, 0, -10], camera(), 800, 600);
    expect(fill.style.width).toBe('0px');
  });

  it('null hides it, as does a head behind the camera', () => {
    const gauge = new CastGauge(art, document);
    gauge.update(56, [0, 0, -10], camera(), 800, 600);
    gauge.update(null, [0, 0, -10], camera(), 800, 600);
    expect(gauge.element.hidden).toBe(true);
    gauge.update(56, null, camera(), 800, 600);
    expect(gauge.element.hidden).toBe(true);
    gauge.update(56, [0, 0, 10], camera(), 800, 600);
    expect(gauge.element.hidden).toBe(true);
  });
});

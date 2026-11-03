// @vitest-environment jsdom
// The wand's and the bow's charge gauge over the own head (Piece 7 M2): CMover::RenderGauge, MoverRender.cpp:925-986.

import { PerspectiveCamera } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import type { UiArt } from '../src/world/hud/art';
import { ChargeGauge } from '../src/world/render/ChargeGauge';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };

/** A camera at the origin looking down -Z, with a square view. */
function camera(): PerspectiveCamera {
  const view = new PerspectiveCamera(60, 1, 0.1, 1000);
  view.updateMatrixWorld();
  view.updateProjectionMatrix();
  return view;
}

const shown = (gauge: ChargeGauge) => [...gauge.element.querySelectorAll<HTMLImageElement>('img')]
  .filter((img) => !img.hidden).map((img) => img.dataset.piece);

afterEach(() => {
  document.body.replaceChildren();
});

describe('ChargeGauge (CMover::RenderGauge)', () => {
  it('the background always; level 4 adds tail, body2, body and head; 40 px over the head, 42 px left of it', () => {
    const gauge = new ChargeGauge(art, document);
    document.body.append(gauge.element);
    // straight ahead: the middle of an 800 x 600 view
    gauge.update(4, [0, 0, -10], camera(), 800, 600);
    expect(gauge.element.hidden).toBe(false);
    expect(shown(gauge)).toEqual(['bg', 'tail', 'body2', 'body', 'head']);
    expect([gauge.element.style.left, gauge.element.style.top]).toEqual(['358px', '255px']);
    const bg = gauge.element.querySelector<HTMLImageElement>('img[data-piece="bg"]')!;
    expect(bg.getAttribute('src')).toBe('/assets/ui/gaumagchargebg.png');
    expect([bg.style.width, bg.style.height]).toEqual(['89.6px', '8.8px']); // 112 x 16 at 0.8 x 0.55
    // the layer has the pictures' size: a box of its own, which a test (and a reader of the page) can see
    expect([gauge.element.style.width, gauge.element.style.height]).toEqual(['89.6px', '8.8px']);
    gauge.update(1, [0, 0, -10], camera(), 800, 600);
    expect(shown(gauge)).toEqual(['bg', 'head']);
    gauge.update(0, [0, 0, -10], camera(), 800, 600);
    expect(shown(gauge)).toEqual(['bg']);
    gauge.dispose();
  });

  it('hidden with no level, or no head to draw it over', () => {
    const gauge = new ChargeGauge(art, document);
    document.body.append(gauge.element);
    gauge.update(null, [0, 0, -10], camera(), 800, 600);
    expect(gauge.element.hidden).toBe(true);
    gauge.update(2, null, camera(), 800, 600);
    expect(gauge.element.hidden).toBe(true);
    gauge.dispose();
    expect(gauge.element.isConnected).toBe(false);
  });
});

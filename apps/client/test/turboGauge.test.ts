// @vitest-environment jsdom
// The turbo gauge over the own flier (Piece 7 M5, Decision 7): CMover::RenderTurboGauge, MoverRender.cpp:990-1089.

import { PerspectiveCamera } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import type { UiArt } from '../src/world/hud/art';
import { TurboGauge } from '../src/world/render/TurboGauge';

const art: UiArt = { url: (key) => `/assets/${key}`, sheets: null };

/** A camera at the origin looking down -Z, with a square view. */
function camera(): PerspectiveCamera {
  const view = new PerspectiveCamera(60, 1, 0.1, 1000);
  view.updateMatrixWorld();
  view.updateProjectionMatrix();
  return view;
}

const part = (gauge: TurboGauge, name: string): HTMLElement =>
  gauge.element.querySelector<HTMLElement>(`[data-piece="${name}"]`)!;

afterEach(() => {
  document.body.replaceChildren();
});

describe('TurboGauge (CMover::RenderTurboGauge)', () => {
  it('the gauge sits 43 px over the head', () => {
    const gauge = new TurboGauge(art, document);
    document.body.append(gauge.element);
    // straight ahead: the middle of an 800 x 600 view; (400 - 40 - 2, 300 - 40 - 3 - 2), x made even
    gauge.update(6000, false, 0, 1, [0, 0, -10], camera(), 800, 600);
    expect(gauge.element.hidden).toBe(false);
    expect([gauge.element.style.left, gauge.element.style.top]).toEqual(['358px', '255px']);
    expect(part(gauge, 'bg').getAttribute('src')).toBe('/assets/ui/gauaccelbg.png');
    gauge.update(null, false, 0, 1, [0, 0, -10], camera(), 800, 600);
    expect(gauge.element.hidden).toBe(true);
    gauge.dispose();
  });

  it('12000 ms fills it', () => {
    const gauge = new TurboGauge(art, document);
    gauge.update(12000, false, 0, 1, [0, 0, -10], camera(), 800, 600);
    expect(part(gauge, 'fill').style.width).toBe('89.6px'); // 112 x 0.8
    gauge.update(6000, false, 0, 1, [0, 0, -10], camera(), 800, 600);
    expect(part(gauge, 'fill').style.width).toBe('44.8px');
    gauge.dispose();
  });

  it('turbo flickers white on alternate frames', () => {
    const gauge = new TurboGauge(art, document);
    gauge.update(12000, true, 0, 1, [0, 0, -10], camera(), 800, 600); // g_nRenderCnt odd: the picture
    expect(part(gauge, 'fill').hidden).toBe(false);
    expect(part(gauge, 'white').hidden).toBe(true);
    gauge.update(12000, true, 0, 2, [0, 0, -10], camera(), 800, 600); // even: a white bar, (96 * v / max) * 0.8 wide
    expect(part(gauge, 'fill').hidden).toBe(true);
    expect(part(gauge, 'white').hidden).toBe(false);
    expect(part(gauge, 'white').style.width).toBe(`${Math.trunc(96 * 0.8) - 1}px`);
    gauge.dispose();
  });

  it('the speed shows beside it', () => {
    const gauge = new TurboGauge(art, document);
    gauge.update(1000, false, 173, 1, [0, 0, -10], camera(), 800, 600);
    expect(part(gauge, 'speed').textContent).toBe('173');
    gauge.dispose();
  });
});

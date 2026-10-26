// The target corners (TargetMarks): CWndWorld::RenderFocusObj, the rect of CWndWorld::GetBoundRect and the choice of
// red or white marks (Source/_Interface/WndWorld.cpp:2661-2714, 3002-3058, 3080-3165), over a recording painter and a
// real camera.

import type { Vec3 } from '@flyffweb/formats';
import { toWebPosition } from '@flyffweb/formats';
import type { ModelBox } from '@flyffweb/scene';
import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { moverMatrix } from '../src/world/render/picking';
import type { Sprite, SpritePainter } from '../src/world/render/SpriteLayer';
import { TargetMarks, attackMarks, boundRect, focusRect } from '../src/world/render/TargetMarks';
import { Belli } from '../src/world/sim/constants';
import { transformCoord } from '../src/world/sim/d3dx';

function recorder(): SpritePainter & { painted: Sprite[] } {
  return {
    painted: [],
    paint(sprites) {
      this.painted = [...sprites];
    },
  };
}

const corner = (frame: number, x: number, y: number): Sprite => ({ frame, x, y, scale: 1, alpha: 255 });

describe('TargetMarks.show (CWndWorld::RenderFocusObj, WndWorld.cpp:3080-3165)', () => {
  const rect = { left: 100, top: 50, right: 200, bottom: 150 };

  it('puts the four corners 32 px outside the rect: the white cells when selected, the red ones when attacking', () => {
    const painter = recorder();
    const marks = new TargetMarks(painter);
    marks.show(rect, false);
    // pt1 (left - 32, top - 32), pt2 (right, top - 32), pt3 (left - 32, bottom), pt4 (right, bottom); cells 0-3
    expect(painter.painted).toEqual([corner(0, 68, 18), corner(1, 200, 18), corner(2, 68, 150), corner(3, 200, 150)]);
    marks.show(rect, true);
    expect(painter.painted).toEqual([corner(8, 68, 18), corner(9, 200, 18), corner(10, 68, 150), corner(11, 200, 150)]);
  });

  it('draws nothing with no target, and the queued next target in white after the target', () => {
    const painter = recorder();
    const marks = new TargetMarks(painter);
    marks.show(rect, true);
    marks.show(null, false);
    expect(painter.painted).toEqual([]);
    marks.show(rect, true, { left: 300, top: 60, right: 340, bottom: 160 });
    expect(painter.painted).toEqual([
      corner(8, 68, 18), corner(9, 200, 18), corner(10, 68, 150), corner(11, 200, 150),
      corner(0, 268, 28), corner(1, 340, 28), corner(2, 268, 160), corner(3, 340, 160),
    ]);
    // the next target alone, the focus being off screen
    marks.show(null, false, { left: 300, top: 60, right: 340, bottom: 160 });
    expect(painter.painted.map((s) => s.frame)).toEqual([0, 1, 2, 3]);
  });
});

describe('attackMarks (the red marks of RenderFocusObj, WndWorld.cpp:3109-3110)', () => {
  const monster = { objectId: 7, added: { isPlayer: false, belligerence: Belli.ACTIVEATTACK } };
  const npc = { objectId: 8, added: { isPlayer: false, belligerence: Belli.PEACEFUL } };
  const player = { objectId: 9, added: { isPlayer: true, belligerence: Belli.PEACEFUL } };

  it('is red while the button holds the target or the player auto-attacks, on a mover that is not peaceful or a player', () => {
    expect(attackMarks(monster, null, false, false)).toBe(false);
    expect(attackMarks(monster, null, true, false)).toBe(true);
    expect(attackMarks(monster, null, false, true)).toBe(true);
    expect(attackMarks(npc, null, true, true)).toBe(false);
    expect(attackMarks(player, null, true, false)).toBe(true);
  });

  it('is white on the queued next target', () => {
    expect(attackMarks(monster, 7, true, true)).toBe(false);
    expect(attackMarks(monster, 8, true, true)).toBe(true);
  });
});

describe('boundRect (the loop of CWndWorld::GetBoundRect, WndWorld.cpp:2701-2713)', () => {
  it('takes the extremes of the projected corners, each cast to LONG (towards zero) as it is kept', () => {
    expect(boundRect([{ x: 10.7, y: 20.2 }, { x: -3.5, y: 40.9 }, { x: 55.5, y: -0.5 }])).toEqual({
      left: -3, top: 0, right: 55, bottom: 40,
    });
  });
});

describe('focusRect (GetBoundRect of the focus, and IsCull, WndWorld.cpp:3006-3020)', () => {
  const camera = new PerspectiveCamera(60, 2, 0.1, 1000);
  camera.position.set(...toWebPosition([0, 1, 0]));
  camera.lookAt(...toWebPosition([0, 1, 10]));
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  const box: ModelBox = { min: [-0.5, 0, -0.5], max: [0.5, 2, 0.5] };

  /** The screen point (CSS px, 800 x 400) of a D3D point, three's way, for an oracle. */
  const screen = (p: Vec3): { x: number; y: number } => {
    const ndc = new Vector3(...toWebPosition(p)).project(camera);
    return { x: ((ndc.x + 1) / 2) * 800, y: ((1 - ndc.y) / 2) * 400 };
  };

  it('is the rect of the box drawn where the rules have the mover: scale and turn from the drawing, the position GetPos', () => {
    const drawn = moverMatrix([1, 0, 9], 30, 1.5); // m_vScrPos, a step behind
    const at: Vec3 = [1, 0, 10]; // GetPos()
    const rect = focusRect(camera, 800, 400, box, drawn, at)!;
    const world = moverMatrix(at, 30, 1.5);
    const corners: Vec3[] = [];
    for (const x of [box.min[0], box.max[0]]) {
      for (const y of [box.min[1], box.max[1]]) for (const z of [box.min[2], box.max[2]]) corners.push(transformCoord([x, y, z], world));
    }
    expect(rect).toEqual(boundRect(corners.map(screen)));
    expect(rect.left).toBeLessThan(rect.right);
    expect(rect.top).toBeLessThan(rect.bottom);
  });

  it('is null for a box the camera does not see: all its corners outside one side of the view (IsCull)', () => {
    // behind the camera
    expect(focusRect(camera, 800, 400, box, moverMatrix([0, 0, -10], 0, 1), [0, 0, -10])).toBeNull();
    // far to the left
    expect(focusRect(camera, 800, 400, box, moverMatrix([-100, 0, 10], 0, 1), [-100, 0, 10])).toBeNull();
    // across the left edge: seen
    expect(focusRect(camera, 800, 400, box, moverMatrix([-11.5, 0, 10], 0, 1), [-11.5, 0, 10])).not.toBeNull();
  });
});

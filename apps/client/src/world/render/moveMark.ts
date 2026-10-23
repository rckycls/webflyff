// The mark on the point a tap sends the own mover to. Neuz draws the effect XI_GEN_MOVEMARK01 there
// (`CWndWorld::ControlGround`, `WndWorldControlPlayer.cpp:343-360`; `CSfxGenMoveMark`, `Sfx.cpp:479-501`): 0.05 over
// the point, turned to the face it was picked on, until its animation has played; a new tap ends the last one
// (`m_nCurFrame = 180`). Here it is a flat ring, which stays until the walk there is over, however that ends
// (arrived, a key, a stop, Leave); it is drawn over what is in front of it, so that it is not lost in a slope.

import { toWebPosition } from '@flyffweb/formats';
import type { Vec3 } from '@flyffweb/formats';
import type { Scene } from 'three';
import { DoubleSide, Mesh, MeshBasicMaterial, RingGeometry } from 'three';

/** `m_vPos.y += 0.05f` (`CSfxGenMoveMark::Render`, `Sfx.cpp:497`). */
const LIFT = 0.05;
const INNER_RADIUS = 0.3;
const OUTER_RADIUS = 0.45;
const SEGMENTS = 32;
const COLOR = 0xfff0a0;
const OPACITY = 0.85;

const f32 = Math.fround;

export class MoveMark {
  private ring: Mesh<RingGeometry, MeshBasicMaterial> | null = null;
  /** The D3D point the mark is on, while it is shown. */
  private at: Vec3 | null = null;

  constructor(private readonly scene: Scene) {}

  /**
   * Shows the mark on the D3D point `pos`, in place of the last one. The point is kept in floats, as the destination
   * keeps it (`setDestPos`), so that `follow` finds it whatever the caller gave.
   */
  show(pos: Vec3): void {
    // made on the first tap: a world screen nobody taps on draws exactly as before
    this.ring ??= new Mesh(
      new RingGeometry(INNER_RADIUS, OUTER_RADIUS, SEGMENTS).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({
        color: COLOR, transparent: true, opacity: OPACITY, side: DoubleSide, depthTest: false, depthWrite: false,
      }),
    );
    this.ring.name = 'move mark';
    this.ring.renderOrder = 1;
    const at: Vec3 = [f32(pos[0]), f32(pos[1]), f32(pos[2])];
    const [x, y, z] = toWebPosition(at);
    this.ring.position.set(x, y + LIFT, z);
    this.scene.add(this.ring);
    this.at = at;
  }

  /** Takes the mark away unless the own mover is still on its way to the mark's point (`dest`, D3D, or null). */
  follow(dest: Vec3 | null): void {
    const at = this.at;
    if (at === null) return;
    if (dest === null || dest[0] !== at[0] || dest[1] !== at[1] || dest[2] !== at[2]) this.hide();
  }

  hide(): void {
    this.ring?.removeFromParent();
    this.at = null;
  }

  dispose(): void {
    this.hide();
    this.ring?.geometry.dispose();
    this.ring?.material.dispose();
    this.ring = null;
  }
}

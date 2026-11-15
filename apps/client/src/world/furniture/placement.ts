// The furniture core's placing (2026-11-15, side-session-notes housing-research/A-client.md §2.6, §3.3): `CDeployManager`
// (`_Common/Housing.cpp:684-925`), the piece that follows the pointer on the floor until a press places it. Shared by personal
// housing and, later, the guild house (`CGuildDeployManager` is the same with its own checks).
//
//   LoadToDeploy             Housing.cpp:715-757        a copy of the control (`CreateObj( OT_CTRL, dwLinkKind )`), angle 0, its
//                                                       MODELELEM scale (`ResetScale`), drawn at blend 80
//   Process                  :838-862                   each frame: the floor under the mouse (`ClientPointToVector( ..., FALSE )`:
//                                                       the land only), red (`red.tga`, blend 110) while it collides
//   CheckCollision           :869-882                   placementRules.ts's `collides` with the room's wall `obj_miniwall01.o3d`
//   EndDeploy                :759-777                   the copy's angle and point are the request's
//   CNeuzApp::WndMsgProc     Neuz/Neuz.cpp:1343-1443    Escape ends it; Page Down +45 and Page Up -45 on the key's let-go (the
//                                                       manager's angle, set on the copy); the wheel down +2.5, up -2.5 (on
//                                                       the copy only)
//   CWndWorld                _Interface/WndWorld.cpp    a left press places it, or says TID_GAME_HOUSING_INSTALL_FAIL01 when red
//                                                       (:6814-6826); the presses move no one (:7244-7250); the wheel and
//                                                       Page Up/Down zoom no camera (:7347-7350, :8770-8800)
//
// The browser's: a finger drag moves the piece (the touches are this mode's while it runs, so no camera turns and no one
// walks); the phone has buttons for the turns, OK and Cancel (placementBar.ts).

import type { Vec3 } from '@flyffweb/protocol';
import { decodeCollisionBin, toWebPosition } from '@flyffweb/formats';
import type { Ground } from '@flyffweb/scene';
import { Group, Mesh } from 'three';
import type { Camera, Material, Object3D, Texture } from 'three';
import type { GameData } from '../gameData';
import type { DropLoader, DropModel } from '../items/groundModels';
import { pickRay } from '../render/picking';
import { clientPointToVector } from '../sim/pick';
import { HAttr } from '../sim/collision';
import { boxOf, ctrlModelOf, webTurn } from './ctrlModels';
import {
  ROOM_WALL_MODEL, collides, keptAngle, obbOf, obbTriangles, placedMatrix, worldTriangles,
} from './placementRules';
import type { ModelBox, Obb, PlacedShape, RoomShell } from './placementRules';

/** `m_nBlendFactor`: 80 while free, 110 while red, out of 255. */
export const BLEND_FREE = 80 / 255;
export const BLEND_RED = 110 / 255;
/** `red.tga` (`DIR_MODELTEX`), the colliding piece's texture. */
export const RED_TEXTURE = 'textures/red.tga.ktx2';

/** What the placing needs of the world. */
export interface PlacementHost {
  scene: Object3D;
  camera(): Camera | undefined;
  ground(): Ground | undefined;
  /** The world's `m_iMPU`. */
  mpu(): number;
  data: Pick<GameData, 'ctrls'>;
  load: DropLoader;
  /** A model's collision mesh (`collision/<stem>.bin`), null for none. Never rejects. */
  collision(modelKey: string): Promise<Float32Array | null>;
  /** The red texture (`red.tga`); its release. */
  red(): Promise<Texture | null>;
  releaseRed(): void;
  /** The other controls' boxes (`m_OBB`), `except` (the piece being moved: the guild house's reinstall) left out. */
  others(except?: number): Iterable<Obb>;
  /**
   * 2026-11-15 (guild house): the land's attribute at a point (`GetHeightAttribute`); `CGuildDeployManager::CheckCollision`
   * (Housing.cpp:1157-1167) turns red on HATTR_NOWALK, NOMOVE and NOFLY. None: never.
   */
  landAttr?(x: number, z: number): number;
}

/** What a piece is placed with besides its control: `CGuildDeployManager`'s (the guild house) differs from the room's. */
export interface PlacementOptions {
  /** The copy's first angle (`SetAngle( m_pItem->m_fAngle )`: a reinstall keeps the piece's); 0 by default. */
  angle?: number;
  /** The placed piece this one moves (`m_dwSelectedObjID`, left out of the boxes). */
  ignore?: number;
  /** The land's attributes count (the guild house). */
  land?: boolean;
}

/** `HATTR_NOWALK`, `HATTR_NOMOVE`, `HATTR_NOFLY`: no piece stands there in a guild house. */
const BLOCKING_LAND: ReadonlySet<number> = new Set([HAttr.NOWALK, HAttr.NOMOVE, HAttr.NOFLY]);

/** What a press on a free spot places: the item and the copy's point and angle (`EndDeploy`). */
export interface Placed {
  itemId: number;
  pos: Vec3;
  angle: number;
}

interface Piece {
  itemId: number;
  root: Group;
  model?: DropModel;
  box?: ModelBox;
  mesh: Float32Array | null;
  scale: number;
  /** `CDeployManager::m_fAngle`, which the Page keys step. */
  stepAngle: number;
  /** The copy's `m_fAngle` (`SetAngle` keeps it in 0..360). */
  angle: number;
  pos: Vec3 | null;
  colliding: boolean;
  /** The materials' own maps, for the free look. */
  maps: Map<Material, Texture | null>;
  red: boolean;
  options: PlacementOptions;
}

/** The wheel's step (`AddAngle( 2.5f )`) and the Page keys' (45). */
export const WHEEL_STEP = 2.5;
export const PAGE_STEP = 45;

export class FurniturePlacement {
  private piece: Piece | null = null;
  /** Where the pointer is on the drawing (normalized device coordinates), the screen's middle until it moves. */
  private ndc: [number, number] = [0, 0];
  private wall: RoomShell | null | undefined;
  private redTexture: Texture | null = null;
  private dead = false;

  constructor(private readonly host: PlacementHost) {}

  /** `IsReady()`. */
  get active(): boolean {
    return this.piece !== null;
  }

  /** The piece's item, or null. */
  get itemId(): number | null {
    return this.piece?.itemId ?? null;
  }

  /** Whether the piece stands where it collides (red). */
  get colliding(): boolean {
    return this.piece?.colliding ?? false;
  }

  /** The copy's angle and point (for the tests and the phone's bar). */
  get state(): { angle: number; pos: Vec3 | null } | null {
    return this.piece === null ? null : { angle: this.piece.angle, pos: this.piece.pos };
  }

  /** `LoadToDeploy( ctrlIndex, info )`: false when the control has no model. A piece already placing ends first. */
  start(itemId: number, ctrlIndex: number, options: PlacementOptions = {}): boolean {
    this.cancel();
    const ctrl = ctrlModelOf(this.host.data, ctrlIndex);
    if (ctrl === null) return false;
    const root = new Group();
    root.visible = false;
    root.scale.setScalar(ctrl.scale);
    this.host.scene.add(root);
    const piece: Piece = {
      itemId, root, mesh: null, scale: ctrl.scale, stepAngle: 0, angle: keptAngle(options.angle ?? 0), pos: null, colliding: false,
      maps: new Map(), red: false, options,
    };
    this.piece = piece;
    void this.host.load(ctrl.model).then((model) => {
      if (this.dead || this.piece !== piece) { model.release(); return; }
      piece.model = model;
      piece.box = boxOf(model, ctrl.model) ?? undefined;
      model.animate?.(0);
      model.root.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          piece.maps.set(material, (material as { map?: Texture | null }).map ?? null);
          material.transparent = true;
          material.depthWrite = false;
          material.opacity = BLEND_FREE;
        }
      });
      root.add(model.root);
      this.tint(piece);
    }).catch(() => { if (this.piece === piece) this.cancel(); });
    void this.host.collision(ctrl.model).then((mesh) => { if (this.piece === piece) piece.mesh = mesh; });
    void this.host.red().then((texture) => { this.redTexture = texture; if (this.piece === piece) this.tint(piece); });
    return true;
  }

  /** The pointer moved over the drawing (or a finger on it). */
  pointer(ndcX: number, ndcY: number): void {
    this.ndc = [ndcX, ndcY];
  }

  /** Page Down (`turn` 1) or Page Up (-1), on the key's let-go: the manager's angle 45 on, set on the copy. */
  step(turn: 1 | -1): void {
    const piece = this.piece;
    if (piece === null) return;
    piece.stepAngle += turn * PAGE_STEP;
    if (turn > 0 && piece.stepAngle > 359) piece.stepAngle = 0;
    if (turn < 0 && piece.stepAngle < -359) piece.stepAngle = 0;
    piece.angle = keptAngle(piece.stepAngle);
  }

  /** The wheel (`AddAngle`): down +2.5, up -2.5, on the copy only. */
  wheel(down: boolean): void {
    const piece = this.piece;
    if (piece === null) return;
    piece.angle = keptAngle(piece.angle + (down ? WHEEL_STEP : -WHEEL_STEP));
  }

  /** `Process`: the piece on the floor under the pointer, and its colour. Each frame. */
  frame(): void {
    const piece = this.piece;
    const camera = this.host.camera(), ground = this.host.ground();
    if (piece === null || camera === undefined || ground === undefined) return;
    const ray = pickRay(camera, this.ndc[0], this.ndc[1]);
    // ClientPointToVector( ..., bObject FALSE ): the land only
    const land = { terrainHeight: (x: number, z: number) => ground.terrainHeight(x, z), objectsNear: () => [] } as unknown as Ground;
    const pos = ray === null ? null : clientPointToVector(ray.orig, ray.dir, land, this.host.mpu());
    if (pos !== null) piece.pos = pos;
    if (piece.pos === null) return;
    piece.root.position.set(...toWebPosition(piece.pos));
    piece.root.rotation.y = webTurn(piece.angle);
    piece.root.visible = piece.model !== undefined;
    const colliding = this.check(piece);
    if (colliding !== piece.colliding) { piece.colliding = colliding; this.tint(piece); }
  }

  /** `CheckCollision`: false until the piece's box is known, and without the room's wall. */
  private check(piece: Piece): boolean {
    if (piece.box === undefined || piece.pos === null) return false;
    const wall = this.roomWall(piece.pos);
    if (wall === null) return false; // m_pWallObj NULL: never
    if (piece.options.land === true && BLOCKING_LAND.has(this.host.landAttr?.(piece.pos[0], piece.pos[2]) ?? 0)) return true;
    const matrix = placedMatrix(piece.scale, piece.angle, piece.pos);
    const obb = obbOf(piece.box, matrix);
    const shape: PlacedShape = { obb, triangles: piece.mesh === null ? obbTriangles(obb) : worldTriangles(piece.mesh, matrix) };
    return collides(shape, wall, this.host.others(piece.options.ignore));
  }

  /** `GetObjByName("obj_miniwall01.o3d")` near the piece, once a world: its box and triangles in the world. */
  private roomWall(at: Vec3): RoomShell | null {
    if (this.wall !== undefined) return this.wall;
    const ground = this.host.ground();
    const object = ground?.objectsNear(at[0], at[2], 64).find((o) => o.model === ROOM_WALL_MODEL);
    if (object === undefined) return null; // the tiles may not be in yet: asked again next frame
    const t = object.triangles;
    const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i + 2 < t.length; i += 3) {
      for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a]!, t[i + a]!); max[a] = Math.max(max[a]!, t[i + a]!); }
    }
    this.wall = t.length < 9 ? null : { obb: obbOf({ min, max }, object.matrix), triangles: worldTriangles(t, object.matrix) };
    return this.wall;
  }

  /** `ChangeObjMode( RED_MODE | NORMAL_MODE )`: the red texture at blend 110, or the own maps at 80. */
  private tint(piece: Piece): void {
    const red = piece.colliding && this.redTexture !== null;
    if (red === piece.red && piece.model !== undefined) return;
    piece.red = red;
    for (const [material, map] of piece.maps) {
      const m = material as Material & { map?: Texture | null };
      m.map = red ? this.redTexture : map;
      m.opacity = piece.colliding ? BLEND_RED : BLEND_FREE;
      m.needsUpdate = true;
    }
  }

  /**
   * A left press on the world: `collide` while red (it stays), else the piece ends and what to place comes back; null when
   * nothing is being placed or the piece is not on the floor yet.
   */
  confirm(): Placed | 'collide' | null {
    const piece = this.piece;
    if (piece === null) return null;
    if (piece.colliding) return 'collide';
    if (piece.pos === null) return null;
    const placed: Placed = { itemId: piece.itemId, pos: [...piece.pos], angle: piece.angle };
    this.end();
    return placed;
  }

  /** Escape, Cancel, or Install while placing: `EndDeploy` without a request. */
  cancel(): void {
    this.end();
  }

  private end(): void {
    const piece = this.piece;
    if (piece === null) return;
    this.piece = null;
    for (const [material, map] of piece.maps) (material as { map?: Texture | null }).map = map;
    piece.root.removeFromParent();
    piece.model?.release();
  }

  /** The world goes: the piece ends, the red texture is let go. */
  dispose(): void {
    this.end();
    this.dead = true;
    if (this.redTexture !== null) this.host.releaseRed();
    this.redTexture = null;
  }
}

/** A control's collision mesh from the store (`collision/<stem>.bin` of `models/<stem>.glb`), null for none or a bad one. */
export async function loadCollisionMesh(
  store: { url(key: string): string | null; bytes(key: string): Promise<Uint8Array> }, modelKey: string,
): Promise<Float32Array | null> {
  const match = /^models\/(.+)\.glb$/.exec(modelKey);
  if (match === null) return null;
  const key = `collision/${match[1]}.bin`;
  if (store.url(key) === null) return null;
  try {
    return decodeCollisionBin(await store.bytes(key), key);
  } catch {
    return null;
  }
}

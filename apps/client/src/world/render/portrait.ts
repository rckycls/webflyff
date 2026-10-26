// The own character's face in the status window (spec §3.9): a small picture of the head, drawn once with the page's
// renderer, as `CWndStatus::OnDraw` draws `g_pBipedMesh` in its face box (`Source/_Interface/WndField.cpp:10640-10931`):
// - the model of the player's body dressed as the player (`OnInitialUpdate`, :11250-11256: `MI_MALE` / `MI_FEMALE` with
//   `UpdateParts`), in the first frame of its standing motion (motion 0, never moved on);
// - an orthographic projection `D3DXMatrixOrthoLH( h * aspect, h, ... )` with `h = cos( fov / 2 ) / sin( fov / 2 )`,
//   `fov = D3DX_PI / 4` (:10672-10679), seen from (0, 0.7, -3.5) towards (0, 0, 3) (:10712-10714);
// - the model scaled 6, turned by `D3DXMatrixRotationY( -20 degrees )` and lowered 7.8 (:10716-10719), so that the head
//   fills the box;
// - no lighting (`SetLight( FALSE )`, diffuse and ambient 1, :10934-10937): each part's texture as it is; only the depth is
//   cleared (:10728), so the window's picture shows around the head.
// It is drawn into a render target and read back to a 2D canvas, not every frame: on entering (and when the look
// changes, which no Piece 4 message does).

import type { AssembledCharacter, LoopedMotion } from '@flyffweb/scene';
import type { Material, Object3D, Texture, WebGLRenderer } from 'three';
import {
  Color, Mesh, MeshBasicMaterial, OrthographicCamera, SRGBColorSpace, Scene, WebGLRenderTarget,
} from 'three';

/** The face box (`WIDC_CUSTOM6`, `Resource/resdata.inc:3405`): 64 x 68. */
export const FACE_WIDTH = 64;
export const FACE_HEIGHT = 68;
/** `h = cos( fov / 2 ) / sin( fov / 2 )` with `fov = D3DX_PI / 4`: the height the projection sees. */
const VIEW_HEIGHT = Math.cos(Math.PI / 8) / Math.sin(Math.PI / 8);
/** `CWorld::m_fNearPlane - 0.01f` and `m_fFarPlane`: wide enough for a head 3.5 m away. */
const NEAR = 0.1;
const FAR = 100;
/** The model's matrix: scale 6, `RotationY( D3DXToRadian( -20 ) )`, translation (0, -7.8, 0) (`:10716-10719`). */
const SCALE = 6;
/** A D3D turn of -20 degrees about Y is +20 in the web's mirrored Z (as `MoverViews` turns a mover by `+angle`). */
const TURN = (20 * Math.PI) / 180;
const DROP = -7.8;
/** Where the camera is and what it looks at (D3D (0, 0.7, -3.5) and (0, 0, 3), Z mirrored). */
const EYE = [0, 0.7, 3.5] as const;
const LOOK_AT = [0, 0, -3] as const;

/** Each part's material made unlit: its texture as it is (`SetLight( FALSE )`), the hair's tint (already unlit) kept. */
function unlit(root: Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    object.frustumCulled = false;
    const swap = (old: Material): Material => {
      if (old instanceof MeshBasicMaterial) return old;
      const { map } = old as Material & { map?: Texture | null };
      const basic = new MeshBasicMaterial({
        name: old.name, map: map ?? null, transparent: old.transparent, opacity: old.opacity, alphaTest: old.alphaTest,
        side: old.side, depthWrite: old.depthWrite,
      });
      old.dispose(); // the texture is the cache's: the model's release gives it back
      return basic;
    };
    object.material = Array.isArray(object.material) ? object.material.map(swap) : swap(object.material);
  });
}

/**
 * Draws `model` (the own look, loaded for this picture alone: it is changed, and its owner releases it after) in the first
 * frame of `motion` (its standing motion; none leaves its bind pose) with `renderer`, and gives the picture as a canvas
 * of 64 x 68 CSS pixels at the renderer's pixel ratio. The renderer's target and clear colour are as they were after.
 */
export function renderPortrait(
  renderer: WebGLRenderer, model: AssembledCharacter, motion: LoopedMotion | null, doc: Document,
): HTMLCanvasElement {
  const ratio = renderer.getPixelRatio();
  const width = Math.round(FACE_WIDTH * ratio);
  const height = Math.round(FACE_HEIGHT * ratio);

  const { root } = model;
  unlit(root);
  root.scale.setScalar(SCALE);
  root.rotation.set(0, TURN, 0);
  root.position.set(0, DROP, 0);
  if (motion !== null) {
    model.mixer.clipAction(motion.clip).play();
    model.mixer.setTime(motion.frameTime(0));
  }
  const scene = new Scene();
  scene.add(root);
  const viewWidth = VIEW_HEIGHT * (FACE_WIDTH / FACE_HEIGHT);
  const camera = new OrthographicCamera(-viewWidth / 2, viewWidth / 2, VIEW_HEIGHT / 2, -VIEW_HEIGHT / 2, NEAR, FAR);
  camera.position.set(...EYE);
  camera.lookAt(...LOOK_AT);

  const target = new WebGLRenderTarget(width, height);
  target.texture.colorSpace = SRGBColorSpace;
  const pixels = new Uint8Array(width * height * 4);
  const oldTarget = renderer.getRenderTarget();
  const oldColor = renderer.getClearColor(new Color());
  const oldAlpha = renderer.getClearAlpha();
  try {
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
  } finally {
    renderer.setRenderTarget(oldTarget);
    renderer.setClearColor(oldColor, oldAlpha);
    target.dispose();
    scene.remove(root);
  }

  const canvas = doc.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${FACE_WIDTH}px`;
  canvas.style.height = `${FACE_HEIGHT}px`;
  const context = canvas.getContext('2d');
  if (context === null) return canvas;
  const image = context.createImageData(width, height);
  // the target's rows go up from the bottom; what was drawn is opaque, as with blending off (:10727)
  for (let y = 0; y < height; y++) {
    const from = (height - 1 - y) * width * 4;
    const to = y * width * 4;
    for (let i = 0; i < width * 4; i += 4) {
      const alpha = pixels[from + i + 3]!;
      image.data[to + i] = pixels[from + i]!;
      image.data[to + i + 1] = pixels[from + i + 1]!;
      image.data[to + i + 2] = pixels[from + i + 2]!;
      image.data[to + i + 3] = alpha === 0 ? 0 : 255;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

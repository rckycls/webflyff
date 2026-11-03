// What a hit does to how a model is drawn, besides its motion:
//
// - **The flash** (`_SPARKINFO`, Source/_Common/Model.h:60-69, the model's `m_SparkInfo`): a blow lights the victim's
//   model, and a blow that lands the attacker's, from the other one's side (`CMover::OnDamage`,
//   _Common/MoverActEvent.cpp:1522-1538, and `OnAttackMelee`, :1704-1717). It holds for its first step, then fades 0.05
//   a step until it is below 0 (`CMover::ProcessETC`, _Common/Mover.cpp:3248-3262): 20 steps drawn. While it is on,
//   `CModelObject::Render` (_Common/ModelObject.cpp:1194-1201) gives each part the spark's light instead of the sun's:
//   `SetLightVec( m_v3SparkDir )` and `SetDiffuse` of `D3DXVec3Lerp( 0, m_v3Color, m_fLerp )`, the colour (2, 2, 2). Only
//   the skinned parts read those (the skinning vertex shader's constants c92 and c93, `CObject3D::RenderSkin`,
//   _Common/Object3D.cpp:3025-3080, and its `dp3 r1.x, r3, -c92`); the others (`RenderNormal`, :3339, a held weapon among
//   them) are drawn with the fixed-function lights, which the spark leaves alone. The shader adds the ambient and keeps
//   the result at most 1 (`min oD0, r2, c95.x`), so the flash brings the lit side up to the texture's own colour.
// - **The shake** (`m_nDmgCnt`): 10 from a blow that landed (`CActionMover::OnDamageMsgC`,
//   _AIInterface/ActionMoverDmg.cpp:118), one less a step (`CMover::Process`, Mover.cpp:3526-3527); while it is above 0
//   a mover that is not a player, and not a `RANK_SUPER` boss, is drawn off its place by (cx, 0, cz) / 100 m, cx and cz
//   from -25 + `xRandom( 50 )` anew each drawn frame (`CMover::Render`, _Common/MoverRender.cpp:286-296).
//
// Here the spark's light is a change to the lighting of the converted models' skinned parts (MeshStandardMaterial):
// three's directional light (the stage has one, the sun) becomes the spark's while it is on, and the diffuse light is
// kept at most the texture's colour then. The rest of the lighting is Piece 3's.

import type { Vec3 } from '@flyffweb/formats';
import { toWebPosition } from '@flyffweb/formats';
import type { IUniform, Material, Object3D } from 'three';
import { Color, SRGBColorSpace, ShaderChunk, SkinnedMesh, Vector3 } from 'three';

const f32 = Math.fround;

/** `m_v3Color` of every spark: (2.0f, 2.0f, 2.0f) (`MoverActEvent.cpp:1529-1531`, :1710-1712). */
const SPARK_COLOR = 2;
/** `m_fLerp -= 0.05f` a step (`Mover.cpp:3253`). */
const SPARK_FADE = f32(0.05);
/** `m_nDmgCnt = 10` (`ActionMoverDmg.cpp:118`): the steps a blow shakes the mover for. */
export const DAMAGE_SHAKE_TICKS = 10;
/** `-25 + xRandom( 50 )` (`MoverRender.cpp:291-292`), over `100.0f`. */
const SHAKE_RANGE = 50;
const SHAKE_FROM = -25;

/** `m_v3Color` of a hit's spark, and (Piece 7 M2) of a cast's: cyan (`ActionMoverState.cpp:714-724`). */
export const SPARK_WHITE: Vec3 = [2, 2, 2];
export const SPARK_CAST: Vec3 = [0, 2, 2];

/** `_SPARKINFO` of a model. */
export interface SparkInfo {
  /** `m_bUsed`. */
  used: boolean;
  /** `m_v3SparkDir`: the way the light goes (D3D, a unit vector), from the other mover to this one. */
  direction: Vec3;
  /** `m_fLerp`. */
  lerp: number;
  /** `m_nCnt`. */
  cnt: number;
  /** `m_v3Color`: a hit's (2, 2, 2); a cast's (0, 2, 2) (Piece 7 M2). */
  color: Vec3;
}

/** A model's spark before any hit: off (`_SPARKINFO()`: `m_nCnt` 0, `m_fLerp` 1.0). */
export function idleSpark(): SparkInfo {
  return { used: false, direction: [0, 0, 0], lerp: 1, cnt: 0, color: SPARK_WHITE };
}

/**
 * A hit's spark (`MoverActEvent.cpp:1527-1537`, :1708-1716): on, at 1.0, its count at 0, its direction the normalized
 * `GetPos() - pOther->GetPos()`. A new one replaces one that fades.
 */
export function startSpark(spark: SparkInfo, direction: Vec3, color: Vec3 = SPARK_WHITE): void {
  spark.used = true;
  spark.color = color;
  spark.direction = [direction[0], direction[1], direction[2]];
  spark.lerp = 1;
  spark.cnt = 0;
}

/**
 * One step of `CMover::ProcessETC` (`Mover.cpp:3248-3262`): while it is on, from its second step it fades by `0.05f`, and
 * goes off below 0; each step on is counted.
 */
export function stepSpark(spark: SparkInfo): void {
  if (!spark.used) return;
  if (spark.cnt !== 0) {
    spark.lerp = f32(spark.lerp - SPARK_FADE);
    if (spark.lerp < 0) spark.used = false;
  }
  spark.cnt++;
}

/** The diffuse light of a spark: `D3DXVec3Lerp( 0, m_v3Color, m_fLerp )`, `0 + s * (2 - 0)` in floats (one channel). */
export function sparkDiffuse(spark: SparkInfo): number {
  return f32(spark.lerp * SPARK_COLOR);
}

/** The uniforms a model's lit skinned parts share: whether the spark is on, where its light comes from, its colour. */
export interface SparkUniforms {
  sparkOn: IUniform<boolean>;
  /** Toward the light, in the web's world axes: minus `m_v3SparkDir`, as the shader takes `-c92`. */
  sparkDirection: IUniform<Vector3>;
  /** The diffuse light, as the stage gives the sun's: the D3D grey as sRGB, times pi for three's Lambert. */
  sparkColor: IUniform<Color>;
}

export function sparkUniforms(): SparkUniforms {
  return { sparkOn: { value: false }, sparkDirection: { value: new Vector3(0, 1, 0) }, sparkColor: { value: new Color(0) } };
}

/** Puts a model's spark into its uniforms, for the frame about to be drawn. */
export function setSparkUniforms(uniforms: SparkUniforms, spark: SparkInfo): void {
  uniforms.sparkOn.value = spark.used;
  if (!spark.used) return;
  const [x, y, z] = toWebPosition([-spark.direction[0], -spark.direction[1], -spark.direction[2]]);
  // + 0: no negative zero
  uniforms.sparkDirection.value.set(x + 0, y + 0, z + 0);
  // D3DXVec3Lerp( 0, m_v3Color, m_fLerp ), channel by channel
  const [r, g, b] = spark.color.map((c) => f32(spark.lerp * c)) as [number, number, number];
  uniforms.sparkColor.value.setRGB(r, g, b, SRGBColorSpace).multiplyScalar(Math.PI);
}

const DIRECTIONAL_LIGHT = 'getDirectionalLightInfo( directionalLight, directLight );';

/** Three's lighting with the directional light turned into the spark's while it is on (`SetLightVec`, `SetDiffuse`). */
const SPARK_LIGHTS = ShaderChunk.lights_fragment_begin.replace(
  DIRECTIONAL_LIGHT,
  `${DIRECTIONAL_LIGHT}
		if ( sparkOn ) {
			directLight.direction = normalize( ( viewMatrix * vec4( sparkDirection, 0.0 ) ).xyz );
			directLight.color = sparkColor;
		}`,
);

const SPARK_DECLARATIONS = `
uniform bool sparkOn;
uniform vec3 sparkDirection;
uniform vec3 sparkColor;`;

/** `min oD0, r2, c95.x`: the light of a vertex, ambient and diffuse, is at most 1, while the spark is on. */
const SPARK_CLAMP = `
	if ( sparkOn ) {
		reflectedLight.directDiffuse =
			min( reflectedLight.directDiffuse + reflectedLight.indirectDiffuse, material.diffuseColor )
			- reflectedLight.indirectDiffuse;
	}`;

/** The one program every lit part with a spark is drawn with: the same code, each material's own uniforms. */
const PROGRAM_KEY = 'flyff-spark';

/**
 * Lets the spark light the skinned parts under `root` that are lit as the converted models are (MeshStandardMaterial):
 * their materials take `uniforms` (shared by the model's parts) and three's lighting with the spark in it. Other meshes,
 * and unlit or other materials (the hair, the placeholder), are left as they are.
 */
export function lightWithSpark(root: Object3D, uniforms: SparkUniforms): void {
  root.traverse((object) => {
    if (!(object instanceof SkinnedMesh)) return;
    const materials: Material[] = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material as Material & { isMeshStandardMaterial?: boolean }).isMeshStandardMaterial) continue;
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>${SPARK_DECLARATIONS}`)
          .replace('#include <lights_fragment_begin>', SPARK_LIGHTS)
          .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>${SPARK_CLAMP}`);
      };
      material.customProgramCacheKey = () => PROGRAM_KEY;
      material.needsUpdate = true;
    }
  });
}

/**
 * The shake's offset of one drawn frame (`MoverRender.cpp:289-294`): (cx, 0, cz) / 100 in D3D, cx and cz
 * `-25 + xRandom( 50 )` in that order. `random( n )` is `xRandom( n )`: 0 to n - 1.
 */
export function shakeOffset(random: (n: number) => number): Vec3 {
  const cx = SHAKE_FROM + random(SHAKE_RANGE);
  const cz = SHAKE_FROM + random(SHAKE_RANGE);
  return [f32(cx / 100), 0, f32(cz / 100)];
}

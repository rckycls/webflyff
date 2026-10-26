// A hit's flash on a model and a monster's shake (render/sparks): `_SPARKINFO` set as CMover::OnDamage and OnAttackMelee
// set it, faded as CMover::ProcessETC fades it, and drawn as CModelObject::Render draws it (the light of its skinned
// parts turned to the spark's direction and colour); `m_nDmgCnt`'s offset, as CMover::Render draws it.

import type { Vec3 } from '@flyffweb/formats';
import {
  Color, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, MeshStandardMaterial, SRGBColorSpace, ShaderChunk, ShaderLib,
  SkinnedMesh, Vector3,
} from 'three';
import type { Material, WebGLProgramParametersWithUniforms, WebGLRenderer } from 'three';
import { describe, expect, it } from 'vitest';
import {
  DAMAGE_SHAKE_TICKS, idleSpark, lightWithSpark, setSparkUniforms, shakeOffset, sparkDiffuse, sparkUniforms, startSpark,
  stepSpark,
} from '../src/world/render/sparks';

const f32 = Math.fround;

describe('the spark (_SPARKINFO, Model.h:60-69)', () => {
  it('starts on, at 1.0, with its count at 0 (MoverActEvent.cpp:1527-1537)', () => {
    const spark = idleSpark();
    expect(spark.used).toBe(false);
    startSpark(spark, [1, 0, 0]);
    expect(spark).toEqual({ used: true, direction: [1, 0, 0], lerp: 1, cnt: 0 });
  });

  it('keeps 1.0 for its first step, then fades 0.05f a step, and is off once below 0: 20 steps drawn (Mover.cpp:3248-3262)', () => {
    const spark = idleSpark();
    startSpark(spark, [0, 0, 1]);
    const drawn: number[] = [];
    let lerp = 1;
    const expected: number[] = [];
    for (let step = 1; step <= 25; step++) {
      stepSpark(spark);
      if (step > 1) lerp = f32(lerp - f32(0.05));
      if (lerp >= 0) expected.push(f32(lerp * 2));
      if (spark.used) drawn.push(sparkDiffuse(spark));
    }
    // D3DXVec3Lerp( 0, (2, 2, 2), m_fLerp ): 2.0, 1.9 ... about 0.1, in floats
    expect(drawn).toEqual(expected);
    expect(drawn).toHaveLength(20);
    expect(drawn[0]).toBe(2);
    expect(spark.cnt).toBe(21); // counted while on
  });

  it('starts over at a new hit while it fades', () => {
    const spark = idleSpark();
    startSpark(spark, [0, 0, 1]);
    for (let i = 0; i < 5; i++) stepSpark(spark);
    startSpark(spark, [-1, 0, 0]);
    stepSpark(spark);
    expect(spark).toEqual({ used: true, direction: [-1, 0, 0], lerp: 1, cnt: 1 });
  });
});

describe("the spark's light (CModelObject::Render, ModelObject.cpp:1194-1201, and the skinning shader's lighting)", () => {
  it('lights from where the blow came: the light the shader takes is minus the spark direction (dp3 r1.x, r3, -c92), in web axes', () => {
    const uniforms = sparkUniforms();
    const spark = idleSpark();
    // a victim hit by an attacker west of it: m_v3SparkDir points east (D3D +x), the light comes from the west
    startSpark(spark, [1, 0, 0]);
    setSparkUniforms(uniforms, spark);
    expect(uniforms.sparkOn.value).toBe(true);
    expect(uniforms.sparkDirection.value.toArray()).toEqual([-1, 0, 0]);
    // D3D +z is web -z: a spark along D3D +z lights from web +z
    startSpark(spark, [0, 0, 1]);
    setSparkUniforms(uniforms, spark);
    expect(uniforms.sparkDirection.value.toArray()).toEqual([0, 0, 1]);
  });

  it('is the diffuse D3DXVec3Lerp gives, a grey as the sun is given (sRGB, times pi for three\'s Lambert), and off once the spark is', () => {
    const uniforms = sparkUniforms();
    const spark = idleSpark();
    startSpark(spark, [1, 0, 0]);
    stepSpark(spark);
    stepSpark(spark);
    setSparkUniforms(uniforms, spark);
    const level = f32(f32(0.95) * 2);
    const expected = new Color().setRGB(level, level, level, SRGBColorSpace).multiplyScalar(Math.PI);
    expect(uniforms.sparkColor.value.r).toBeCloseTo(expected.r, 6);
    for (let i = 0; i < 25; i++) stepSpark(spark);
    setSparkUniforms(uniforms, spark);
    expect(uniforms.sparkOn.value).toBe(false);
  });

  /** What three hands `onBeforeCompile` for a MeshStandardMaterial: its own uniforms and the standard shader's source. */
  const compile = (material: Material): WebGLProgramParametersWithUniforms => {
    const shader = {
      uniforms: {}, vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader,
    } as unknown as WebGLProgramParametersWithUniforms;
    material.onBeforeCompile(shader, {} as WebGLRenderer);
    return shader;
  };

  it("turns the light of the model's skinned meshes only (the skinning shader's constants, Object3D.cpp:3080), not of the rest", () => {
    const uniforms = sparkUniforms();
    const root = new Group();
    const skinned = new SkinnedMesh(undefined, new MeshStandardMaterial());
    const plain = new Mesh(undefined, new MeshStandardMaterial()); // a held item: fixed-function lights (RenderNormal)
    const hair = new SkinnedMesh(undefined, new MeshBasicMaterial()); // drawn unlit
    const placeholder = new SkinnedMesh(undefined, new MeshLambertMaterial());
    root.add(skinned, plain, hair, placeholder);
    lightWithSpark(root, uniforms);

    const shader = compile(skinned.material as Material);
    expect(shader.uniforms.sparkOn).toBe(uniforms.sparkOn);
    expect(shader.uniforms.sparkDirection).toBe(uniforms.sparkDirection);
    expect(shader.uniforms.sparkColor).toBe(uniforms.sparkColor);
    expect(shader.fragmentShader).toContain('uniform bool sparkOn;');
    // the sun's light replaced by the spark's while it is on (SetLightVec, SetDiffuse)
    expect(shader.fragmentShader).toContain('directLight.direction = normalize( ( viewMatrix * vec4( sparkDirection, 0.0 ) ).xyz );');
    expect(shader.fragmentShader).toContain('directLight.color = sparkColor;');
    expect(shader.fragmentShader).not.toContain('#include <lights_fragment_begin>');
    // `min oD0, r2, c95.x`: the light of a vertex is at most 1
    expect(shader.fragmentShader).toContain('min( reflectedLight.directDiffuse + reflectedLight.indirectDiffuse, material.diffuseColor )');
    expect((skinned.material as Material).customProgramCacheKey()).toBe('flyff-spark');

    for (const other of [plain, hair, placeholder]) {
      expect(compile(other.material as Material).fragmentShader).not.toContain('sparkOn');
    }
  });

  it("finds three's directional light in its lighting chunk (an upgrade that moves it would leave the spark out)", () => {
    expect(ShaderChunk.lights_fragment_begin).toContain('getDirectionalLightInfo( directionalLight, directLight );');
    expect(ShaderLib.standard.fragmentShader).toContain('#include <lights_fragment_begin>');
    expect(ShaderLib.standard.fragmentShader).toContain('#include <lights_fragment_end>');
  });
});

describe("the monster's shake (m_nDmgCnt: ActionMoverDmg.cpp:118, Mover.cpp:3526-3527, MoverRender.cpp:286-296)", () => {
  it('lasts 10 steps from a hit', () => {
    expect(DAMAGE_SHAKE_TICKS).toBe(10);
  });

  it('moves the model (cx, 0, cz) / 100 with cx and cz from -25 + xRandom( 50 ), x first', () => {
    const draws: number[] = [];
    const random = (n: number): number => {
      draws.push(n);
      return draws.length === 1 ? 0 : 49;
    };
    const offset: Vec3 = shakeOffset(random);
    expect(draws).toEqual([50, 50]);
    expect(offset).toEqual([f32(-25 / 100), 0, f32(24 / 100)]);
    expect(new Vector3(...offset).length()).toBeLessThan(0.36);
  });
});

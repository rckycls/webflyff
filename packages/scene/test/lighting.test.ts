// 2026-11-15 (post-merge): an indoor world's own light (CWorld::SetLight's indoor branch, World3D.cpp:1837-1893).
import { describe, expect, it } from 'vitest';
import { indoorLight, noonLight, rgbLight, stageLight } from '../src/world/lighting';

const f32 = Math.fround;

describe('indoorLight', () => {
  it('the personal room (WdMiniroom.wld: ambient 0xffffffff, diffuse 0xffc8c8c8, lightDir 0 -1 0) is lit fully', () => {
    // ambient 1 * 0.9f, plus D3DRS_AMBIENT 229/255: past 1, so D3D's clamp gives the texture as it is and the light adds nothing
    const light = indoorLight(0xffffffff, 0xffc8c8c8, [0, -1, 0]);
    expect(light.ambient).toEqual([1, 1, 1]);
    expect(light.sunColor).toEqual([0, 0, 0]);
    expect(light.sunDirection).toEqual([0, 1, 0]);
  });

  it('a coloured light below 1: the bytes over 255, diffuse + 0.1f, ambient * 0.9f plus its byte, along lightDir', () => {
    // DuFlMas.wld: ambient 0xff808080, diffuse 0xff464678, lightDir 0 0.8 0.2
    const light = indoorLight(0xff808080, 0xff464678, [0, 0.8, 0.2]);
    const a = f32(f32(128 / 255) * f32(0.9));
    expect(light.ambient).toEqual([115 / 255 + a, 115 / 255 + a, 115 / 255 + a]);
    expect(light.sunColor).toEqual([f32(f32(0x46 / 255) + f32(0.1)), f32(f32(0x46 / 255) + f32(0.1)), f32(f32(0x78 / 255) + f32(0.1))]);
    const length = Math.hypot(0.8, 0.2);
    expect(light.sunDirection[0]).toBe(0);
    expect(light.sunDirection[1]).toBeCloseTo(-0.8 / length, 6);
    expect(light.sunDirection[2]).toBeCloseTo(0.2 / length, 6);
  });

  it('no light direction (the small guild house): the indoor ambient, the light before (noon) for the rest', () => {
    const light = indoorLight(0xff808080, 0, [0, 0, 0]);
    const a = f32(f32(128 / 255) * f32(0.9));
    expect(light.ambient[0]).toBe(115 / 255 + a);
    expect(light.sunColor).toEqual([noonLight().sunColor, noonLight().sunColor, noonLight().sunColor]);
    expect(light.sunDirection).toEqual(noonLight().sunDirection);
  });
});

describe('stageLight', () => {
  const room = { indoor: true, ambient: 0xffffffff, diffuse: 0xffc8c8c8, lightDir: [0, -1, 0] as [number, number, number] };

  it('the indoor light only when asked, for an indoor manifest that carries it; else noon', () => {
    expect(stageLight(room, true).ambient).toEqual([1, 1, 1]);
    expect(stageLight(room, false)).toEqual(rgbLight(noonLight()));
    expect(stageLight({ ...room, indoor: false }, true)).toEqual(rgbLight(noonLight()));
    expect(stageLight({ indoor: true, ambient: 0xffffffff }, true)).toEqual(rgbLight(noonLight())); // converted before
  });
});

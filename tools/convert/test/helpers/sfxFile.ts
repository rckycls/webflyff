// Hand-made `.sfx` files (version 0.2) for the effects-stage tests, laid out as CSfxBase::Load and the parts' Load2 read
// them (Source/_Common/sfxbase.cpp:1719). The reader's own byte-level tests are in packages/formats/test/sfx.test.ts.

import { Bytes } from '../../../../packages/formats/test/helpers/bytes';

export interface TestSfxPart {
  /** SFXPARTTYPE: 1 BILL, 2 PARTICLE, 3 MESH, 4 CUSTOMMESH. */
  type: 1 | 2 | 3 | 4;
  /** The texture file name, or a MESH part's model file name. */
  texture: string;
  texFrame?: number;
  texLoop?: number;
  using?: boolean;
  /** Frames of the part's keys (each key is filled with its frame number, so the parts are told apart). */
  frames?: number[];
}

const putString = (b: Bytes, text: string): Bytes => b.i32(text.length).raw(Uint8Array.from(text, (c) => c.charCodeAt(0)));

/** The particle block of CSfxPartParticle::Load2 with every number zero. */
function putEmptyParticle(b: Bytes): Bytes {
  // 5 WORDs, 6 floats, accel/scale/scaleSpeed, rotation/rotationLow/rotationHigh, repeatScal, 6 floats, scaleSpeed2, scaleEnd
  return b.zeros(5 * 2 + 6 * 4 + 3 * 12 + 3 * 12 + 4 + 6 * 4 + 2 * 12);
}

export function sfx02(parts: TestSfxPart[]): Uint8Array {
  const b = new Bytes();
  for (const c of 'SFX0.2  ') b.u8(c.charCodeAt(0));
  b.i32(parts.length);
  for (const part of parts) {
    b.i32(part.type);
    putString(b, 'label');
    putString(b, part.texture);
    b.u16(part.texFrame ?? 1).u16(part.texLoop ?? 1).i32(part.using === false ? 0 : 1);
    b.i32(1).i32(2); // BILL, GLOW
    if (part.type === 2) putEmptyParticle(b);
    const frames = part.frames ?? [0, 30];
    b.i32(frames.length);
    for (const frame of frames) {
      b.u16(frame);
      for (let i = 0; i < 12; i++) b.f32(frame + i / 8); // pos, posRotate, scale, rotate
      b.i32(255);
    }
    if (part.type === 4) b.i32(20);
  }
  return b.build();
}

// The create screen's choices, from `Resource/defineNeuz.h` and `Source/_Common/MoverEquip.cpp:43-67`.

/** How many hair styles and faces the create screen offers. */
export const HAIR_MESH_COUNT = 5;
export const HEAD_MESH_COUNT = 5;

export const Sex = { MALE: 0, FEMALE: 1 } as const;

/** Every new character starts as a Vagrant. */
export const JOB_VAGRANT = 0;

// `nMaleHairColor` and `nFeMaleHairColor`, the first HAIR_MESH_COUNT rows: the colour of each hair style, as RGB.
const MALE_HAIR_RGB: readonly (readonly [number, number, number])[] = [
  [144, 99, 101], [100, 107, 125], [158, 119, 109], [199, 156, 100], [100, 123, 117],
];
const FEMALE_HAIR_RGB: readonly (readonly [number, number, number])[] = [
  [250, 250, 90], [250, 250, 90], [147, 118, 103], [150, 100, 85], [213, 130, 100],
];

/** The hair colour a hair style gets, as the opaque 0xAARRGGBB number CREATE_PLAYER carries. */
export function hairColorFor(sex: number, hairMesh: number): number {
  if (sex !== Sex.MALE && sex !== Sex.FEMALE) throw new RangeError(`unknown sex ${sex}`);
  if (!Number.isInteger(hairMesh) || hairMesh < 0 || hairMesh >= HAIR_MESH_COUNT) {
    throw new RangeError(`hair style ${hairMesh} is outside 0..${HAIR_MESH_COUNT - 1}`);
  }
  const [r, g, b] = (sex === Sex.MALE ? MALE_HAIR_RGB : FEMALE_HAIR_RGB)[hairMesh]!;
  return (0xff000000 | r << 16 | g << 8 | b) >>> 0;
}

// The create screen's choices, from `Resource/defineNeuz.h` and `Source/_Common/MoverEquip.cpp:43-67`.

/** How many hair styles and faces the create screen offers. */
export const HAIR_MESH_COUNT = 5;
export const HEAD_MESH_COUNT = 5;

export const Sex = { MALE: 0, FEMALE: 1 } as const;

/** Every new character starts as a Vagrant. */
export const JOB_VAGRANT = 0;

type Rgb = readonly [number, number, number];

// `nMaleHairColor` and `nFeMaleHairColor` (`MoverEquip.cpp:43-67`): the colour of each of the 10 hair styles, as RGB.
// The create screen offers the first HAIR_MESH_COUNT; the others belong to characters made some other way.
const MALE_HAIR_RGB: readonly Rgb[] = [
  [144, 99, 101], [100, 107, 125], [158, 119, 109], [199, 156, 100], [100, 123, 117],
  [100, 100, 100], [100, 100, 100], [100, 100, 100], [100, 100, 100], [100, 100, 100],
];
const FEMALE_HAIR_RGB: readonly Rgb[] = [
  [250, 250, 90], [250, 250, 90], [147, 118, 103], [150, 100, 85], [213, 130, 100],
  [100, 100, 100], [100, 100, 100], [100, 100, 100], [100, 100, 100], [100, 100, 100],
];

/**
 * The row of the hair table of `sex` for `hairMesh` (`nSex == SEX_MALE` picks the men's, anything else the women's);
 * undefined past the table's 10 rows, where the C++ reads whatever follows it.
 */
export function defaultHairRgb(sex: number, hairMesh: number): Rgb | undefined {
  return (sex === Sex.MALE ? MALE_HAIR_RGB : FEMALE_HAIR_RGB)[hairMesh];
}

/** The hair colour a hair style gets, as the opaque 0xAARRGGBB number CREATE_PLAYER carries. */
export function hairColorFor(sex: number, hairMesh: number): number {
  if (sex !== Sex.MALE && sex !== Sex.FEMALE) throw new RangeError(`unknown sex ${sex}`);
  if (!Number.isInteger(hairMesh) || hairMesh < 0 || hairMesh >= HAIR_MESH_COUNT) {
    throw new RangeError(`hair style ${hairMesh} is outside 0..${HAIR_MESH_COUNT - 1}`);
  }
  const [r, g, b] = defaultHairRgb(sex, hairMesh)!;
  return (0xff000000 | r << 16 | g << 8 | b) >>> 0;
}

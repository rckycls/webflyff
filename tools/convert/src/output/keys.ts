// The logical keys that more than one stage must agree on. A stage writes a file under one of these keys and another
// stage names it in its own output, so the rule lives here, below both: the effects and UI stages write
// `effects/...json` and `ui/...png`, the models stage writes `models/...glb`, and the data stage (which runs after them)
// names all three in its catalogs.

import { webName } from '@flyffweb/formats';

/** A file name without its last extension (`Mvr_male.o3d` is `Mvr_male`). */
export const stem = (file: string): string => file.replace(/\.[^.]*$/, '');

/** `effects/<web name>.json` of a `.sfx` file's stem, as the effects stage writes it. */
export const effectKeyOf = (sfxStem: string): string => `effects/${webName(sfxStem)}.json`;

/**
 * `ui/<web name>.png` of a picture's file name without its last extension, as the UI stage writes it: an icon (`szIcon`,
 * `itm_WeaSwoWooden.dds`), a theme piece (`GauEmptyNormal.bmp`) or a sheet's picture (`DmgEffect.dds`).
 */
export const iconKeyOf = (iconFile: string): string => `ui/${webName(stem(iconFile))}.png`;

/** `models/<web name>.glb` of an `.o3d` file name, as the models stage writes it. */
export const modelKeyOf = (o3dFile: string): string => `models/${webName(stem(o3dFile))}.glb`;

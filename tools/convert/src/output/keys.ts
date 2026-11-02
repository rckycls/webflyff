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
 * `ui/<web name>.png` of a picture's file name without its last extension, as the UI stage writes it for the pictures of
 * Client/Icon (skill icons, applets, `icon_target.dds`), the theme pieces (`GauEmptyNormal.bmp`) and the sheets
 * (`DmgEffect.dds`). Item icons have their own key space, `itemIconKeyOf`: 8 file names are in both Client/Icon and
 * Client/Item.
 */
export const iconKeyOf = (iconFile: string): string => `ui/${webName(stem(iconFile))}.png`;

/**
 * `ui/item/<web name>.png` of an item's icon file (`ItemProp::szIcon`, `itm_WeaSwoWooden.dds`), as the UI stage writes the
 * pictures of Client/Item, where CItemBase::SetTexture loads them from (DIR_ITEM, Item.cpp:114).
 */
export const itemIconKeyOf = (iconFile: string): string => `ui/item/${webName(stem(iconFile))}.png`;

/** `models/<web name>.glb` of an `.o3d` file name, as the models stage writes it. */
export const modelKeyOf = (o3dFile: string): string => `models/${webName(stem(o3dFile))}.glb`;

/** The last part of a path, with `\` or `/` separators. */
const baseName = (file: string): string => file.split(/[\\/]/).pop() ?? file;

/** `sound/<web name>.wav` of a WAV's file name or path, as the audio stage writes it (`InfClick.wav`). */
export const soundKeyOf = (file: string): string => `sound/${webName(baseName(file))}`;

/** `music/<web name>.ogg` or `.mp3` of a track's file name or path, as the audio stage writes it. */
export const musicKeyOf = (file: string, ext: 'ogg' | 'mp3'): string => `music/${webName(stem(baseName(file)))}.${ext}`;

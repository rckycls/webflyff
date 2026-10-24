import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { effectKeyOf, iconKeyOf, modelKeyOf, stem } from '../src/output/keys';

describe('the logical keys the converter stages share', () => {
  it('names an effect by the web name of its .sfx stem', () => {
    expect(effectKeyOf('sfx_HitSword01')).toBe('effects/sfx_hitsword01.json');
    expect(effectKeyOf('Obj_ Fire')).toBe('effects/obj_-fire.json');
  });

  it('names a UI picture (an icon, a theme piece, a sheet) by the web name of its file name without the extension', () => {
    expect(iconKeyOf('itm_WeaSwoWooden.dds')).toBe('ui/itm_weaswowooden.png');
    expect(iconKeyOf('GauEmptyNormal.bmp')).toBe('ui/gauemptynormal.png');
    expect(iconKeyOf('Skill_JstReturn.dds.dds')).toBe('ui/skill_jstreturn.dds.png'); // only the last extension goes
    expect(iconKeyOf('Weird Name.TGA')).toBe('ui/weird-name.png');
  });

  it('names a model by the web name of its .o3d stem, as the models stage writes it', () => {
    expect(modelKeyOf('Item_Sword.o3d')).toBe('models/item_sword.glb');
    expect(modelKeyOf('Obj_ A.o3d')).toBe('models/obj_-a.glb');
  });

  it('cuts the last extension off a file name', () => {
    expect(stem('Mvr_male.o3d')).toBe('Mvr_male');
    expect(stem('a.b.c')).toBe('a.b');
    expect(stem('noext')).toBe('noext');
  });

  it('is the one place the data stage and the effects and UI stages take the keys from', async () => {
    const src = path.resolve(import.meta.dirname, '../src');
    const data = await fs.readFile(path.join(src, 'data/gameDataStage.ts'), 'utf8');
    expect(data).toMatch(/from '\.\.\/output\/keys'/);
    expect(data).not.toMatch(/export const (effectKeyOf|iconKeyOf)/);
    for (const stage of ['effects/effectsStage.ts', 'ui/uiStage.ts']) {
      const code = await fs.readFile(path.join(src, stage), 'utf8');
      expect(code, stage).not.toMatch(/gameDataStage/); // the stages come before the data stage: no import upward
    }
  });
});

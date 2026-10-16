import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { decodeScript, loadDefines, modelFileName, readModelIndex, readTerrainIndex, readWld } from '../../src/index';
import type { ModelElem } from '../../src/index';
import { clientRoot, describeClient, forEachClientFile, loadClientPacks } from '../helpers/client';
import { cppLoadTerrainScript } from '../helpers/cppTerrain';

/** Names of the files in a client folder, lower-cased: the client looks files up without regard to case. */
function lowerCaseNames(relDir: string): Set<string> {
  const dir = path.join(clientRoot()!, relDir);
  return new Set(existsSync(dir) ? readdirSync(dir).map((name) => name.toLowerCase()) : []);
}

/** The script with its `//` and block comments blanked, for counting with a plain regex. */
function withoutComments(text: string): string {
  return text.replace(/\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g, ' ');
}

/** A short list for the log: the first `limit` names, then how many more there are. */
function summarize(names: string[], limit = 12): string {
  const shown = names.slice(0, limit).join(', ');
  return names.length > limit ? `${shown}, ... (${names.length - limit} more)` : shown;
}

describeClient('world header, terrain index and model index', () => {
  const packs = loadClientPacks();
  const defines = loadDefines(packs);
  const scriptText = (name: string): string => decodeScript(packs.read(name));

  it('loadDefines merges the define*.h headers; the constants modelIndex.ts hard-codes match them', () => {
    expect(defines.size).toBeGreaterThan(1000);
    // OT_* (define.h:80-89) and MODELTYPE_* (Model.h:10-14): modelFileName compares against these.
    expect(defines.get('OT_SFX')).toBe(3);
    expect(defines.get('MAX_OBJTYPE')).toBe(9);
    expect(defines.get('MODELTYPE_BILLBOARD')).toBe(3);
    expect(defines.get('MODELTYPE_SFX')).toBe(4);
  });

  it('reads WdMadrigal.wld', () => {
    const file = path.join(clientRoot()!, 'World', 'WdMadrigal', 'WdMadrigal.wld');
    const w = readWld(decodeScript(new Uint8Array(readFileSync(file))), file);
    expect(w.size).toEqual([30, 30]);
    expect(w.mpu).toBe(4);
    expect(w.ambient).toBe(0x808080);
    expect(w.bgColor).toBe(0xffe0e0ff);
    expect(w.fly).toBe(true);
    expect(w.indoor).toBe(false);
    expect(w.fog).toEqual({ start: 70, end: 400, density: 0 });
    expect(w.camera.position[0]).toBeCloseTo(5063.999, 3);
    expect(w.camera.position[1]).toBeCloseTo(240.888, 3);
    expect(w.camera.position[2]).toBeCloseTo(4095.91, 3);
    expect(w.camera.angle).toBeCloseTo(0.393, 3);
    expect(w.camera.angleX).toBeCloseTo(0.191, 3);
    expect(w.diffuse).toBe(0);
    expect(w.lightDir).toEqual([0, 0, 0]);
    expect(w.bgm).toBe(0);
    expect(w.pkMode).toBe(4194304);
  });

  it('parses every .wld under Client/World, with finite numbers and a sane size and fog', () => {
    const offenders: string[] = [];
    const { count, failures } = forEachClientFile(
      'World',
      /\.wld$/i,
      (bytes, file) => {
        const w = readWld(decodeScript(bytes), file);
        const numbers = [
          ...w.size,
          w.mpu,
          w.ambient,
          w.bgColor,
          w.diffuse,
          ...w.lightDir,
          w.fog.start,
          w.fog.end,
          w.fog.density,
          ...w.camera.position,
          w.camera.angle,
          w.camera.angleX,
          w.bgm,
          w.pkMode,
        ];
        const sane =
          numbers.every(Number.isFinite) &&
          w.size.every((n) => Number.isInteger(n) && n >= 1 && n <= 64) &&
          w.mpu > 0 &&
          w.fog.start >= 0 &&
          w.fog.end > w.fog.start;
        if (!sane) offenders.push(path.basename(file));
      },
      { recursive: true },
    );
    console.log(`.wld files: ${count} found, ${count - failures.length} parsed`);
    expect(failures.map((f) => `${f.path}: ${String(f.error)}`)).toEqual([]);
    expect(count).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it('Terrain.inc yields textures; lists the ones missing from World/TextureMid', () => {
    const text = scriptText('Terrain.inc');
    const { waterFrames, textures } = readTerrainIndex(text, defines, 'Terrain.inc');
    expect(textures.size).toBeGreaterThan(0);
    expect(waterFrames).toBe(2);
    expect(textures.get(0)?.file).toBe('default.dds');
    // Every `id count "file" block "sound"` line is a texture, and no id repeats (a repeat would overwrite one).
    const entryLines = withoutComments(text).match(/^\s*\d+\s+\d+\s+"[^"]*"\s+\d+\s+"[^"]*"\s*$/gm) ?? [];
    expect(textures.size).toBe(entryLines.length);

    const present = lowerCaseNames(path.join('World', 'TextureMid'));
    const missing = [...textures.values()].filter((t) => !present.has(t.file.toLowerCase()));
    console.log(
      `Terrain.inc: ${textures.size} textures, ${waterFrames} water animations; ` +
        `${missing.length} files missing from World/TextureMid (${present.size} files there): ` +
        summarize(missing.map((t) => `${t.id}=${t.file}`)),
    );
  });

  it('Terrain.inc: readTerrainIndex agrees with a token-for-token port of CTerrainMng::LoadScript', () => {
    const text = scriptText('Terrain.inc');
    const mine = readTerrainIndex(text, defines, 'Terrain.inc');
    const cpp = cppLoadTerrainScript(text);
    const files = (m: Map<number, { file: string }>): [number, string][] =>
      [...m].map(([id, t]): [number, string] => [id, t.file]).sort((a, b) => a[0] - b[0]);
    expect(files(mine.textures)).toEqual(files(cpp.terrain));
    expect(mine.waterFrames).toBe(cpp.waterFrame);
    // what the C++ keeps and TerrainTexture drops: the shipped file sets no block flag and names no sound
    expect([...cpp.terrain.values()].filter((t) => t.block !== 0 || t.sound !== '')).toEqual([]);
    expect(cpp.waterLists.map((ids) => ids.length)).toEqual([54, 54]); // the two animated water textures
  });

  // mdlObj.inc is UTF-16LE, mdlDyna.inc is CP949.
  for (const name of ['mdlObj.inc', 'mdlDyna.inc']) {
    it(`${name} yields elements with no id 0; prints counts per type, duplicates and missing models`, () => {
      const text = scriptText(name);
      const elems = readModelIndex(text, defines, name);
      expect(elems.length).toBeGreaterThan(0);
      // Every entry has one MODELTYPE_ word, so the count of those words outside comments is the entry count.
      expect(elems.length).toBe((withoutComments(text).match(/\bMODELTYPE_\w+/g) ?? []).length);
      expect(elems.filter((e) => e.id === 0)).toEqual([]);
      for (const e of elems) {
        expect(e.type, `${name} ${e.name}`).toBeGreaterThanOrEqual(0);
        expect(e.type, `${name} ${e.name}`).toBeLessThanOrEqual(8);
        expect(e.extra, `${name} ${e.name}`).toHaveLength(8);
        expect(e.extra.every(Number.isFinite), `${name} ${e.name}`).toBe(true);
        expect(modelFileName(e), `${name} ${e.name}`).not.toBe('');
      }

      const perType = new Map<number, number>();
      const firstSeen = new Map<string, ModelElem>();
      const duplicates: string[] = [];
      for (const e of elems) {
        perType.set(e.type, (perType.get(e.type) ?? 0) + 1);
        const key = `${e.type}:${e.id}`;
        const earlier = firstSeen.get(key);
        if (earlier !== undefined) duplicates.push(`${key} (${earlier.name}, ${e.name})`);
        else firstSeen.set(key, e);
      }

      const present = lowerCaseNames('Model');
      const unique = [...firstSeen.values()].filter((e) => e.modelType !== 3 && e.modelType !== 4);
      const missing = unique.filter((e) => !present.has(modelFileName(e).toLowerCase()));
      console.log(
        `${name}: ${elems.length} elements; per type ${[...perType].map(([t, n]) => `${t}:${n}`).join(' ')}; ` +
          `${duplicates.length} duplicate type:id (${summarize(duplicates, 6)}); ` +
          `${missing.length} of ${unique.length} model files missing from Client/Model: ` +
          summarize(missing.map(modelFileName), 6),
      );
    });
  }

  it('mdlObj.inc holds only object type 0; mdlDyna.inc has the other types', () => {
    const obj = readModelIndex(scriptText('mdlObj.inc'), defines, 'mdlObj.inc');
    expect(new Set(obj.map((e) => e.type))).toEqual(new Set([0]));
    const dyna = readModelIndex(scriptText('mdlDyna.inc'), defines, 'mdlDyna.inc');
    expect(new Set(dyna.map((e) => e.type))).toEqual(new Set([2, 3, 4, 5, 6, 7, 8]));
  });
});

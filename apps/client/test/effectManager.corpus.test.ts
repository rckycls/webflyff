// The effect manager on the real game files. A corpus test (`npm run test:corpus -- effectManager`): the `Xi` ids against
// the client's own defineObj.h, and the effects of the fight and the first skills played from the converted files in the
// worktree's dist/assets (`npm run convert`). Each half is skipped without what it reads. The rules themselves are
// unit-tested on hand-made effects in effectManager.test.ts.

import { existsSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadDefines } from '@flyffweb/formats';
import type { Vec3, WebEffect } from '@flyffweb/formats';
import type { EffectDraw } from '@flyffweb/scene';
import { neuzRandom } from '@flyffweb/scene';
import { PerspectiveCamera } from 'three';
import { clientRoot, describeClient, loadClientPacks } from '../../../packages/formats/test/helpers/client';
import { EffectManager, Xi } from '../src/world/fx/EffectManager';
import { loadGameData } from '../src/world/gameData';
import { ASSETS_DIR, DiskAssets } from './helpers/diskAssets';

describeClient('Xi: the ids of the client\'s defineObj.h', () => {
  it('has every value the manager names', () => {
    expect(clientRoot()).not.toBeNull();
    const defines = loadDefines(loadClientPacks());
    for (const [name, value] of Object.entries(Xi)) expect(defines.get(`XI_${name}`), `XI_${name}`).toBe(value);
  });
});

/** The effects of milestones 1 and 2 and the last key frame they play to (effects.md §3.2): the ticks they last, give or take the particles. */
const PLAYED: [name: string, xi: number, ticks: number][] = [
  ['XI_HIT_SWORD01', Xi.HIT_SWORD01, 19],
  ['XI_HIT_STICK01', Xi.HIT_STICK01, 24],
  ['XI_HIT_KNUCKLE01', Xi.HIT_KNUCKLE01, 25],
  ['XI_HIT_BOW01', Xi.HIT_BOW01, 35],
  ['XI_HIT_YOY01', Xi.HIT_YOY01, 20],
  ['XI_HIT_CRITICAL01', Xi.HIT_CRITICAL01, 70],
  ['XI_HIT_MISS01', Xi.HIT_MISS01, 70],
  ['XI_HIT_PARRY01', Xi.HIT_PARRY01, 70],
  ['XI_HIT_HITBLOCK01', Xi.HIT_HITBLOCK01, 70],
  ['XI_GEN_LEVEL_UP01', Xi.GEN_LEVEL_UP01, 410],
  ['XI_GEN_MONSTER_SPAWN01', Xi.GEN_MONSTER_SPAWN01, 95],
  ['XI_SKILL_VAG_ONE_CLEANHIT01', Xi.SKILL_VAG_ONE_CLEANHIT01, 30],
  ['XI_SKILL_VAG_ONE_BRANDISH01', Xi.SKILL_VAG_ONE_BRANDISH01, 65],
  ['XI_SKILL_VAG_ONE_OVERCUTTER01', Xi.SKILL_VAG_ONE_OVERCUTTER01, 40],
];

describe.skipIf(!existsSync(`${ASSETS_DIR}index.json`))('the effects of the fight and the Vagrant skills, from the converted files', () => {
  // opened in beforeAll: Vitest runs the body of a skipped suite to collect it, and without index.json this would throw
  let assets: DiskAssets;
  beforeAll(() => {
    assets = DiskAssets.open();
  });
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  /** Plays `xi` to its end; the ticks it took, the draws it handed out, and what it said. */
  async function playOut(xi: number): Promise<{ ticks: number; draws: EffectDraw[][]; reports: string[] }> {
    const data = await loadGameData(assets);
    const draws: EffectDraw[][] = [];
    const reports: string[] = [];
    const renderer = { begin: () => undefined, draw: (list: EffectDraw[]) => void draws.push(list), end: () => undefined };
    const manager = new EffectManager(data, (key) => assets.json<WebEffect>(key), renderer, neuzRandom, (message) => reports.push(message));
    manager.play({ xi, pos: [100, 10, 100] as Vec3, followId: 1, sourceAngle: 30 });
    await settle();
    const camera = new PerspectiveCamera();
    let ticks = 0;
    while (manager.count() > 0 && ticks < 2000) {
      manager.draw(camera);
      manager.step(() => ({ pos: [100, 10, 100] }));
      ticks++;
    }
    return { ticks, draws, reports };
  }

  it.each(PLAYED)(
    '%s plays to its last key frame and is dropped, drawing only textures the asset index has',
    async (name, xi, ticks) => {
      const played = await playOut(xi);
      expect(played.reports).toEqual([]);
      // the last key frame, and the one tick the model needs to see it has passed
      expect(played.ticks, name).toBeGreaterThanOrEqual(ticks);
      expect(played.ticks, name).toBeLessThanOrEqual(ticks + 1);
      const drawn = played.draws.flat();
      expect(drawn.length, name).toBeGreaterThan(0);
      for (const entry of drawn) {
        // Piece 7 M2: a mesh part's entry names its model, whose texture is the model's own
        const asset = entry.kind === 'mesh' ? entry.model : entry.texture;
        if (asset !== null) expect(assets.has(asset), `${name}: ${asset}`).toBe(true);
        expect(entry.matrix.every(Number.isFinite), name).toBe(true);
      }
    },
  );

  it('skips an index entry whose .sfx the client lacks, with one report (XI_HIT_SWORD02 is one)', async () => {
    const data = await loadGameData(assets);
    expect(data.effects.has(Xi.HIT_SWORD02)).toBe(true);
    expect(assets.has(data.effects.get(Xi.HIT_SWORD02)!.effect)).toBe(false);
    const played = await playOut(Xi.HIT_SWORD02);
    expect(played.ticks).toBe(0);
    expect(played.reports).toHaveLength(1);
  });
});

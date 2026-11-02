import { beforeAll, expect, it } from 'vitest';
import { decodeScript, loadDefines, loadStrings, readCharacterInc, readPropItem, readPropMover, readWorldInc } from '@flyffweb/formats';
import type { WebAudio } from '@flyffweb/formats';
import { ClientFs } from '../src/ClientFs';
import { effectSoundParts } from '../src/audio/audioSources';
import { buildAudio } from '../src/data/audioCatalog';
import { readModelIndexes } from '../src/data/modelIndexes';
import { clientRoot, describeClient } from '../../../packages/formats/test/helpers/client';

describeClient('the audio catalog on the real client folder', () => {
  let audio: WebAudio;
  const warnings: string[] = [];

  beforeAll(async () => {
    const client = await ClientFs.open(clientRoot()!);
    const defines = loadDefines(client.packs);
    const strings = loadStrings(client.packs);
    const text = (name: string): string => decodeScript(client.packs.read(name));
    audio = buildAudio({
      client,
      defines,
      effectParts: effectSoundParts(readModelIndexes(client.packs, defines)),
      worlds: readWorldInc(text('World.inc'), defines, 'World.inc'),
      items: readPropItem(text('propItem.txt'), defines, strings, 'propItem.txt'),
      skills: readPropItem(text('propSkill.txt'), defines, strings, 'propSkill.txt'),
      movers: readPropMover(text('propMover.txt'), defines, strings, 'propMover.txt'),
      characters: ['character.inc', 'character-etc.inc', 'character-school.inc']
        .flatMap((file) => readCharacterInc(text(file), defines, strings, file)),
      has: () => true, // as after an audio run that copied every file there is
      warn: (source, message) => warnings.push(`${source}: ${message}`),
    })!;
  });

  it('lists the 40 music ids whose track exists, and the sounds by id', () => {
    expect(Object.keys(audio.music)).toHaveLength(40);
    expect(audio.music[70]).toBeUndefined(); // BGM_DU_INVISIBLE: Bgm4DuDarkon.ogg is missing
    expect(audio.music[124]).toBeUndefined(); // BGM_FI_DARKON3: BgmFiDarkon.ogg is missing
    expect(audio.music[121]!.ogg).toBe('music/bgmth3return.ogg');
    expect(audio.sounds[1]).toBe('sound/infclick.wav');
    expect(audio.sounds[2042]).toBe('sound/npcwormveduqueatk1.wav');
  });

  it('reads Madrigal\'s 109 regions, with the Flaris and Saint Morning rows of the research', () => {
    const madrigal = audio.worlds[1]!;
    expect(madrigal.bgm).toBe(0);
    expect(madrigal.regions).toHaveLength(109);
    expect(madrigal.regions[47]).toEqual({ rect: [6870, 3184, 7073, 3285], music: 2, direct: false, inn: false });
    expect(madrigal.regions[55]).toEqual({ rect: [6848, 3172, 7261, 3385], music: 2, direct: true, inn: false });
    expect(madrigal.regions[59]).toEqual({ rect: [6953, 3512, 7255, 3736], music: 120, direct: true, inn: false });
    expect(madrigal.regions[96]).toEqual({ rect: [8229, 3534, 8604, 3941], music: 3, direct: true, inn: false });
  });

  it('keeps the effect, skill, mover and NPC sounds', () => {
    expect(Object.keys(audio.effects)).toHaveLength(217);
    expect(Object.keys(audio.skills)).toHaveLength(33);
    expect(Object.keys(audio.movers)).toHaveLength(4);
    expect(audio.npcMusic.mafl_benku).toBe(206); // BGM_NPC_SOLEMN2
  });

  it('warns only about the files the scripts name that the folder lacks', () => {
    expect(warnings).toEqual([]);
  });
});

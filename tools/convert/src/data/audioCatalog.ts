// The audio catalog of the `data` stage (data/audio.json, WebAudio; Piece 6 M2): what Neuz's players look up by id,
// naming the files the audio stage wrote (docs/superpowers/specs/2026-11-02-piece6-m2-sound-research.md):
//
//   sounds    sound.inc                         CSoundManager::LoadScript (dsutil.cpp:39-60)
//   music     default.bgm                       CMusicMng::LoadScript (Music2.cpp:195-213)
//   worlds    each World.inc world's .wld bgm   CWorld::OpenWorld (WorldFile.cpp:94-97)
//             and .rgn region rows              CWorld::LoadRegion, ReadRegion (WorldFile.cpp:413-553, :775-809)
//   effects   mdlDyna.inc SFX parts             CreateSfx (CreateObj.cpp:328-329)
//   items     propItem.txt dwSndAttack1/2, dwSubDefine      MoverActEvent.cpp:1688, DPClient.cpp:1903-1907, :1297
//   skills    propSkill.txt dwSndAttack1                    Ctrl.cpp:982-986
//   movers    propMover.txt dwSndIdle1                      WndWorld.cpp:7063
//   npcMusic  character.inc SetMusic                        WndDialog.cpp:290-297
//
// Optional, as data/worldMap.json is: without sound.inc there is no catalog (one warning), and the client stays silent.
// An id whose file the index does not have is left out, so it plays nothing, as an id whose file is missing does in Neuz.

import { readFileSync } from 'node:fs';
import { decodeScript, readRegions, readWld } from '@flyffweb/formats';
import type { CharacterDef, ItemProp, MoverProp, WebAudio, WorldDef } from '@flyffweb/formats';
import type { ClientFs } from '../ClientFs';
import { audioSources } from '../audio/audioSources';
import { musicKeyOf, soundKeyOf } from '../output/keys';

/** RA_INN (Resource/define.h:143). */
const RA_INN = 0x80;

export interface AudioEnv {
  client: ClientFs;
  defines: ReadonlyMap<string, number>;
  /** `XI_*` id → the WAV of its mdlDyna.inc SFX entry (`effectSoundParts`). */
  effectParts: ReadonlyMap<number, string>;
  /** World.inc's worlds, in file order. */
  worlds: readonly WorldDef[];
  /** propItem.txt and propSkill.txt rows. */
  items: readonly ItemProp[];
  skills: readonly ItemProp[];
  movers: readonly MoverProp[];
  /** The characters of character.inc and its sister files, in the order they are read. */
  characters: readonly CharacterDef[];
  /** Whether the asset index has the key (this run's or an earlier run's). */
  has(key: string): boolean;
  warn(source: string, message: string): void;
  /** Told the size of each file read. */
  counted?(bytes: number): void;
}

/** The catalog, or null (with one warning) when the client folder has no `Client/sound.inc`. */
export function buildAudio(env: AudioEnv): WebAudio | null {
  const sources = audioSources(env.client, env.defines, env.effectParts);
  env.counted?.(sources.bytes);
  if (sources.absent.includes('Client/sound.inc')) {
    env.warn('Client/sound.inc', 'not in the client folder, so there is no audio catalog');
    return null;
  }
  const audio: WebAudio = { sounds: {}, music: {}, worlds: {}, effects: {}, items: {}, skills: {}, movers: {}, npcMusic: {} };

  for (const [id, file] of sources.sounds) {
    const key = soundKeyOf(file);
    if (env.has(key)) audio.sounds[id] = key;
  }
  for (const [xi, file] of sources.effects) {
    const key = soundKeyOf(file);
    if (env.has(key)) audio.effects[xi] = key;
  }
  for (const [id, file] of sources.music) {
    const ogg = musicKeyOf(file, 'ogg');
    const mp3 = musicKeyOf(file, 'mp3');
    if (env.has(ogg)) audio.music[id] = { ogg, mp3: env.has(mp3) ? mp3 : null };
  }
  if (Object.keys(audio.sounds).length === 0 && Object.keys(audio.music).length === 0) {
    env.warn('Client/sound.inc', 'none of its sounds is in the asset index: run npm run convert -- --only audio,data');
  }

  // CWorldMng::LoadScript keeps the last world of an id (SetAtGrow, worldmng.cpp:359); a world with no file name is not
  // valid (worldmng.h:13)
  const worlds = new Map<number, string>();
  for (const world of env.worlds) worlds.set(world.id, world.fileName);
  for (const [id, fileName] of [...worlds].sort((a, b) => a[0] - b[0])) {
    if (fileName === '') continue;
    const dir = `World/${fileName}`;
    const read = (ext: string): { file: string; text: string } | null => {
      const file = env.client.find(dir, `${fileName}.${ext}`);
      if (file === null) return null;
      const bytes = new Uint8Array(readFileSync(file));
      env.counted?.(bytes.length);
      return { file, text: decodeScript(bytes) };
    };
    try {
      const wld = read('wld');
      const rgn = read('rgn');
      if (wld === null && rgn === null) continue;
      audio.worlds[id] = {
        bgm: wld === null ? 0 : readWld(wld.text, wld.file).bgm,
        regions: rgn === null ? [] : readRegions(rgn.text, rgn.file).map((row) => ({
          rect: row.rect, music: row.music, direct: row.direct, inn: (row.attribute & RA_INN) !== 0,
        })),
      };
    } catch (error) {
      env.warn(dir, `not read, so that world has no music: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const item of env.items) {
    const sounds: WebAudio['items'][number] = {
      ...(item.sndAttack1 > 0 ? { attack1: item.sndAttack1 } : {}),
      ...((item.sndAttack2 ?? 0) > 0 ? { attack2: item.sndAttack2 } : {}),
      ...(item.subDefine > 0 ? { drop: item.subDefine } : {}),
    };
    if (Object.keys(sounds).length > 0) audio.items[item.id] = sounds;
  }
  for (const skill of env.skills) if (skill.sndAttack1 > 0) audio.skills[skill.id] = skill.sndAttack1;
  for (const mover of env.movers) if ((mover.sndIdle1 ?? 0) > 0) audio.movers[mover.index] = mover.sndIdle1!;
  // CProject::LoadCharacter keys the map by the lower-cased key and the later character wins (as buildNpcs does)
  const npcs = new Map<string, number | undefined>();
  for (const character of env.characters) npcs.set(character.key.toLowerCase(), character.music);
  for (const [key, music] of npcs) if (music !== undefined) audio.npcMusic[key] = music;
  return audio;
}

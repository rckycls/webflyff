// Which client files the sound and music ids name, shared by the audio stage (which copies them) and the data stage
// (which lists them in data/audio.json). All of them are loose files (CResFile::Open takes the folder before the packs,
// _Common/File.cpp:273-290):
//
//   Client/sound.inc     id → a WAV of Sound\ (DIR_SOUND, path.h:13; CSoundManager::LoadScript, dsutil.cpp:39-60)
//   Music/default.bgm    id → a path of the client folder, `music\BgmTo1Flaris.ogg` (CMusicMng::LoadScript, Music2.cpp)
//   mdlDyna.inc          an SFX entry's part, a WAV of Sound\ played when the effect is made (CreateObj.cpp:328-329)
//
// Names are found without regard to case, as Windows finds them: default.bgm's `BgmTh3Return.ogg` is `Bgmth3Return.ogg`
// on disk.

import { OT, decodeScript, readIdFileScript } from '@flyffweb/formats';
import { readFileSync } from 'node:fs';
import type { ClientFs } from '../ClientFs';
import type { ModelIndex } from '../data/modelIndexes';

export const SOUND_INC = { dir: 'Client', name: 'sound.inc' };
export const DEFAULT_BGM = { dir: 'Music', name: 'default.bgm' };
/** DIR_SOUND (path.h:13). */
const SOUND_DIR = 'Sound';
/** MODELTYPE_SFX (Source/_Common/Model.h:14). */
const MODELTYPE_SFX = 4;

export interface AudioSources {
  /** Sound id → the WAV's path in the client folder. */
  sounds: Map<number, string>;
  /** Music id → the track's path in the client folder. */
  music: Map<number, string>;
  /** `XI_*` id → the path of its effect's WAV. */
  effects: Map<number, string>;
  /** The names the scripts give that the folder lacks, `sound.inc`'s and the effects' first, then `default.bgm`'s. */
  missingSounds: string[];
  missingMusic: string[];
  /** The scripts that are not in the folder (`Client/sound.inc`, `Music/default.bgm`). */
  absent: string[];
  /** Bytes of the scripts read. */
  bytes: number;
}

/** `XI_*` id → the WAV named in the 4th field of its mdlDyna.inc SFX entry (`m_szPart`, ModelMng.cpp:387-393). */
export function effectSoundParts(index: ModelIndex): Map<number, string> {
  const parts = new Map<number, string>();
  for (const elem of index.entries.values()) {
    if (elem.type === OT.SFX && elem.modelType === MODELTYPE_SFX && elem.part !== '') parts.set(elem.id, elem.part);
  }
  return parts;
}

/** The files the sound and music ids and the effects name, found in the client folder. */
export function audioSources(
  client: ClientFs, defines: ReadonlyMap<string, number>, effectParts: ReadonlyMap<number, string>,
): AudioSources {
  const out: AudioSources = {
    sounds: new Map(), music: new Map(), effects: new Map(), missingSounds: [], missingMusic: [], absent: [], bytes: 0,
  };
  const script = (where: { dir: string; name: string }): Map<number, string> | null => {
    const file = client.find(where.dir, where.name);
    if (file === null) {
      out.absent.push(`${where.dir}/${where.name}`);
      return null;
    }
    const raw = new Uint8Array(readFileSync(file));
    out.bytes += raw.length;
    return readIdFileScript(decodeScript(raw), defines, `${where.dir}/${where.name}`);
  };
  const missing = (list: string[], name: string): void => { if (!list.includes(name)) list.push(name); };

  for (const [id, name] of script(SOUND_INC) ?? []) {
    const file = client.find(SOUND_DIR, name);
    if (file === null) missing(out.missingSounds, name);
    else out.sounds.set(id, file);
  }
  for (const [xi, name] of effectParts) {
    const file = client.find(SOUND_DIR, name);
    if (file === null) missing(out.missingSounds, name);
    else out.effects.set(xi, file);
  }
  for (const [id, written] of script(DEFAULT_BGM) ?? []) {
    const parts = written.split(/[\\/]/).filter((part) => part !== '');
    const name = parts.pop() ?? '';
    const file = name === '' ? null : client.find(parts.join('/'), name);
    if (file === null) missing(out.missingMusic, written);
    else out.music.set(id, file);
  }
  return out;
}

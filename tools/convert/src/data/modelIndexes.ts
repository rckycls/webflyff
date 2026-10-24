// The model indexes of the resource packs, read the way the game-data stage and the effects stage both need them.

import { decodeScript, readModelIndex } from '@flyffweb/formats';
import type { ModelElem, ResPacks } from '@flyffweb/formats';

/** The models of `mdlObj.inc` and `mdlDyna.inc`, in the order CModelMng::LoadScript reads them. */
export const MODEL_INDEXES = ['mdlObj.inc', 'mdlDyna.inc'];

export interface ModelIndex {
  /** `<type>:<id>` to entry over mdlObj.inc and mdlDyna.inc; a later entry with the same type and id wins. */
  entries: ReadonlyMap<string, ModelElem>;
  /** Bytes of the files it was read from. */
  bytes: number;
}

export function readModelIndexes(packs: ResPacks, defines: ReadonlyMap<string, number>): ModelIndex {
  const entries = new Map<string, ModelElem>();
  let bytes = 0;
  for (const name of MODEL_INDEXES) {
    const raw = packs.read(name);
    bytes += raw.length;
    for (const elem of readModelIndex(decodeScript(raw), defines, name)) {
      entries.set(`${elem.type}:${elem.id}`, elem);
    }
  }
  return { entries, bytes };
}

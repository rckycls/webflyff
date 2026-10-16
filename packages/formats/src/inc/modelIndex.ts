// Model index (`mdlObj.inc` and `mdlDyna.inc` in data.res), copying CModelMng::LoadScript
// (Source/_Common/ModelMng.cpp:314) and CModelMng::MakeModelName (:63). Each file is a list of type blocks,
// `"obj" 0 { ... }`, where the number is the object type (OT_*, Resource/define.h:80-89). Inside a block come
// entries, optionally grouped in named folders `"name" { ... }`:
//
//   "name"  id  modelType  part  fly  distant  pick  scale  trans  shadow  textureEx  renderFlag
//
// An entry may be followed by a motion list `{ "motion" id ... }`. The C++ reads the numbers with CScript::
// GetNumber, so ids, model types and flags may be define names (`MODELTYPE_MESH`, `II_GOLD_SEED1`, `MD_NEAR`).
// Names and parts are the token's text, quoted or not: mdlDyna.inc writes the mover names and some parts bare.
//
// The loop below follows the C++ token for token, including how it tells a folder from an entry (read one token
// ahead, then rewind with SetMark / GoMark).

import { FormatError } from '../errors';
import { TokenStream, tokenize } from '../script/scanner';
import type { Token } from '../script/scanner';

export interface ModelElem {
  /** Object type, OT_OBJ (0) to OT_PATH (8): the block the entry is in. */
  type: number;
  /** Object id within its type; never 0. */
  id: number;
  /** The entry's name; with `modelFileName` it gives the model file. */
  name: string;
  /** MODELTYPE_* (Source/_Common/Model.h:10): 1 mesh, 2 animated mesh, 3 billboard, 4 sfx. */
  modelType: number;
  /**
   * The numbers after the part name, in file order: bFly, dwDistant, bPick, fScale, bTrans, bShadow, nTextureEx,
   * bRenderFlag. (The part name and motion lists are read but not kept.)
   */
  extra: number[];
}

/** CModelMng's g_szRoot (ModelMng.cpp:5), indexed by object type. */
const OBJECT_ROOTS = ['obj', 'ani', 'ctrl', 'sfx', 'item', 'mvr', 'region', 'obj', 'path'] as const;
/** OT_SFX, Resource/define.h:83. */
const OT_SFX = 3;
/** MODELTYPE_BILLBOARD and MODELTYPE_SFX, Source/_Common/Model.h:13-14. */
const MODELTYPE_BILLBOARD = 3;
const MODELTYPE_SFX = 4;

const READER = 'readModelIndex';
const LOAD_REF = 'Source/_Common/ModelMng.cpp:314 CModelMng::LoadScript';
const NAME_REF = 'Source/_Common/ModelMng.cpp:63 CModelMng::MakeModelName';

/**
 * Reads the text of `mdlObj.inc` or `mdlDyna.inc` (see `decodeScript`), entries in file order.
 *
 * Two entries with the same type and id are both returned; the C++ warns and the later one replaces the earlier
 * (CFixedArray::SetAtGrow), so callers that look entries up should let the last one win. Object id 0, which the
 * C++ warns about and keeps, throws here, as does a type outside 0..8 (the C++ indexes past its array) and a
 * block that is never closed (the C++ loops forever).
 */
export function readModelIndex(
  text: string,
  defines: ReadonlyMap<string, number>,
  file = '<model index>',
): ModelElem[] {
  const ts = new TokenStream(tokenize(text, file), defines, file);
  const elems: ModelElem[] = [];

  const fail = (message: string, at: Token): never => {
    throw new FormatError(message, {
      file,
      offset: at.offset,
      unit: 'char',
      line: at.line,
      reader: READER,
      cppRef: LOAD_REF,
    });
  };

  // script.token / script.Token: the token the last GetToken returned. The C++ tests it for '{' and '}'.
  let cur: Token = { kind: 'symbol', text: '', line: 1, offset: 0 };
  const getToken = (): void => {
    cur = ts.peek() ?? cur;
    ts.word(); // consumes the token, or throws at the end of the script
  };
  // (a function call, so TypeScript does not carry what it knew about `cur` across a getToken())
  const curIs = (text: string): boolean => cur.text === text;

  while (!ts.done()) {
    ts.word(); // the type's name; only the number after it counts
    const typeTok = ts.peek();
    const type = ts.number();
    if (!Number.isInteger(type) || type < 0 || type >= OBJECT_ROOTS.length) {
      fail(`object type ${type} is not one of 0..${OBJECT_ROOTS.length - 1}`, typeTok ?? cur);
    }
    ts.expect('{');
    getToken(); // object name or }

    let braces = 1;
    while (braces > 0) {
      if (curIs('}')) {
        braces--;
        if (braces > 0) getToken(); // object name or }
        continue;
      }

      const nameTok = cur;
      const mark = ts.mark();
      getToken(); // { when the name is a folder's, otherwise the id
      if (curIs('{')) {
        braces++;
        getToken(); // object name or }
        continue;
      }
      ts.reset(mark);

      const idTok = ts.peek() ?? nameTok;
      const id = ts.number();
      if (!Number.isInteger(id) || id < 1) {
        fail(`object id ${id} of "${nameTok.text}" is not allowed: ids start at 1`, idTok);
      }
      const modelType = ts.number();
      ts.word(); // szPart: the token's text, whatever its kind
      const extra = [
        ts.number(), // bFly
        ts.number(), // dwDistant
        ts.number(), // bPick
        ts.number(), // fScale (CScanner::GetFloat in the C++)
        ts.number(), // bTrans
        ts.number(), // bShadow
        ts.number(), // nTextureEx
        ts.number(), // bRenderFlag
      ];

      getToken(); // object name, or { for a motion list, or }
      if (curIs('{')) {
        getToken(); // motion name or }
        while (!curIs('}')) {
          ts.number(); // the motion's MTI_* id
          getToken(); // motion name or }
        }
        getToken(); // object name or }
      }

      elems.push({ type, id, name: nameTok.text, modelType, extra });
    }
  }

  return elems;
}

/**
 * The model file an entry loads, copying CModelMng::MakeModelName (ModelMng.cpp:63): the object type's folder
 * name, `_`, the entry name and `.o3d`. A billboard is just its name. An sfx object keeps a name that already
 * has an underscore, and a MODELTYPE_SFX model gets no `.o3d` (it names a `.sfx` script, not a mesh).
 */
export function modelFileName(e: ModelElem): string {
  const root: string | undefined = OBJECT_ROOTS[e.type];
  if (root === undefined) {
    throw new FormatError(`object type ${e.type} has no model folder`, {
      file: `<model ${e.name}>`,
      offset: 0,
      reader: 'modelFileName',
      cppRef: NAME_REF,
    });
  }
  if (e.modelType === MODELTYPE_BILLBOARD) return e.name;

  const name = e.type === OT_SFX && e.name.includes('_') ? e.name : `${root}_${e.name}`;
  return e.modelType === MODELTYPE_SFX ? name : `${name}.o3d`;
}

// PK rules (`PKSetting.inc`), copying CProject::LoadScriptPK (Source/_Common/Project.cpp:4964). A list of
// `KEYWORD value` lines and two blocks, read token by token (CScript):
//
//   GENERAL_COLOR  0xffffffff      the name colour of an ordinary player (white; ARGB)
//   READY_COLOR    0xffffc0cb      ... of a semi-chaotic player, one who attacked an ordinary player lately (pink)
//   CHAO_COLOR     0xffff0000      ... of a chaotic player (red)
//   GENERAL_ATTACK_TIME 16 ... LIMITE_LEVEL 20 ... DIE_PROPENSITY_MIN/MAX ...
//   PROPENSITY_PENALTY { ADDPENALTY 12 numbers ... }
//   LEVEL_EXP { ADDEXP level exp ... }
//
// Only the three name colours are kept (the `COLOR_*` the name tag uses for them); the other values are read the
// way the C++ reads them, so a colour that comes after the blocks is found as well.

import { ScriptReader } from '../script/cscript';

export interface PkColors {
  /** GENERAL_COLOR (`PK_SETTING::dwGeneralColor`): an ordinary player; ARGB, unsigned. 0 if the file has none. */
  general: number;
  /** CHAO_COLOR (`dwChaoColor`): a chaotic player. */
  chaotic: number;
  /** READY_COLOR (`dwReadyColor`): a semi-chaotic player. */
  ready: number;
}

const READER = 'readPkSetting';
const CPP_REF = 'Source/_Common/Project.cpp:4964 CProject::LoadScriptPK';

/** Keywords that take one number, kept or dropped (Project.cpp:4977-5017). */
const SINGLE_VALUES: ReadonlySet<string> = new Set([
  'GENERAL_ATTACK_TIME',
  'READY_ATTACK_TIME',
  'LIMITE_LEVEL',
  'DIE_PROPENSITY_MIN',
  'DIE_PROPENSITY_MAX',
]);

/** The numbers of an ADDPENALTY line (Project.cpp:5026-5039): id, min, max, then nine more. */
const ADDPENALTY_NUMBERS = 12;

/**
 * Reads the text of `PKSetting.inc` (see `decodeScript`). The colours are ARGB as the C++ keeps them in a DWORD:
 * `0xffffffff` is 4294967295, not -1. A colour the file leaves out is 0, as `PK_SETTING` starts. A keyword that
 * lacks its value, or a name that is not defined, throws a FormatError (the C++ reads 0).
 */
export function readPkSetting(text: string, defines: ReadonlyMap<string, number>, file = 'PKSetting.inc'): PkColors {
  const r = new ScriptReader(text, defines, new Map(), { file, reader: READER, cppRef: CPP_REF });
  const colors: PkColors = { general: 0, chaotic: 0, ready: 0 };

  // `{` `{`: the C++ reads the opening brace and the first word inside, then loops to the closing brace
  const block = (word: string, entry: string, numbers: number): void => {
    r.token(`'{' after ${word}`);
    let at = r.token(`a word of ${word}`);
    while (at.text[0] !== '}') {
      if (at.text === entry) for (let i = 0; i < numbers; i++) r.number(`${entry} (number ${i + 1})`);
      at = r.token(`'}' of ${word}`);
    }
  };

  for (let at = r.tokenOrEnd(); at !== undefined; at = r.tokenOrEnd()) {
    if (at.text === 'GENERAL_COLOR') colors.general = r.number(at.text) >>> 0;
    else if (at.text === 'READY_COLOR') colors.ready = r.number(at.text) >>> 0;
    else if (at.text === 'CHAO_COLOR') colors.chaotic = r.number(at.text) >>> 0;
    else if (SINGLE_VALUES.has(at.text)) r.number(at.text);
    else if (at.text === 'PROPENSITY_PENALTY') block(at.text, 'ADDPENALTY', ADDPENALTY_NUMBERS);
    else if (at.text === 'LEVEL_EXP') block(at.text, 'ADDEXP', 2);
  }

  return colors;
}

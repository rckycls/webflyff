// The raised pets' table (`pet.inc`), copying CPetProperty::LoadScript (Source/_Common/pet.cpp:124-240), which Neuz runs
// when it opens the project (CProject::OpenProject, Project.cpp:614). A file of named blocks read token by token (CScript):
//
//   AvailDestParam { DST_STR  1 2 4 7 11 16 22 29 37  II_PET_WHITETIGER01  MI_PET_WHITETIGER01 ..._1 ..._2  900  ... }
//   FeedEnergy 0 { 1 575 7 14  ... }          (and FeedEnergy 1): cost min, cost max, food min, food max
//   IncrementExp { 250 125 62 31 }            D to A
//   MaxEnergy { 180 300 420 600 1500 }        D to S
//   Penalty { 0.16 0  ... }                   D to S: the EXP lost (a float) and the energy lost
//
// The loader also knows `LevelupAvail` and `AddLifeProbability`, which the server reads from its own data; they are not in
// the client's file and not kept. Any other word is passed over, as the C++ loop's GetToken does.

import { ScriptReader } from '../script/cscript';
import type { WebPetFeedEnergy, WebPetKind, WebPets } from '../web/gameData';

const READER = 'readPetInc';
const CPP_REF = 'Source/_Common/pet.cpp:124 CPetProperty::LoadScript';

/** MAX_PET_AVAIL_LEVEL (`_Common/pet.h:18`): the step values of a kind. */
const MAX_PET_AVAIL_LEVEL = 9;
/** PL_S (`pet.h:16`, PL_EGG 0 ... PL_S 5) and PL_MAX. */
const PL_S = 5;
const PL_MAX = 6;

/**
 * Reads the text of `pet.inc` (see `decodeScript`). `defines` turns the `DST_*`, `II_*` and `MI_*` names into numbers;
 * when it holds `PK_MAX` (`Resource/define.h:258`), more kinds than that throw. A block written twice fills its table from
 * the start again (a `FeedEnergy` block adds its rows, as `push_back` does).
 *
 * Where the C++ asserts or writes past its arrays, this throws a FormatError: a `FeedEnergy` index other than 0 or 1, more
 * than 5 `IncrementExp` rows (ASSERT `nLevel < PL_S`), more than 6 `MaxEnergy` rows (`nLevel <= PL_S`) or more than 5
 * `Penalty` rows (`m_aPenalty[PL_MAX]` from PL_D).
 */
export function readPetInc(text: string, defines: ReadonlyMap<string, number>, file = 'pet.inc'): WebPets {
  const r = new ScriptReader(text, defines, new Map(), { file, reader: READER, cppRef: CPP_REF });
  // `*s.token != '}'`: the number just read was the block's closing brace (atoi of "}" is 0)
  const closed = (): boolean => r.lastToken()?.text.startsWith('}') === true;
  const open = (block: string): void => {
    const brace = r.token(`the { of ${block}`);
    if (brace.text !== '{') r.fail(`expected "{" after ${block}, found "${brace.text}"`, brace);
  };
  const pkMax = defines.get('PK_MAX');

  const kinds: WebPetKind[] = [];
  const feedEnergy: [WebPetFeedEnergy[], WebPetFeedEnergy[]] = [[], []];
  const incrementExp: number[] = [];
  const maxEnergy: number[] = [];
  const penalty: Array<{ exp: number; energy: number }> = [];

  for (let subject = r.tokenOrEnd(); subject !== undefined; subject = r.tokenOrEnd()) {
    switch (subject.text) {
      case 'AvailDestParam': {
        open('AvailDestParam');
        let kind = 0;
        for (let dst = r.number("a DST or '}'"); !closed(); dst = r.number("a DST or '}'")) {
          if (pkMax !== undefined && kind >= pkMax) r.fail(`more than ${pkMax} kinds (PK_MAX)`, r.lastToken());
          const steps = Array.from({ length: MAX_PET_AVAIL_LEVEL }, (_, i) => r.number(`step ${i + 1} of kind ${kind}`));
          const itemId = r.number(`the item of kind ${kind}`);
          const models: [number, number, number] = [
            r.number(`the D-C model of kind ${kind}`),
            r.number(`the B-A model of kind ${kind}`),
            r.number(`the S model of kind ${kind}`),
          ];
          kinds[kind] = { kind, dst, steps, itemId, models, hatchWeight: r.number(`the hatch weight of kind ${kind}`) };
          kind++;
        }
        break;
      }
      case 'FeedEnergy': {
        const index = r.number('the FeedEnergy index');
        if (index !== 0 && index !== 1) r.fail(`FeedEnergy ${index} is not 0 or 1`, r.lastToken());
        open(`FeedEnergy ${index}`);
        for (let costMin = r.number("a cost or '}'"); !closed(); costMin = r.number("a cost or '}'")) {
          const costMax = r.number(`the top cost of the row from ${costMin}`);
          const energyMin = r.number(`the least food of the row from ${costMin}`);
          feedEnergy[index as 0 | 1].push({
            costMin, costMax, energyMin, energyMax: r.number(`the most food of the row from ${costMin}`),
          });
        }
        break;
      }
      case 'IncrementExp':
        readColumn('IncrementExp', PL_S, incrementExp);
        break;
      case 'MaxEnergy':
        readColumn('MaxEnergy', PL_S + 1, maxEnergy, (value) => value & 0xffff); // (WORD)( dwMaxEnergy )
        break;
      case 'Penalty': {
        open('Penalty');
        let level = 0;
        for (let exp = r.float("an EXP loss or '}'"); !closed(); exp = r.float("an EXP loss or '}'")) {
          if (level >= PL_MAX - 1) r.fail(`more than ${PL_MAX - 1} Penalty rows (D to S)`, r.lastToken());
          // FLOAT fExp; the energy is a WORD
          penalty[level] = { exp: Math.fround(exp), energy: r.number(`the energy loss of row ${level}`) & 0xffff };
          level++;
        }
        break;
      }
      default:
      // any other word is passed over
    }
  }
  return { kinds, feedEnergy, incrementExp, maxEnergy, penalty };

  /** A block of one number a level, from D: `values[level - PL_D]`, at most `max` of them. */
  function readColumn(block: string, max: number, values: number[], cast = (value: number): number => value): void {
    open(block);
    let level = 0;
    for (let value = r.number("a value or '}'"); !closed(); value = r.number("a value or '}'")) {
      if (level >= max) r.fail(`more than ${max} ${block} rows`, r.lastToken());
      values[level++] = cast(value);
    }
  }
}

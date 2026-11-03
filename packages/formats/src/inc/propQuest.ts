// The quest files (`propQuest.inc` and its four sisters, Resource/Masquerade.prj:116-123), copying
// CProject::LoadPropQuest (Source/_Common/Project.cpp:1368-2517). Each file is a list of
//
//   QUEST_ID
//   {
//       SetTitle( IDS_... );
//       setting { SetCharacter( "Key" ); SetEndCondKillNPC( 0, MI_X, 10, x, z, 1 ); ... SetHeadQuest( 6051 ); }
//       SetDialog( QSAY_BEGIN1, IDS_... );
//       state 0 { SetDesc( IDS_... ); }
//   }
//
// read token by token (CScript: an `IDS_*` name gives the string-table text, `MI_*`, `II_*`, `JOB_*` ... are #defines).
// Every statement here is `Name( arguments )`, the arguments split at commas: the reader collects them and reads the
// statements the browser uses by position, as the C++ does (Project.cpp:1583-2443); the others (SetDialog, QuestItem,
// the begin conditions it does not show ...) are read and dropped. Two files leave out a statement's `;`
// (propQuest.inc:17484, propQuest-RequestBox2.inc:103), which the C++ never reads either. A goal's text id is the last
// four characters of its token as written (`GetToken_NoDef`, `atoi( Token.Right( 4 ) )`).
//
// The giver is the last `SetCharacter` in the client's language, English (a `SetCharacter( "Key", LANG_KOR )` is the
// Korean client's, Project.cpp:1468-1492), and the end NPC when no `SetEndCondCharacter` names one (:2440-2453). Given
// `skip`, a quest that cannot be read is passed to it and left out, and the reader goes on after it (the spec's §4: a
// row that cannot be read is said and skipped); without, it throws.

import { FormatError } from '../errors';
import { ScriptReader, atoi, type ScriptToken } from '../script/cscript';
import type { WebQuest, WebQuestGoal, WebQuestItem } from '../web/quests';
import { QUEST_KIND } from '../web/quests';

const READER = 'readPropQuest';
const CPP_REF = 'Source/_Common/Project.cpp:1368 CProject::LoadPropQuest';
/** `MAX_QUESTCONDITEM` (Project.h:62): a job-filtered item's job at or above it means any job. */
const MAX_QUESTCONDITEM = 64;

/** The `__IMPROVE_QUEST_INTERFACE` remap of the old head ids (Project.cpp:2329-2364); the others stay. */
function remapHead(head: number): number {
  if (head === 1992) return QUEST_KIND.EVENT;
  if (head === 1996) return QUEST_KIND.SCENARIO;
  if (head === 1999) return QUEST_KIND.REQUEST;
  if (head === 1993 || head === 1994 || head === 1995 || head === 1997 || head === 1998) return QUEST_KIND.NORMAL;
  return head;
}

/** `Resource/lang.h`: a giver's language tag, by name when the defines lack the header. */
const LANGUAGES: Readonly<Record<string, number>> = {
  LANG_KOR: 0, LANG_ENG: 1, LANG_JAP: 2, LANG_CHI: 3, LANG_THA: 4, LANG_TWN: 5, LANG_GER: 6, LANG_SPA: 7, LANG_FRE: 8,
  LANG_HK: 9, LANG_POR: 10, LANG_VTN: 11, LANG_RUS: 12,
};
/** The client's `GetLanguage()` and `GetSubLanguage()`: this English client's. */
const CLIENT_LANGUAGE = 1;
const CLIENT_SUB_LANGUAGE = 0;

/** One argument: the tokens between two commas. */
type Arg = readonly ScriptToken[];

function numberOf(arg: Arg | undefined): number {
  if (arg === undefined || arg.length === 0) return 0;
  const negative = arg[0]!.kind === 'symbol' && arg[0]!.text === '-';
  const tok = arg[negative ? 1 : 0];
  if (tok === undefined) return 0;
  const value = tok.value ?? atoi(tok.text);
  return negative ? -value : value;
}

const textOf = (arg: Arg | undefined): string => arg?.map((tok) => tok.text).join('') ?? '';
const languageOf = (arg: Arg | undefined): number => LANGUAGES[textOf(arg)] ?? numberOf(arg);

export function readPropQuest(
  text: string,
  defines: ReadonlyMap<string, number>,
  strings: ReadonlyMap<string, string>,
  file = 'propQuest.inc',
  skip?: (error: FormatError) => void,
): WebQuest[] {
  const r = new ScriptReader(text, defines, strings, { file, reader: READER, cppRef: CPP_REF });
  const quests: WebQuest[] = [];
  let pending: ScriptToken | undefined;
  const next = (): ScriptToken | undefined => {
    const tok = pending ?? r.tokenOrEnd();
    pending = undefined;
    return tok;
  };
  const isSymbol = (tok: ScriptToken | undefined, symbol: string): boolean => tok?.kind === 'symbol' && tok.text === symbol;

  /** The arguments after a `(`, up to its `)`. */
  const readArgs = (statement: ScriptToken): Arg[] => {
    const args: ScriptToken[][] = [[]];
    let depth = 1;
    for (;;) {
      const tok = next();
      if (tok === undefined) return r.fail(`the script ends inside ${statement.text}( ... )`, statement);
      if (isSymbol(tok, '(')) depth++;
      else if (isSymbol(tok, ')') && --depth === 0) return args.filter((arg, i) => arg.length > 0 || i > 0);
      if (depth === 1 && isSymbol(tok, ',')) args.push([]);
      else args.at(-1)!.push(tok);
    }
  };

  /**
   * After a quest that could not be read: on past its first brace group and the closing braces left after it (a quest
   * whose `{` is missing), to the next quest's key. False when the script ends first.
   */
  const resync = (): boolean => {
    let depth = 0;
    for (;;) {
      const tok = next();
      if (tok === undefined) return false;
      if (isSymbol(tok, '{')) depth++;
      else if (isSymbol(tok, '}') && depth > 0 && --depth === 0) break;
    }
    for (;;) {
      const tok = next();
      if (tok === undefined) return false;
      if (!isSymbol(tok, '}')) {
        pending = tok;
        return true;
      }
    }
  };

  let key = next();
  while (key !== undefined) {
    try {
      quests.push(readQuest(key));
    } catch (error) {
      if (skip === undefined || !(error instanceof FormatError)) throw error;
      skip(error);
      if (!resync()) break;
    }
    key = next();
  }
  return quests;

  function readQuest(key: ScriptToken): WebQuest {
    const quest: WebQuest = { id: numberOf([key]), title: '', head: 0, states: {} };
    const unsupported = new Set<string>();
    let patrolName = '';
    let endCondCharacter = false;
    if (!isSymbol(next(), '{')) r.fail(`expected '{' after quest ${key.text}`, key);
    let depth = 1;
    let state: number | undefined;
    let stateDepth = -1;

    const goal = (args: Arg[], at: number): WebQuestGoal | undefined => {
      if (args.length < at + 3) return undefined;
      const x = numberOf(args[at]), z = numberOf(args[at + 1]);
      return { x, z, text: atoi(textOf(args[at + 2]).slice(-4)) };
    };
    const item = (args: Arg[], withGoal: boolean): WebQuestItem => {
      const type = numberOf(args[1]);
      let jobOrItem = numberOf(args[2]);
      if (type === 0 && jobOrItem >= MAX_QUESTCONDITEM) jobOrItem = -1;
      const found: WebQuestItem = { sex: numberOf(args[0]), type, jobOrItem, item: numberOf(args[3]), count: numberOf(args[4]) };
      const at = withGoal ? goal(args, 5) : undefined;
      return at === undefined ? found : { ...found, goal: at };
    };
    const rewards = (): NonNullable<WebQuest['rewards']> => (quest.rewards ??= {});

    const apply = (name: string, args: Arg[]): void => {
      const n = (i: number): number => numberOf(args[i]);
      switch (name) {
        case 'SetTitle': quest.title = textOf(args[0]); break;
        case 'SetHeadQuest': quest.head = remapHead(n(0)); break;
        case 'SetCharacter': {
          // another language's giver is skipped; each one read replaces the last (Project.cpp:1468-1492)
          const sub = args.length > 2 ? n(2) : 0;
          if (args.length > 1 && (languageOf(args[1]) !== CLIENT_LANGUAGE || sub !== CLIENT_SUB_LANGUAGE)) break;
          quest.npc = textOf(args[0]);
          break;
        }
        case 'SetEndCondCharacter': {
          // an empty key is the giver (Project.cpp:1959-1963)
          const npc = textOf(args[0]) || (quest.npc ?? '');
          if (npc !== '') quest.endNpc = npc;
          endCondCharacter = true;
          const at = goal(args, 1);
          if (at !== undefined) quest.endGoal = at;
          break;
        }
        case 'SetEndCondMultiCharacter': endCondCharacter = true; break;
        case 'SetBeginCondLevel': quest.levelMin = n(0); quest.levelMax = n(1); break;
        case 'SetBeginCondJob': quest.jobs = args.map((arg) => numberOf(arg)); break;
        case 'SetRemove': if (n(0) === 0) quest.noRemove = true; else delete quest.noRemove; break;
        case 'SetRepeat': if (n(0) !== 0) quest.repeat = true; else delete quest.repeat; break;
        case 'SetEndCondLimitTime': quest.limitTime = n(0); break;
        case 'SetEndCondKillNPC': {
          const slot = n(0) === 1 ? 1 : 0;
          const kill: NonNullable<WebQuest['kills']>[number] = { slot, mover: n(1), count: n(2) };
          const at = goal(args, 3);
          (quest.kills ??= []).push(at === undefined ? kill : { ...kill, goal: at });
          break;
        }
        case 'SetEndCondItem': (quest.items ??= []).push(item(args, true)); break;
        case 'SetEndCondOneItem': (quest.oneItems ??= []).push(item(args, false)); break;
        case 'SetEndCondPatrolZone': {
          const at = goal(args, 6);
          quest.patrol = { world: n(0), name: patrolName, ...(at === undefined ? {} : { goal: at }) };
          break;
        }
        case 'SetPatrolZoneName':
          patrolName = textOf(args[0]);
          if (quest.patrol !== undefined) quest.patrol.name = patrolName;
          break;
        case 'SetEndCondDialog': {
          const at = goal(args, 2);
          quest.dialog = { npc: textOf(args[0]), key: textOf(args[1]), ...(at === undefined ? {} : { goal: at }) };
          break;
        }
        case 'SetEndCondLevel': quest.endLevel = [n(0), n(1)]; break;
        case 'SetEndCondGold': quest.endGold = n(0); break;
        case 'SetEndCondExpPercent': quest.endExpPercent = [n(0), n(1)]; break;
        case 'SetEndCondSkillLvl': quest.endSkill = [n(0), n(1)]; break;
        case 'SetEndCondState': quest.endState = n(0); break;
        case 'SetEndCondCompleteQuest':
          quest.endCompleteQuests = { oper: n(0), quests: args.slice(1).map((arg) => numberOf(arg)).filter((id) => id !== 0) };
          break;
        // the end terms the browser cannot judge: unsupported once set to anything but their default
        case 'SetEndCondParty': if (args.some((arg) => numberOf(arg) !== 0)) unsupported.add('party'); break;
        case 'SetEndCondGuild': if (args.some((arg) => numberOf(arg) !== 0)) unsupported.add('guild'); break;
        case 'SetEndCondPetLevel': if (n(0) !== -1) unsupported.add('pet'); break;
        case 'SetEndCondPetExp': if (n(0) !== 0) unsupported.add('pet'); break;
        case 'SetEndCondDisguise': unsupported.add('disguise'); break;
        case 'SetEndCondKarmaPoint': unsupported.add('karma'); break;
        case 'SetEndCondChaotic': if (n(0) !== 0) unsupported.add('chaotic'); break;
        case 'SetEndRewardItem':
        case 'SetEndRewardItemWithAbilityOption':
          (rewards().items ??= []).push(item(args, false));
          break;
        case 'SetEndRewardGold': rewards().gold = [n(0), n(1)]; break;
        case 'SetEndRewardExp': rewards().exp = [n(0), n(1)]; break;
        case 'SetEndRewardSkillPoint': rewards().skillPoints = n(0); break;
        case 'SetEndRewardPKValue': rewards().pk = [n(0), n(1)]; break;
        case 'SetEndRewardHide': if (n(0) !== 0) rewards().hidden = true; break;
        case 'SetDesc': if (state !== undefined) quest.states[state] = textOf(args[0]); break;
        default: // read and dropped (SetDialog, QuestItem, the begin conditions it does not show ...)
      }
    };

    while (depth > 0) {
      const tok = next();
      if (tok === undefined) return r.fail(`the script ends inside quest ${quest.id}`, key);
      if (isSymbol(tok, '{')) {
        depth++;
      } else if (isSymbol(tok, '}')) {
        if (depth === stateDepth) {
          state = undefined;
          stateDepth = -1;
        }
        depth--;
      } else if (tok.kind === 'ident' && tok.text === 'state') {
        state = numberOf([next()!]);
        stateDepth = depth + 1;
      } else if (tok.kind === 'ident') {
        const after = next();
        if (isSymbol(after, '(')) {
          apply(tok.text, readArgs(tok));
          const end = next();
          if (!isSymbol(end, ';')) pending = end;
        } else {
          pending = after; // a word on its own: `setting`
        }
      }
    }
    if (unsupported.size > 0) quest.unsupported = [...unsupported];
    // no SetEndCondCharacter: the giver is the end NPC (Project.cpp:2440-2453)
    if (!endCondCharacter && quest.npc !== undefined && quest.npc !== '') quest.endNpc = quest.npc;
    return quest;
  }
}

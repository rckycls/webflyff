// The client halves of the chat commands (2026-11-10, docs/superpowers/specs/2026-11-10-gm-commands-research.md §2): what
// Neuz runs itself for a TCM_CLIENT command, and for a TCM_BOTH one whose half decides what goes to the server
// (`ParsingCommand`, `_Interface/FuncTextCmd.cpp:5594-5602`: the half runs; if it returns TRUE the line goes, as typed or
// as the half rewrote it with `scanner.SetProg`). The others of TCM_BOTH have an empty half and go as typed
// (`hud/chatCommands.ts`).
//
//   TextCmd_Position      FuncTextCmd.cpp:3568-3578   TID_GAME_NOWPOSITION by PutString (the System window)
//   TextCmd_Time          :170-183                    "Real Time - %H:%M:%S"; its "Madrigal Time" line is left out (the web
//                                                     keeps no game clock: GAMETIMER has no reader)
//   TextCmd_JobName       :3723-3760                  four red lines: the expert and professional jobs and their levels
//   TextCmd_ClearPetName  :2194-2200                  CLEAR_PET_NAME
//   TextCmd_ip            :3596-3632                  a focused player's "/ip name", else the line
//   TextCmd_SkillLevel    :1356-1404                  the skill window's chosen skill: "/slv skill level" (TID_GAME_GAMETEXT001)
//   TextCmd_CreateItem    :2537-2550                  no words: CWndAdminCreateItem (left out), nothing sent
//   TextCmd_indirect      :3350-3363                  no words: CWndIndirectTalk (left out), nothing sent
//   TextCmd_MakePetFeed   :390-402                    the food mill opened first (nothing sent); open, the line goes
//   TextCmd_ResistItem    :1613-1661                  needs CWndUpgradeBase (APP_TEST), TextCmd_Piercing :1711-1738 needs
//                                                     APP_PIERCING with an item: neither window is in the web, nothing sent

import type { Vec3 } from '@flyffweb/protocol';
import { formatText } from './hud/format';

/** The TCM_BOTH commands whose client half decides what is sent: `lineAction` hands them here like a TCM_CLIENT one. */
export const CLIENT_HALVES: ReadonlySet<string> = new Set([
  'ip', 'skilllevel', 'indirect', 'ResistItem', 'createitem', 'Piercing', 'makepetfeed',
]);

/** What a client half reads of the game. */
export interface ClientHalfContext {
  /** `GetObjFocus()`: the focused mover, a player or not, and its name; null for none. */
  focus: { isPlayer: boolean; name: string } | null;
  /** The skill window's chosen skill (`GetCurSelect`), with its name and `dwExpertMax`; null when it is closed or none is. */
  chosenSkill: { skill: number; name: string; expertMax: number } | null;
  /** `g_WndMng.m_pWndPetFoodMill` is open. */
  foodMillOpen: boolean;
  /** The jobs' names (`prj.m_aJob[i].szName`), by job. */
  jobs: ReadonlyArray<{ title?: string }>;
  /** `g_pPlayer->GetPos()`, and the PC's clock. */
  pos: Vec3;
  now: Date;
  text: (id: string) => { text: string; color: number } | undefined;
}

/** What a half does: the line sent (`SendChat`), the lines printed (`PutString`), and a window or packet of its own. */
export interface ClientHalfResult {
  send?: string;
  lines: Array<{ text: string; color: number }>;
  openFoodMill?: boolean;
  clearPetName?: boolean;
}

const RED = 0xffff0000;
const WHITE = 0xffffffff;
/** `defineJob.h:19-20, :42, :50, :63` (V15): `MAX_JOB_LEVEL`, `MAX_EXP_LEVEL`, `MAX_JOBBASE`, `MAX_EXPERT`, `MAX_PROFESSIONAL`. */
const MAX_JOB_LEVEL = 15, MAX_EXP_LEVEL = 45, MAX_JOBBASE = 1, MAX_EXPERT = 6, MAX_PROFESSIONAL = 16;

/** `scanner.GetNumber()` of the words: the first one as a number (`atoi`), 0 for none. */
function firstNumber(args: string): number {
  const n = Number.parseInt(args.trim().split(/\s+/)[0] ?? '', 10);
  return Number.isNaN(n) ? 0 : n;
}

/** "Expert Job : " and the names of `from` to `to`, a name of 15 letters or more left out (its comma stays). */
function jobList(head: string, jobs: ClientHalfContext['jobs'], from: number, to: number): string {
  let out = head;
  for (let i = from; i < to; i++) {
    const name = jobs[i]?.title ?? '';
    if (name.length < 15) {
      out += name;
      if (i + 1 !== to) out += ', ';
    }
  }
  return out;
}

/** Runs the client half of `command` (its long name), typed as `line` with `args` after its name. */
export function runClientHalf(command: string, args: string, line: string, ctx: ClientHalfContext): ClientHalfResult {
  const words = args.trim();
  switch (command) {
    case 'position': {
      const entry = ctx.text('TID_GAME_NOWPOSITION');
      return entry === undefined ? { lines: [] }
        : { lines: [{ text: formatText(entry.text, [ctx.pos[0], ctx.pos[1], ctx.pos[2]]), color: entry.color }] };
    }
    case 'Time': {
      const two = (n: number): string => String(n).padStart(2, '0');
      const now = ctx.now;
      return { lines: [{ text: `Real Time - ${two(now.getHours())}:${two(now.getMinutes())}:${two(now.getSeconds())}`, color: WHITE }] };
    }
    case 'jobname':
      return {
        lines: [
          { text: jobList('Expert Job : ', ctx.jobs, MAX_JOBBASE, MAX_EXPERT), color: RED },
          { text: `Expert Level : ${MAX_JOB_LEVEL + 1} ~ ${MAX_JOB_LEVEL + MAX_EXP_LEVEL}`, color: RED },
          { text: jobList('Professional Job : ', ctx.jobs, MAX_EXPERT, MAX_PROFESSIONAL), color: RED },
          { text: `Professional Level : ${MAX_JOB_LEVEL + MAX_EXP_LEVEL} ~~~ `, color: RED },
        ],
      };
    case 'ClearPetName':
      return { lines: [], clearPetName: true };
    case 'ip':
      return { send: ctx.focus?.isPlayer === true ? `/ip ${ctx.focus.name}` : line, lines: [] };
    case 'skilllevel': {
      const level = firstNumber(words);
      const chosen = ctx.chosenSkill;
      if (chosen === null) return { lines: [{ text: ctx.text('TID_GAME_CHOICESKILL')?.text ?? '', color: RED }] };
      if (chosen.expertMax < 1 || chosen.expertMax < level) {
        const limit = ctx.text('TID_GAME_SKILLLEVELLIMIT')?.text ?? '';
        return { lines: [{ text: formatText(limit, [chosen.name, chosen.expertMax]), color: RED }] };
      }
      return { send: formatText(ctx.text('TID_GAME_GAMETEXT001')?.text ?? '/slv %d %d', [chosen.skill, level]), lines: [] };
    }
    case 'createitem':
    case 'indirect':
      return words === '' ? { lines: [] } : { send: line, lines: [] };
    case 'makepetfeed':
      return ctx.foodMillOpen ? { send: line, lines: [] } : { lines: [], openFoodMill: true };
    default:
      // ResistItem, Piercing (their windows are not in the web); the trade, party and shout toggles and the block list
      // (no option or window here; the whisper, friend and log-in ones are the Messenger's, friends/friendHud.ts, run
      // before this); destroyguild (no guilds in the web)
      return { lines: [] };
  }
}

// The chat lines of the quest messages (Piece 7 M1):
//
//   CDPClient::OnSetQuest     Neuz/DPClient.cpp:8444-8573     for a known quest that has not ended: a new time
//                                                            (TID_QUEST_LIMIT_TIME; at 0 TID_QUEST_LIMIT_TIMEOUT and
//                                                            TID_QUEST_FAILURE, then SendRemoveQuest), the patrol
//                                                            (TID_QUEST_PATROL), a kill count (TID_QUEST_KILL_NPC), the
//                                                            dialogue (TID_QUEST_DIALOG); then, new or known, for any
//                                                            quest with a prop (:8546-8562): at state 1
//                                                            TID_EVE_STARTJOB1, every time, and at state 14 TID_EVE_ENDJOB1
//                                                            but for QUEST_CREGUILD (these two in their TID colours,
//                                                            PutDefinedString)
//   CDPClient::OnRemoveQuest  DPClient.cpp:14633-14684        a cancelled quest: TID_GAME_REMOVEQUEST
//
// The server's own lines (TID_EVE_STARTQUEST, TID_EVE_ENDQUEST, the rewards ...) come as DEFINEDTEXT, which Piece 5 shows.
// The time is compared without its "all met" bit 15, as Neuz masks it (DPClient.cpp:8473-8474).

import { QS_END, type OwnQuest } from '@flyffweb/protocol';
import type { Texts } from '../gameData';
import { formatText } from '../hud/format';
import type { QuestChange } from '../OwnState';
import type { QuestCatalog, QuestNames } from './questRules';

export interface QuestLine {
  text: string;
  color?: number;
}

const minutes = (time: number): number => time & 0x7fff;
/** `QUEST_CREGUILD` (Resource/definequest.h:154), whose end says no "Quest Complete!". */
const QUEST_CREGUILD = 142;

export function questLines(change: QuestChange, catalog: QuestCatalog | null, names: QuestNames, texts: Texts): QuestLine[] {
  const text = (id: string, fallback: string): string => texts.get(id)?.text ?? fallback;
  const defined = (id: string, fallback: string): QuestLine => {
    const entry = texts.get(id);
    return entry?.color === undefined ? { text: entry?.text ?? fallback } : { text: entry.text, color: entry.color };
  };
  // the line every SETQUEST of a quest with a prop ends with (DPClient.cpp:8546-8562)
  const step = (quest: OwnQuest): QuestLine[] => {
    if (catalog?.get(quest.id) === undefined) return [];
    if (quest.state === 1) return [defined('TID_EVE_STARTJOB1', 'The next step of the quest has started.')];
    if (quest.state === QS_END && quest.id !== QUEST_CREGUILD) return [defined('TID_EVE_ENDJOB1', 'Quest Complete!')];
    return [];
  };
  switch (change.kind) {
    case 'started':
    case 'ended':
      return step(change.quest);
    case 'removed': {
      if (!change.cancelled) return [];
      const title = catalog?.get(change.questId)?.title || `Quest ${change.questId}`;
      return [{ text: formatText(text('TID_GAME_REMOVEQUEST', '%s quest has been cancelled.'), [title]) }];
    }
    case 'listsChanged':
      return [];
    case 'progress': {
      const { before, after } = change;
      const prop = catalog?.get(after.id);
      const lines: QuestLine[] = [];
      if (minutes(before.time) !== minutes(after.time)) {
        if (minutes(after.time) > 0) {
          lines.push({ text: formatText(text('TID_QUEST_LIMIT_TIME', 'Time Left: #b%d minutes#nb'), [minutes(after.time)]) });
        } else {
          lines.push({ text: text('TID_QUEST_LIMIT_TIMEOUT', '#bYou exceeded the time limit#nb') });
          lines.push({ text: text('TID_QUEST_FAILURE', 'Quest cancelled.') });
        }
      }
      if (!before.patrol && after.patrol) {
        lines.push({ text: formatText(text('TID_QUEST_PATROL', '%s Search'), [prop?.patrol?.name ?? '']) });
      }
      for (const slot of [0, 1] as const) {
        if (before.kills[slot] === after.kills[slot]) continue;
        const kill = prop?.kills?.find((k) => k.slot === slot);
        const name = kill === undefined ? '???' : names.mover(kill.mover);
        lines.push({ text: formatText(text('TID_QUEST_KILL_NPC', 'Defeat %s #b(%d/%d)#nb'), [name, after.kills[slot], kill?.count ?? after.kills[slot]]) });
      }
      if (!before.dialog && after.dialog) {
        lines.push({ text: formatText(text('TID_QUEST_DIALOG', 'Chat with %s'), [prop?.dialog === undefined ? '' : names.npc(prop.dialog.npc)]) });
      }
      return [...lines, ...step(after)];
    }
  }
}

/** Whether the change ran out the quest's time, after which Neuz abandons it itself (`DPClient.cpp:8484`). */
export function timedOut(change: QuestChange): boolean {
  return change.kind === 'progress' && minutes(change.before.time) > 0 && minutes(change.after.time) === 0;
}

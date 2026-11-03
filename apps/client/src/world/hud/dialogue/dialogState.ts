// The dialogue's state, as CWndDialog keeps it (Source/_Interface/WndDialog.cpp), without the window:
//
//   Say, EndSay                  :423-453, :563-577   one SAY is one page; every change shows page 0 again
//   BeginText                    :578-594             a press clears the pages, the links and the answers
//   AddKeyButton                 :689-709             a word it has already is ignored; at most 32
//   RemoveKeyButton              :721-740             by key
//   RemoveAllKeyButton           :710-720             the keys and both quest lists
//   AddAnswerButton              :742-753             appended as they come; shown on the last page only (:808-900)
//   UpdateButtonEnable           :902-913             a next page while this is not the last
//   OnLButtonUp, OnChildNotify   :348-419, :916-990   a key, an answer, a link or a quest row sends its key, param and
//                                                     quest, unless 1 s has not gone since the last (m_timer, :239);
//                                                     the New Quest and Quests in Progress keys show their list
//                                                     instead when it has rows
//   AddNewQuestList,             :993-1080            the first row makes its list's key (word = key, params 0); a
//   AddCurrentQuestList                               QUEST_NEXT_LEVEL row is shown but sends nothing
//
// The quest data the client keeps (QuestProp: the title, the begin levels; __IsEndQuestCondition) is M1's: `QuestLookup`
// stands for it, and M0 passes `NO_QUESTS`. A quest SAY's title is then its row's word, which the server takes from its
// own QuestProp (ScriptHelper.cpp:465-496).

import type { NpcAction } from '@flyffweb/protocol';
import { sayText } from './dialogText';

export interface DialogButton { word: string; key: string; param: number; quest: number }
/** A quest list's row; `valid` is false for `QUEST_NEXT_LEVEL` (SetItemValidity, :1072-1073). */
export interface QuestRow extends DialogButton { valid: boolean }
/** What a press sends with `SendScriptDialogReq` (`RunScript`, :234-240). */
export interface DialogRequest { key: string; param: number; quest: number }
/** The client's quest data, filled by M1. */
export interface QuestLookup {
  titleOf(questId: number): { title: string; levelMin: number; levelMax: number } | undefined;
  isReadyToHandIn(questId: number): boolean;
}
export const NO_QUESTS: QuestLookup = { titleOf: () => undefined, isReadyToHandIn: () => false };
/** The two quest keys' words: TID_GAME_NEW_QUEST and TID_GAME_CURRENT_QUEST. */
export interface DialogWords { newQuest: string; currentQuest: string }
/** `m_timer.Set( SEC( 1 ) )` (:239): presses wait this long after a request. */
export const REQUEST_LOCK_MS = 1000;
/** The size of `m_aKeyButton` (WndDialog.h). */
const MAX_KEYS = 32;
const NEXT_LEVEL = 'QUEST_NEXT_LEVEL';

export class DialogState {
  pages: string[] = [];
  page = 0;
  keys: DialogButton[] = [];
  answers: DialogButton[] = [];
  newQuests: QuestRow[] = [];
  currentQuests: QuestRow[] = [];
  /** `m_nSelectKeyButton`: the last key pressed, by index (-1: none). */
  selectedKey = -1;
  /** The group box's title as the last key press set it (`SetTitle`, :375); null for TID_GAME_DIALOG. */
  title: string | null = null;
  /** The quest list shown in the text area, if one is. */
  list: 'new' | 'current' | null = null;
  private lockedUntil = -Infinity;

  constructor(private readonly words: DialogWords, private readonly quests: QuestLookup) {}

  get hasNextPage(): boolean {
    return this.page < this.pages.length - 1;
  }

  get visibleAnswers(): readonly DialogButton[] {
    return this.pages.length > 0 && this.page === this.pages.length - 1 ? this.answers : [];
  }

  apply(action: NpcAction): 'changed' | 'exit' | 'ignored' {
    switch (action.kind) {
      case 'say':
        this.pages.push(sayText(action.text, action.quest === 0 ? undefined : this.questTitle(action.quest)));
        this.list = null;
        break;
      case 'key':
        if (this.keys.length >= MAX_KEYS || this.keys.some((k) => k.word === action.label)) return 'ignored';
        this.keys.push(button(action));
        break;
      case 'answer':
        this.answers.push(button(action));
        break;
      case 'removeKey':
        this.keys = this.keys.filter((k) => k.key !== action.key);
        break;
      case 'clear':
        this.keys = [];
        this.newQuests = [];
        this.currentQuests = [];
        this.list = null;
        break;
      case 'newQuest':
      case 'currentQuest': {
        const isNew = action.kind === 'newQuest';
        const word = isNew ? this.words.newQuest : this.words.currentQuest;
        if (!this.keys.some((k) => k.word === word) && this.keys.length < MAX_KEYS) this.keys.push({ word, key: word, param: 0, quest: 0 });
        const rows = isNew ? this.newQuests : this.currentQuests;
        if (!rows.some((row) => row.word === action.label && row.quest === action.quest)) {
          rows.push({ ...button(action), valid: action.key !== NEXT_LEVEL });
        }
        break;
      }
      case 'exit':
        return 'exit';
      default:
        return 'ignored';
    }
    this.page = 0; // EndSay
    return 'changed';
  }

  nextPage(): void {
    if (this.hasNextPage) this.page++;
  }

  pressKey(index: number, now: number): DialogRequest | null {
    const key = this.keys[index];
    if (key === undefined || this.locked(now)) return null;
    this.selectedKey = index;
    this.title = key.word;
    this.beginText(); // before the branch, so a list never shows over the last page's answers (:379)
    const list = key.word === this.words.newQuest && this.newQuests.length > 0 ? 'new'
      : key.word === this.words.currentQuest && this.currentQuests.length > 0 ? 'current' : null;
    if (list !== null) {
      this.list = list;
      return null;
    }
    this.list = null;
    return this.send(key, now);
  }

  pressAnswer(index: number, now: number): DialogRequest | null {
    const answer = this.visibleAnswers[index];
    return answer === undefined || this.locked(now) ? null : this.send(answer, now);
  }

  pressLink(key: string, now: number): DialogRequest | null {
    return this.locked(now) ? null : this.send({ key, param: 0, quest: 0 }, now);
  }

  pressQuest(list: 'new' | 'current', index: number, now: number): DialogRequest | null {
    const row = (list === 'new' ? this.newQuests : this.currentQuests)[index];
    if (row === undefined || !row.valid || this.locked(now)) return null;
    this.list = null;
    return this.send(row, now);
  }

  private questTitle(quest: number): string | undefined {
    return this.quests.titleOf(quest)?.title ??
      [...this.newQuests, ...this.currentQuests].find((row) => row.quest === quest)?.word;
  }

  private locked(now: number): boolean {
    return now < this.lockedUntil;
  }

  /** `CWndDialog::BeginText` (:578-594): the pages, the links and the answers go. */
  private beginText(): void {
    this.pages = [];
    this.page = 0;
    this.answers = [];
  }

  /** BeginText, then RunScript and its timer. */
  private send(button: { key: string; param: number; quest: number }, now: number): DialogRequest {
    this.beginText();
    this.lockedUntil = now + REQUEST_LOCK_MS;
    return { key: button.key, param: button.param, quest: button.quest };
  }
}

function button(action: { label: string; key: string; param: number; quest: number }): DialogButton {
  return { word: action.label, key: action.key, param: action.param, quest: action.quest };
}

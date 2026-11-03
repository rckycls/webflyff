// The dialogue window, Neuz's APP_DIALOG_EX (CWndDialog, Source/_Interface/WndDialog.cpp):
//
//   resdata.inc APP_DIALOG_EX   Resource/resdata.inc:13842-13894  "WndDialogEx.tga", 512 x 320, a caption ("Conversation"),
//                                                                 the controls below in client coordinates
//   CWndDialog::Initialize      WndDialog.cpp:330-338             WBS_MODAL
//   CWndDialog::OnInitialUpdate WndDialog.cpp:242-328             the group box "Dialog" in ARGB(255,128,0,64); the quest
//                                                                 papers; the NPC's picture `char\<m_szChar>`; centred,
//                                                                 10 px down
//   CWndDialog::OnDraw          WndDialog.cpp:64-160              the page, the context words, the keys (ARGB(255,80,80,
//                                                                 80), selected ARGB(255,128,0,255), hovered
//                                                                 ARGB(255,16,16,255) and underlined), the quest icons,
//                                                                 the picture
//   CWndDialog::MakeKeyButton   WndDialog.cpp:755-805             the keys in rows in CUSTOM2, each its text + 16 wide;
//                                                                 the first quest key starts a row
//   CWndDialog::MakeAnswerButton WndDialog.cpp:808-900            __YES__ __NO__ __CANCEL__ __OK__ as ButtYes/No/Cancel/
//                                                                 Ok.tga, 72 x 20, from the middle of CUSTOM1 less
//                                                                 90 per special answer / 2, 20 px over its bottom,
//                                                                 90 px on for every answer; the others as text
//   CWndDialog::UpdateButtonEnable WndDialog.cpp:902-913          WIDC_BUTTON1 while this page is not the last
//   CWndDialog::AddQuestList    WndDialog.cpp:1061-1080           a row `[min~max] title`, the levels bold
//   Render*QuestListIcon        WndDialog.cpp:1021-1060           new: green, red when it is QUEST_NEXT_LEVEL; current:
//                                                                 yellow when it can be handed in, grey otherwise
//
// What the server sends is shown as text. The rules are DialogState's. Escape closes it (plan decision 4): its own key
// listener comes before the modal backdrop's, which holds every other key. On a touch phone it is fitted whole and
// centred (decision 6), with larger hit areas (style.css). A tap on the text turns the page, as the spec asks (§3.1).

import type { WebNpc } from '@flyffweb/formats';
import type { NpcAction } from '@flyffweb/protocol';
import type { Texts } from '../../gameData';
import { themeKey, type UiArt } from '../art';
import { pictureButton, place, type ControlRect } from '../button';
import { WindowFrame } from '../frame';
import { ModalBackdrop } from '../modal';
import { parseDialogText } from './dialogText';
import { DialogState, type DialogRequest, type QuestLookup, type QuestRow } from './dialogState';

/** `APP_DIALOG_EX "WndDialogEx.tga" 0 512 320` (resdata.inc:13842); 10 px down (WndDialog.cpp:313-320). */
export const DIALOG = { width: 512, height: 320, top: 10 } as const;
/** WIDC_CUSTOM1: the page and the quest lists. */
export const TEXT_RECT: ControlRect = { left: 218, top: 38, width: 268, height: 168 };
/** WIDC_CUSTOM2: the keys. */
export const KEYS_RECT: ControlRect = { left: 214, top: 216, width: 278, height: 60 };
/** WIDC_CUSTOM3: the NPC's picture. */
export const PICTURE_RECT: ControlRect = { left: 6, top: 22, width: 200, height: 240 };
/** WIDC_BUTTON1 "wndButtEnter.bmp": the next page. */
export const ENTER_RECT: ControlRect = { left: 458, top: 176, width: 24, height: 24 };
/** WIDC_GROUP_BOX_TITLE. */
export const TITLE_RECT: ControlRect = { left: 222, top: 12, width: 260, height: 20 };

const TITLE = 'Conversation'; // IDS_RESDATA_INC_005254
const SPECIAL: Readonly<Record<string, string>> = {
  __YES__: 'ButtYes.tga', __NO__: 'ButtNo.tga', __CANCEL__: 'ButtCancel.tga', __OK__: 'ButtOk.tga',
};
const ANSWER = { width: 72, height: 20, step: 90 } as const;
const PAPERS = {
  green: 'QuestUiPaperGreen.tga', red: 'QuestUiPaperRed.tga', gray: 'QuestUiPaperGray.tga', yellow: 'QuestUiPaperYellow.tga',
} as const;
const PHONE = '(max-width: 1000px) and (pointer: coarse)';

/** An ARGB colour as CSS. */
const css = (argb: number): string =>
  `rgba(${(argb >>> 16) & 255}, ${(argb >>> 8) & 255}, ${argb & 255}, ${((argb >>> 24) & 255) / 255})`;

export class DialogWindow {
  readonly frame: WindowFrame;
  readonly modal: ModalBackdrop;
  private readonly picture: HTMLImageElement;
  private readonly title: HTMLElement;
  private readonly text: HTMLElement;
  private readonly keys: HTMLElement;
  private readonly answers: HTMLElement;
  private readonly enter: HTMLButtonElement;
  private readonly words: { dialog: string; newQuest: string; currentQuest: string; ask: string; noNew: string; noCurrent: string };
  private state: DialogState;
  private npc: number | null = null;

  constructor(
    private readonly art: UiArt, texts: Texts, private readonly quests: QuestLookup,
    private readonly send: (request: DialogRequest) => void, private readonly doc: Document = document,
    private readonly now: () => number = () => performance.now(),
  ) {
    const text = (id: string, fallback: string): string => texts.get(id)?.text ?? fallback;
    this.words = {
      dialog: text('TID_GAME_DIALOG', 'Dialog'),
      newQuest: text('TID_GAME_NEW_QUEST', 'New Quest'),
      currentQuest: text('TID_GAME_CURRENT_QUEST', 'Quests in Progress'),
      ask: text('TID_GAME_ABOUTQUESTION', 'Ask about %s'),
      noNew: text('TID_GAME_EMPTY_NEW_QUEST', 'No New Quests'),
      noCurrent: text('TID_GAME_EMPTY_CURRENT_QUEST', 'No Quests in Progress'),
    };
    this.state = this.freshState();
    const frame = new WindowFrame(TITLE, art, {
      width: DIALOG.width, height: DIALOG.height, texture: 'WndDialogEx.tga', mobileScale: 1, fitWhole: true,
    }, doc);
    frame.element.classList.add('hud-dialog');
    this.frame = frame;
    this.modal = new ModalBackdrop(frame, doc);
    frame.onClose = () => {
      this.modal.hide();
      this.npc = null;
      (doc.defaultView ?? window).removeEventListener('keydown', this.escape, true);
    };

    const div = (className: string, rect: ControlRect): HTMLElement => {
      const element = doc.createElement('div');
      element.className = className;
      place(element, rect);
      return element;
    };
    this.picture = doc.createElement('img');
    this.picture.className = 'dialog-picture';
    this.picture.alt = '';
    place(this.picture, PICTURE_RECT);
    this.title = div('dialog-title', TITLE_RECT);
    this.text = div('dialog-text', TEXT_RECT);
    this.text.style.overflowY = 'auto';
    // a tap on the text turns the page too (spec §3.1; Neuz has only the button): not one on a link or a button in it
    this.text.addEventListener('click', (event) => {
      if ((event.target as Element | null)?.closest('button') !== null || !this.state.hasNextPage || this.state.list !== null) return;
      this.state.nextPage();
      this.render();
    });
    this.keys = div('dialog-keys', KEYS_RECT);
    this.keys.style.overflowY = 'auto'; // a fourth row of keys scrolls rather than being cut off
    this.answers = doc.createElement('div');
    this.answers.className = 'dialog-answers';
    this.enter = pictureButton(doc, art, 'wndButtEnter.bmp', ENTER_RECT, ENTER_RECT.width, () => {
      this.state.nextPage();
      this.render();
    });
    this.enter.classList.add('dialog-enter');
    this.enter.setAttribute('aria-label', 'Next');
    frame.body.append(this.picture, this.title, this.text, this.keys, this.answers, this.enter);
  }

  /** The modal backdrop with the window in it: what goes in the windows' layer. */
  get element(): HTMLElement {
    return this.modal.element;
  }

  /** The NPC the open dialogue talks to, or null. */
  get npcId(): number | null {
    return this.npc;
  }

  /** Opens it for the NPC `npcId` on a layer `layerWidth` px wide, empty until the server speaks. */
  open(npcId: number, npc: WebNpc | undefined, layerWidth: number): void {
    this.state = this.freshState();
    this.npc = npcId;
    if (npc?.image !== undefined) {
      this.picture.src = this.art.url(npc.image);
      this.picture.hidden = false;
    } else {
      this.picture.removeAttribute('src');
      this.picture.hidden = true;
    }
    this.render();
    // before the backdrop's listener, which holds every key
    (this.doc.defaultView ?? window).addEventListener('keydown', this.escape, true);
    this.modal.show();
    const phone = this.doc.defaultView?.matchMedia?.(PHONE).matches === true;
    this.frame.open(phone ? 'center' : { x: Math.trunc((layerWidth - DIALOG.width) / 2), y: DIALOG.top });
  }

  /** A RUNSCRIPTFUNC for the player, while it is open. */
  receive(action: NpcAction): void {
    if (this.npc === null) return;
    if (this.state.apply(action) === 'exit') this.close();
    else this.render();
  }

  close(): void {
    this.frame.close();
  }

  dispose(): void {
    this.close();
    this.modal.element.remove();
  }

  private freshState(): DialogState {
    return new DialogState({ newQuest: this.words.newQuest, currentQuest: this.words.currentQuest }, this.quests);
  }

  private press(request: DialogRequest | null): void {
    if (request !== null) this.send(request);
    this.render();
  }

  private render(): void {
    const s = this.state;
    const doc = this.doc;
    this.title.textContent = s.title ?? this.words.dialog;

    this.text.replaceChildren();
    if (s.list !== null) {
      this.text.append(this.questList(s.list, s.list === 'new' ? s.newQuests : s.currentQuests));
    } else if (s.pages.length > 0) {
      for (const run of parseDialogText(s.pages[s.page]!)) this.text.append(this.runElement(run));
    } else if (s.title === this.words.newQuest || s.title === this.words.currentQuest) {
      this.text.textContent = s.title === this.words.newQuest ? this.words.noNew : this.words.noCurrent;
    }

    // the answers: the special ones as pictures, the others as text after the page (MakeAnswerButton)
    this.answers.replaceChildren();
    const visible = s.visibleAnswers;
    const specials = visible.filter((answer) => SPECIAL[answer.word] !== undefined).length;
    let x = TEXT_RECT.left + TEXT_RECT.width / 2 - (ANSWER.step * specials) / 2;
    visible.forEach((answer, index) => {
      const picture = SPECIAL[answer.word];
      if (picture !== undefined) {
        const rect = { left: x, top: TEXT_RECT.top + TEXT_RECT.height - ANSWER.height, width: ANSWER.width, height: ANSWER.height };
        const button = pictureButton(doc, this.art, picture, rect, ANSWER.width, () => this.press(s.pressAnswer(index, this.now())));
        button.dataset.dialogAnswer = String(index);
        button.setAttribute('aria-label', answer.word.replace(/_/g, ''));
        this.answers.append(button);
      } else if (s.list === null) {
        const line = doc.createElement('div');
        line.className = 'dialog-answer-line';
        line.append(this.textButton('dialog-link dialog-answer', answer.word, () => this.press(s.pressAnswer(index, this.now()))));
        line.lastElementChild!.setAttribute('data-dialog-answer', String(index));
        this.text.append(line);
      }
      x += ANSWER.step; // every answer moves the next on (WndDialog.cpp:895)
    });

    this.keys.replaceChildren();
    let quests = false;
    s.keys.forEach((key, index) => {
      if (!quests && (key.word === this.words.newQuest || key.word === this.words.currentQuest)) {
        quests = true;
        const row = doc.createElement('div');
        row.className = 'dialog-key-break';
        this.keys.append(row);
      }
      const button = this.textButton('dialog-key', key.word, () => this.press(s.pressKey(index, this.now())));
      button.dataset.dialogKey = key.key;
      button.title = this.words.ask.replace('%s', key.word);
      if (index === s.selectedKey) button.classList.add('selected');
      this.keys.append(button);
    });

    this.enter.hidden = !s.hasNextPage;
  }

  private questList(list: 'new' | 'current', rows: readonly QuestRow[]): HTMLElement {
    const box = this.doc.createElement('div');
    box.className = 'dialog-quest-list';
    box.dataset.questList = list;
    rows.forEach((row, index) => {
      const paper = list === 'new' ? (row.valid ? PAPERS.green : PAPERS.red)
        : this.quests.isReadyToHandIn(row.quest) ? PAPERS.yellow : PAPERS.gray;
      const button = this.doc.createElement('button');
      button.type = 'button';
      button.className = row.valid ? 'dialog-quest-row' : 'dialog-quest-row invalid';
      button.dataset.questRow = String(index);
      const icon = this.doc.createElement('img');
      icon.alt = '';
      icon.src = this.art.url(themeKey(paper));
      const known = this.quests.titleOf(row.quest);
      button.append(icon);
      if (known === undefined) {
        button.append(this.doc.createTextNode(row.word));
      } else {
        const bold = (value: string): HTMLElement => {
          const b = this.doc.createElement('b');
          b.textContent = value;
          return b;
        };
        button.append('[', bold(String(known.levelMin)), '~', bold(String(known.levelMax)), '] ', bold(row.word));
      }
      // the icon carries no text: the row's text is its label
      button.addEventListener('click', () => this.press(this.state.pressQuest(list, index, this.now())));
      box.append(button);
    });
    return box;
  }

  private runElement(run: ReturnType<typeof parseDialogText>[number]): HTMLElement {
    const element = run.link === undefined ? this.doc.createElement('span')
      : this.textButton('dialog-link', run.text, () => this.press(this.state.pressLink(run.link!, this.now())));
    if (run.link === undefined) element.textContent = run.text;
    else element.dataset.dialogLink = run.link;
    element.style.color = css(run.color);
    if (run.bold) element.style.fontWeight = 'bold';
    const lines = [run.underline ? 'underline' : '', run.strike ? 'line-through' : ''].filter(Boolean).join(' ');
    if (lines !== '') element.style.textDecoration = lines;
    return element;
  }

  private textButton(className: string, label: string, press: () => void): HTMLButtonElement {
    const button = this.doc.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    button.addEventListener('click', press);
    return button;
  }

  private readonly escape = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !this.frame.isOpen) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.close();
  };
}

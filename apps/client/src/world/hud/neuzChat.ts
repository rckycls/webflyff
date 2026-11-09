// The desktop chat (2026-11-09, the owner's "fix the chat on desktop view"): Neuz V15's chat window, its System window and
// its filter window, as docs/superpowers/specs/2026-11-09-chat-desktop-research.md has them. The rules are chatRules.ts';
// the phone keeps its own chat (chatWindow.ts). Both share the line's history and command list (chatInput.ts).
//
//   APP_COMMUNICATION_CHAT        Resource/resdata.inc:21603-21758      528 x 128, "WndTile308.tga" tiled, no caption,
//                                                                       WBS_MOVE | WBS_THICKFRAME, the controls
//   CWndChat::OnInitialUpdate     _Interface/WndCommunication.cpp:278-491  the line, the tabs, at the bottom left
//   CWndChat::OnChildNotify       WndCommunication.cpp:614-946          the tabs, Lock, Option, System, the move lock, Enter
//   CWndChat::SetChannel          WndCommunication.cpp:518-544          a tab's lines, from all the lines kept
//   CWndChat::PutString           WndCommunication.cpp:969-995          a line: kept at the end if the view was; 1000 lines
//                                                                       then 500 go; any but the help yellow shows the words
//   CWndChat::Process             WndCommunication.cpp:493-516          the words hidden 300 s after the last use; "/r "
//   CWndChat::OnRButtonDown       WndCommunication.cpp:1159-1258        a right-click whispers the line's sender
//   CWndMacroChat                 WndCommunication.cpp:93-138           the macro mark while the line holds words; a press
//                                                                       carries the line to the task bar (taskBarEdits.ts)
//   CWndChat::OnLButtonDown ...   WndCommunication.cpp:1122-1283        the mouse on the free parts handed to the world too
//   CWndChatLog                   WndCommunication.cpp:1317-1515        the System window and its "Hide" menu
//   CWndChatFilter                _Interface/WndChatFilter.cpp           this tab's five checks
//   CWndHelpInstant               _Interface/WndHelp.cpp:589-604         the Help button's Fast Help window
//   CWndMgr::PutString            _Interface/WndManager.cpp:4027-4174   where a line goes
//   CWndMgr::ParsingChat          WndManager.cpp:3820-3999               a line sent: chatSend.ts
//   SerializeRegInfo, neuz.ini    WndCommunication.cpp:592-612           what is kept for the next time: chatSettings.ts
//
// Escape and F1 to F9 are the game's even while the line is typed in (Neuz.cpp:1222-1231): Escape clears the target or
// closes the window on top, which is the chat while it is typed in (CWndBase::GetWndBase passes it over no more than any
// window, WndBase.cpp:2048-2095). With the chat closed, Enter shows it again (2026-11-10, the owner's: Neuz's does
// nothing, and only the Start menu's Chatting opens it).

import { encodeChat } from '@flyffweb/protocol';
import type { ChatChannel } from '@flyffweb/protocol';
import type { UiArt } from './art';
import { cssRgb, themeUrl } from './art';
import { pictureButton, place } from './button';
import type { ControlRect } from './button';
import { AUTH_GENERAL } from './chatCommands';
import type { ChatCommand } from './chatCommands';
import { CHAT_COMMANDS, EMOTICONS } from './chatCommandTable';
import { ChatHistory, CommandSuggestions } from './chatInput';
import { ChatSender } from './chatSend';
import { readChatSettings, writeChatSettings } from './chatSettings';
import type { ChatSettings } from './chatSettings';
import type { SendOutcome, WordFilter } from './chatSend';
import {
  CHATSTY, CHAT_TABS, DEFAULT_FILTERS, chatLayout, chatLine, editStrip, focusPrefix, logGets, replyLine, tabShows,
  whisperNameOf, whisperedName,
} from './chatRules';
import type { ChatLine, ChatSource } from './chatRules';
import { WindowFrame } from './frame';
import type { ModalBackdrop } from './modal';
import { sixFrameButton } from './radio';
import type { RadioButton } from './radio';
import { ResWindow, textScrollBar } from './resWindow';
import type { TextScrollBar } from './resWindow';

export interface NeuzChatOptions {
  /** Sends a line to the server as it was typed (`SendChat`, one PACKETTYPE_CHAT). */
  send: (text: string) => void;
  /** The chat took the focus (the own mover stops). */
  onFocus: () => void;
  /** The player's name: whose whispers go "->", whose lines a right-click never whispers. */
  ownName: () => string;
  art: UiArt;
  doc?: Document;
  commands?: readonly ChatCommand[];
  /** The clock of the fade (`m_timerInputTimeOut`) and of the anti-spam, in ms. */
  now?: () => number;
  /** A text of textClient.inc by its TID name (the anti-spam's red lines). */
  text?: (id: string) => { text: string; color: number } | undefined;
  /** The line carried to the task bar by the macro mark, from the press `event` (`CWndMacroChat::OnLButtonDown`). */
  carry?: (text: string, event: PointerEvent) => void;
  /**
   * A press, move or let-go of the mouse on the chat's free parts, for the world under it (CWndChat's OnLButtonDown,
   * OnLButtonUp, OnRButtonDown, OnRButtonUp, OnMouseMove hand each to `m_pWndWorld`, WndCommunication.cpp:1122-1283).
   */
  forward?: (event: PointerEvent) => void;
  /** Where Lock, the filters and the chat's place are kept for the next time (chatSettings.ts); none keeps nothing. */
  storage?: Storage | null;
}

/** APP_COMMUNICATION_CHAT's size, and the client area 4 4 6 6 in (`SetWndRect`, :1001-1016). */
const WIDTH = 528;
const HEIGHT = 128;
const INSETS = [4, 4, 6, 6] as const;
/** `AdjustMinRect( &rectWnd, 16 * 29, 16 * 3 )` (:1004); the System window's `16 * 17` (:1504). */
const LEAST = { width: 16 * 29, height: 16 * 3 };
const LOG_LEAST = { width: 16 * 17, height: 16 * 3 };
/** APP_CHAT_LOG is 240 x 128 (resdata.inc:4946), made the least width at once (`Create` calls `SetWndRect`). */
const LOG_WIDTH = Math.max(240, LOG_LEAST.width);
const LOG_HEIGHT = 128;
/** `m_aChatString`: past 500 lines kept, the first 250 go (WndManager.cpp:4121-4127). */
const KEPT = 500;
const KEPT_CUT = 250;
/** A text past 1000 lines loses its first 500 (`PutString`, :987-992). */
const TEXT_MOST = 1000;
const TEXT_CUT = 500;
/** `m_timerInputTimeOut.Set( SEC( 300 ) )` (:454). */
const FADE_MS = 300_000;
/** A line in this colour (the help's yellow, and the whispers') does not show the faded words (`PutString`, :973). */
const NO_WAKE = 0xffffff00;
/** `VSCROLL_WIDTH`, and the words' 15 px off the right beside it (`CWndText::SetWndRect`, WndControl.cpp:2598-2603). */
const SCROLL = 16;
const SCROLL_TEXT = 15;
/** Below this many px from the end, a view counts as at the end. */
const AT_END = 2;
/** The checks of CWndChatFilter (resdata.inc:19477-19520), and the style each one sets (WndChatFilter.cpp:162-208). */
const FILTER_CHECKS = [
  { name: 'General', rect: [18, 34, 96, 50], style: CHATSTY.GENERAL },
  { name: 'Whisper', rect: [118, 34, 192, 50], style: CHATSTY.WHISPER },
  { name: 'Shout', rect: [198, 34, 268, 50], style: CHATSTY.SHOUT },
  { name: 'Party', rect: [18, 54, 90, 70], style: CHATSTY.PARTY },
  { name: 'Guild', rect: [118, 54, 206, 70], style: CHATSTY.GUILD },
] as const;

/** The chat's help key (APP_COMMUNICATION_CHAT's, resdata.inc:21607, resData.txt.txt). */
const HELP_KEY = 'Chatting Window';

/** The keys a field of the chat passes on to the game (`Neuz.cpp:1222-1223`). */
const GAME_KEYS = /^(Escape|F[1-9])$/;

/** The strip's pictures' widths (all 47 high): WndChatEdit00_1.tga, 01, 02. */
const STRIP_WIDTHS: Record<string, number> = { 'WndChatEdit00_1.tga': 128, 'WndChatEdit01.tga': 16, 'WndChatEdit02.tga': 32 };

/** A text of lines with its scroll bar (`CWndTextChat`, `WBS_NOFRAME | WBS_VSCROLL`, line space 2). */
class ChatText {
  readonly element: HTMLElement;
  readonly words: HTMLElement;
  private readonly bar: TextScrollBar;

  constructor(private readonly doc: Document, art: UiArt, label: string) {
    this.element = doc.createElement('div');
    this.element.className = 'neuz-chat-text';
    this.element.setAttribute('role', 'log');
    this.element.setAttribute('aria-label', label);
    this.element.setAttribute('aria-live', 'polite');
    this.words = doc.createElement('div');
    this.words.className = 'neuz-chat-words';
    this.bar = textScrollBar(doc, art, this.words, { left: 0, top: 0, width: SCROLL, height: 4 * SCROLL });
    this.element.append(this.words, this.bar.element);
  }

  get atEnd(): boolean {
    return this.words.scrollHeight - this.words.clientHeight - this.words.scrollTop <= AT_END;
  }

  toEnd(): void {
    this.words.scrollTop = this.words.scrollHeight;
    this.bar.draw();
  }

  place(rect: ControlRect): void {
    const end = this.atEnd;
    place(this.element, rect);
    place(this.words, { left: 0, top: 0, width: Math.max(0, rect.width - SCROLL_TEXT), height: rect.height });
    this.bar.element.style.left = `${rect.width - SCROLL}px`;
    this.bar.setHeight(rect.height);
    if (end) this.toEnd();
  }

  private line(line: ChatLine): HTMLElement {
    const element = this.doc.createElement('div');
    element.className = 'neuz-chat-line';
    element.style.color = cssRgb(line.color);
    element.textContent = line.text;
    return element;
  }

  /** A line at the end; the view kept at the end if it was; past 1000 lines the first 500 go. */
  add(line: ChatLine): void {
    const end = this.atEnd;
    this.words.append(this.line(line));
    if (this.words.children.length >= TEXT_MOST) {
      for (let i = 0; i < TEXT_CUT; i++) this.words.firstElementChild?.remove();
    }
    if (end) this.toEnd();
    else this.bar.draw();
  }

  /** All the lines anew, the view at the end (`SetChannel`). */
  replace(lines: readonly ChatLine[]): void {
    this.words.replaceChildren(...lines.map((line) => this.line(line)));
    this.toEnd();
  }
}

/**
 * The desktop chat. `elements` go in the windows' layer; `show` puts the chat at the bottom left once they are there.
 * `open` gives the line the focus, opening the chat if it was closed; `close` leaves the line. `put` takes a line as Neuz writes it; `update` runs the fade.
 */
export class NeuzChat {
  readonly frame: WindowFrame;
  readonly systemWindow: WindowFrame;
  readonly filterWindow: ResWindow;
  /** The Help button's window (`CWndHelpInstant`, APP_HELP_INSTANT). */
  readonly helpWindow: ResWindow;
  /** 2026-11-05: a client command typed (TCM_CLIENT: /position, /Time ...), with what follows its name. */
  onClientCommand: (command: string, args: string, line: string) => void = () => {};
  private readonly doc: Document;
  private readonly art: UiArt;
  private readonly now: () => number;
  private readonly text: ChatText;
  private readonly logText: ChatText;
  private readonly tabs: RadioButton[];
  private readonly lock: RadioButton;
  private readonly system: RadioButton;
  private readonly moveLock: RadioButton;
  private readonly option: HTMLButtonElement;
  private readonly help: HTMLButtonElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly macro: HTMLElement;
  private readonly edit: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly strip: HTMLElement;
  private readonly menu: HTMLElement;
  private readonly checks: RadioButton[];
  private readonly history = new ChatHistory();
  private readonly suggestions: CommandSuggestions;
  private readonly commands: readonly ChatCommand[];
  /** `m_nChatChannel` as a tab's index, and each tab's filter (`m_dwChatFilter`). */
  private tab = 0;
  private readonly filters = [...DEFAULT_FILTERS];
  /** What was kept from the last time (chatSettings.ts): Lock, the filters, the chat's place once it was moved. */
  private readonly settings: ChatSettings;
  /** Every line kept (`m_aChatString`, `m_aChatColor`, `m_aChatStyle`), whatever the tab. */
  private readonly kept: ChatLine[] = [];
  /** `m_strCharName`: whom the last "/w name" line sent went to; `m_szWhisperName`: who whispered last. */
  private lastWhispered = '';
  private lastWhisperer = '';
  private lastUse: number;
  /** help.inc's texts by keyword (`data/chat.json`). */
  private helpTexts: Readonly<Record<string, string>> = {};
  private authorization = AUTH_GENERAL;
  /** In a party (the Party tab enabled; `g_Party.GetSizeofMember() >= 2` for party chat). */
  private party = false;
  /** ParsingChat's rules: the anti-spam, the word filter, the 120-byte cut (chatSend.ts). */
  private readonly sender: ChatSender;
  /** Where the chat was when it was closed, to open there again. */
  private at = { x: 0, y: Number.MAX_SAFE_INTEGER };
  /** Whether `show` has put the chat up once. */
  private shown = false;

  constructor(private readonly options: NeuzChatOptions) {
    const doc = this.doc = options.doc ?? document;
    const art = this.art = options.art;
    this.now = options.now ?? (() => performance.now());
    this.lastUse = this.now();
    this.commands = options.commands ?? CHAT_COMMANDS;
    this.settings = readChatSettings(options.storage);
    this.filters.splice(0, this.filters.length, ...this.settings.filters);
    this.sender = new ChatSender({ now: this.now, text: (id) => options.text?.(id), commands: this.commands, emoticons: EMOTICONS });

    // the window: no caption, WndTile300-311, its client area 4 4 6 6 in, its edges dragged
    const frame = this.frame = new WindowFrame('Chatting', art, {
      width: WIDTH, height: HEIGHT, mobileScale: 1, caption: false, tiles: 'WndTile3', insets: INSETS, resize: LEAST,
      closeButton: false,
    }, doc);
    frame.element.classList.add('hud-neuz-chat');
    frame.onResize = () => { this.layout(); this.keepPlace(); };
    frame.onPlaced = () => this.keepPlace();
    // closed by its Close or by Escape: the line given up, its place kept to open there again
    frame.onClose = () => { this.close(); this.at = frame.position; };
    this.strip = doc.createElement('div');
    this.strip.className = 'neuz-chat-strip';
    frame.body.before(this.strip);

    this.text = new ChatText(doc, art, 'Chat messages');
    this.tabs = CHAT_TABS.map((tab, i) => {
      const button = sixFrameButton(doc, art, tab.picture, 46, { left: 0, top: 0, width: 45, height: 17 },
        { role: 'radio', name: tab.label, tooltip: tab.tooltip }, () => this.chooseTab(i));
      button.element.dataset.view = tab.view;
      return button;
    });
    this.tabs[0]!.checked = true;
    this.tabs[3]!.disabled = true;
    this.tabs[4]!.disabled = true;
    const rect = { left: 0, top: 0, width: 46, height: 17 };
    this.lock = sixFrameButton(doc, art, 'ButtChatLock.bmp', 46, rect, {
      role: 'checkbox', name: 'Lock', tooltip: 'Allows you to chat constantly without pressing Enter after every message.',
    }, () => { this.lock.checked = !this.lock.checked; this.keep(); });
    this.lock.checked = this.settings.lock;
    this.option = pictureButton(doc, art, 'ButtChatFilter.BMP', { left: 0, top: 0, width: 44, height: 16 }, 44, () => this.openFilter());
    this.option.setAttribute('aria-label', 'Option');
    this.option.title = 'Filter function which allows you to filter the chatting.';
    this.system = sixFrameButton(doc, art, 'ButtChatSystem.bmp', 46, rect, {
      role: 'checkbox', name: 'System', tooltip: 'Show the window for inputted message of system.',
    }, () => this.showSystem(!this.system.checked));
    this.moveLock = sixFrameButton(doc, art, 'ButtWndLock.tga', 15, { left: 0, top: 0, width: 14, height: 14 },
      { role: 'checkbox', name: 'Move lock' }, () => {
        this.moveLock.checked = !this.moveLock.checked;
        frame.movable = !this.moveLock.checked;
      });
    this.help = pictureButton(doc, art, 'ButtWndHelp.tga', { left: 0, top: 0, width: 15, height: 14 }, 15, () => this.openHelp());
    this.help.setAttribute('aria-label', 'Help');
    this.help.title = 'Chatting Window';
    this.closeButton = pictureButton(doc, art, 'ButtWndExit.tga', { left: 0, top: 0, width: 15, height: 14 }, 15, () => this.hide());
    this.closeButton.setAttribute('aria-label', 'Close');

    this.macro = doc.createElement('div');
    this.macro.className = 'neuz-chat-macro';
    this.macro.style.backgroundImage = themeUrl(art, 'wndButtMacroChat.bmp');
    this.macro.dataset.press = '';
    // CWndMacroChat::OnLButtonDown (:100-128): while the line holds words, a press picks it up for the task bar
    this.macro.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || this.input.value === '') return;
      event.preventDefault();
      options.carry?.(this.input.value, event);
    });
    this.edit = doc.createElement('div');
    this.edit.className = 'neuz-chat-edit';
    const input = this.input = doc.createElement('input');
    input.type = 'text';
    input.name = 'message';
    input.setAttribute('aria-label', 'Chat message');
    input.maxLength = 259;
    input.autocomplete = 'off';
    input.spellcheck = false;
    // F1 to F9 typed in the line still use the task bar (Neuz.cpp:1222-1223)
    input.dataset.fkeys = '';
    this.suggestions = new CommandSuggestions(input, doc, this.commands);
    this.edit.append(this.suggestions.element, input);
    frame.body.append(this.text.element, ...this.tabs.map((t) => t.element), this.lock.element, this.option,
      this.system.element, this.moveLock.element, this.help, this.closeButton, this.macro, this.edit);

    // the System window (CWndChatLog): the same frame, its text over all its client area, a "Hide" menu
    const log = this.systemWindow = new WindowFrame('Chatting', art, {
      width: LOG_WIDTH, height: LOG_HEIGHT, mobileScale: 1, caption: false, tiles: 'WndTile3', insets: INSETS,
      resize: LOG_LEAST, closeButton: false,
    }, doc);
    log.element.classList.add('hud-neuz-chat-log');
    // Escape closes it as any window (the System check put out)
    log.onClose = () => { this.system.checked = false; this.menu.hidden = true; };
    this.logText = new ChatText(doc, art, 'System messages');
    log.body.append(this.logText.element);
    log.onResize = (width, height) => this.logText.place({ left: 0, top: 0, width: width - 10, height: height - 10 });
    this.logText.place({ left: 0, top: 0, width: LOG_WIDTH - 10, height: LOG_HEIGHT - 10 });
    this.menu = doc.createElement('div');
    this.menu.className = 'neuz-chat-menu';
    this.menu.setAttribute('role', 'menu');
    this.menu.hidden = true;
    const hide = doc.createElement('button');
    hide.type = 'button';
    hide.setAttribute('role', 'menuitem');
    hide.textContent = 'Hide';
    hide.addEventListener('click', () => { this.menu.hidden = true; this.showSystem(false); });
    this.menu.append(hide);
    log.element.append(this.menu);
    log.element.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const box = log.element.getBoundingClientRect();
      this.menu.style.left = `${event.clientX - box.left}px`;
      this.menu.style.top = `${event.clientY - box.top}px`;
      this.menu.hidden = !this.menu.hidden;
    });

    // the filter (CWndChatFilter): at V15 the group box "Chatting Channel" and five checks, the window cut 130 px
    // shorter (WndChatFilter.cpp:44-58): 276 x 110, modal, centred
    this.filterWindow = new ResWindow({
      title: 'Chatting Filter', width: 276, height: 110, modal: true,
      controls: [{ kind: 'static', id: 'WIDC_GROUPBOX1', rect: [8, 8, 270, 24], text: 'Chatting Channel', group: 'WndEditTile200.tga' }],
    }, art, doc);
    this.filterWindow.frame.element.classList.add('hud-chat-filter');
    this.checks = FILTER_CHECKS.map((check) => {
      const [left, top, right, bottom] = check.rect;
      const button = sixFrameButton(doc, art, 'ButtCheck.bmp', 14, { left, top, width: right - left, height: bottom - top },
        { role: 'checkbox', name: check.name, label: check.name }, () => {
          this.filters[this.tab] = button.checked ? this.filters[this.tab]! & ~check.style : this.filters[this.tab]! | check.style;
          this.drawChecks();
          this.rebuild();
          this.keep();
        });
      return button;
    });
    this.filterWindow.frame.body.append(...this.checks.map((check) => check.element));

    // the Help button's window (WTBID_HELP, WndNeuz.cpp:354-364): APP_HELP_INSTANT "WndTile02.tga" 304 x 304
    // (resdata.inc:23550-23578), its text the help of the chat's help key (CWndHelpInstant::OnInitialUpdate,
    // WndHelp.cpp:589-604), centred
    this.helpWindow = new ResWindow({
      title: 'Fast Help', width: 304, height: 304,
      controls: [
        { kind: 'text', id: 'WIDC_TEXT1', rect: [8, 8, 288, 232], tile: 'WndEditTile00.tga', scroll: true },
        { kind: 'button', id: 'WIDC_CLOSE', rect: [112, 240, 184, 260], picture: 'ButtClose.tga', label: 'Close', quarter: 72 },
      ],
    }, art, doc);
    this.helpWindow.frame.element.classList.add('hud-chat-help');
    this.helpWindow.button('WIDC_CLOSE').addEventListener('click', () => this.helpWindow.close());

    // the line
    input.addEventListener('focus', () => {
      if (input.value === '') input.value = focusPrefix(this.tab, this.lastWhispered);
      this.drawMacro();
    });
    input.addEventListener('input', () => {
      const reply = replyLine(input.value, this.lastWhisperer);
      if (reply !== undefined) input.value = reply;
      this.suggestions.onInput();
      this.drawMacro();
      this.touch();
    });
    input.addEventListener('keydown', (event) => {
      if (this.suggestions.key(event)) return;
      if (event.key === 'Enter') { event.preventDefault(); this.submit(); }
      else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') this.history.recall(event, input);
    });
    // the keys typed in the chat are the chat's, never the game's
    for (const element of [frame.element, log.element]) {
      // the keys typed in the chat are the chat's, but Escape and F1 to F9, which go on to the game (Neuz.cpp:1222-1231)
      element.addEventListener('keydown', (event) => { if (!GAME_KEYS.test(event.key)) event.stopPropagation(); });
      element.addEventListener('keyup', (event) => event.stopPropagation());
      element.addEventListener('focusin', () => options.onFocus());
    }
    frame.element.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      const line = (event.target as Element | null)?.closest?.('.neuz-chat-line');
      const name = line === null || line === undefined ? undefined : whisperNameOf(line.textContent ?? '', options.ownName());
      if (name === undefined) return;
      input.value = `/whisper ${name} `;
      input.focus();
      this.drawMacro();
    });
    // the chat's free parts (the messages, the frame) hand the mouse to the world under them too (:1122-1283): a press there
    // also walks, picks or turns the camera; a control (a button, the line, the scroll bar) keeps its own
    for (const type of ['pointerdown', 'pointermove', 'pointerup'] as const) {
      frame.element.addEventListener(type, (event) => {
        const target = event.target as Element | null;
        if (target?.closest?.('button, input, textarea, select, a, [data-press], .hud-res-scroll') != null) return;
        options.forward?.(event);
      });
    }
    // a control used: the words show again (OnChildNotify, :616-620)
    frame.body.addEventListener('click', () => this.touch());
    doc.addEventListener('pointerdown', this.onOutsidePress, true);

    this.layout();
  }

  /** The chat's windows, for the windows' layer: the chat, the System window, the filter (with its backdrop). */
  get elements(): HTMLElement[] {
    return [this.frame.element, this.systemWindow.element, this.filterWindow.element, this.helpWindow.element];
  }

  /** The filter's backdrop, for the world to hold its input while it is up. */
  get modals(): ModalBackdrop[] {
    return this.filterWindow.modal === null ? [] : [this.filterWindow.modal];
  }

  /** The chat's root element. */
  get element(): HTMLElement {
    return this.frame.element;
  }

  /** Whether the line has the focus. */
  get typing(): boolean {
    return this.doc.activeElement === this.input;
  }

  /**
   * Puts the chat at the bottom left, on the task bar (`OnInitialUpdate`, :445-452), once it is in its layer. Shown again
   * in a new layer (the world entered again, a REPLACE), it stays as it was: where it was put, or closed.
   */
  show(): void {
    if (!this.shown) {
      this.shown = true;
      // where it was the last time (regInfo.dat), else at the bottom left
      const place = this.settings.place;
      if (place !== undefined) {
        this.frame.setSize(place.width, place.height);
        this.at = { x: place.x, y: place.y };
      }
      this.frame.open(this.at);
    }
    for (const frame of [this.frame, this.systemWindow]) frame.refit();
    this.layout();
  }

  /**
   * Gives the line the focus, the chat on top (`SetFocus`): Enter on the world (`Neuz.cpp:1325-1339`) or the Start menu's
   * Chatting (APP_COMMUNICATION_CHAT). A closed chat opens first, where it was. (2026-11-10, the owner's: Enter shows it
   * too; Neuz's Enter does nothing while the chat is closed, and only the Start menu opens it.)
   */
  open(): void {
    if (!this.frame.isOpen) {
      this.shown = true;
      this.frame.open(this.at);
      this.layout();
    }
    this.frame.raise();
    this.input.focus();
  }

  /** Leaves the line: the focus goes back to the world. */
  close(): void {
    this.suggestions.hide();
    if (this.typing) this.input.blur();
  }

  /** Closes the chat (`WIDC_CLOSE`); the System window stays as it is. */
  hide(): void {
    this.frame.close();
  }

  /** help.inc's texts (`data/chat.json`), for the Help button's window. */
  setHelp(help: Readonly<Record<string, string>> | undefined): void { this.helpTexts = help ?? {}; }

  /**
   * The Help button: the chat's help key, IDS_RESDATA_INC_002645 "Chatting Window", looked up in help.inc. Neuz looks it
   * up as it is (`CMapStringToString::Lookup`), and help.inc's keyword is "Chatting window": the window opened empty.
   * Here the case is not minded, so it shows the chat's help.
   */
  private openHelp(): void {
    const key = Object.keys(this.helpTexts).find((name) => name.toLowerCase() === HELP_KEY.toLowerCase());
    this.helpWindow.setText('WIDC_TEXT1', key === undefined ? '' : this.helpTexts[key]!);
    this.helpWindow.open();
  }

  /** In a party or not: the Party tab is enabled in one (`OnDraw`, :212-216). */
  setParty(inParty: boolean): void { this.party = inParty; this.tabs[3]!.disabled = !inParty; }

  /** The word filter of `data/chat.json` (none until it is read). */
  setFilter(filter: WordFilter | null): void { this.sender.setFilter(filter); }

  /** The world entered again: the anti-spam's warnings start again (`SetWarningCounter( 0 )`, WndManager.cpp:2149-2150). */
  restart(): void { this.sender.restart(); }

  /** A chat shortcut of the task bar used (`ObjectExecutor`, WndManager.cpp:2702-2716): its line, as a shortcut's. */
  runShortcut(text: string): void {
    this.apply(this.sender.line(text, { authorization: this.authorization, partySize: this.party ? 2 : 0, shortcut: true }));
  }

  /** In a guild or not: the Guild tab is enabled in one. */
  setGuild(inGuild: boolean): void { this.tabs[4]!.disabled = !inGuild; }

  /** The own account's authorization (`m_dwAuthorization`): which commands run and which the list offers. */
  setAuthorization(authorization: number): void {
    this.authorization = authorization;
    this.suggestions.setAuthorization(authorization);
  }

  /** A line as Neuz writes it (`CWndMgr::PutString`): kept, shown if the tab shows it, else to the System window. */
  put(source: ChatSource): void {
    if (source.kind === 'whisper' && source.sender !== this.options.ownName()) this.lastWhisperer = source.sender;
    const line = chatLine(source, this.options.ownName());
    if (this.kept.length > KEPT) this.kept.splice(0, KEPT_CUT);
    this.kept.push(line);
    const filter = this.filters[this.tab]!;
    if (tabShows(filter, line.style)) {
      this.text.add(line);
      if (line.color !== NO_WAKE) this.touch();
    }
    if (logGets(filter, line)) this.logText.add(line);
  }

  /**
   * The phone chat's way in (chatWindow.ts's `append`), as Neuz writes each kind: 'system' is a game line (the screen's
   * messages and the System window), "[sender] text" when it has a sender (`OnGMSay`, DPClient.cpp:12076-12089).
   */
  append(channel: ChatChannel | 'system' | 'announcement', sender: string, text: string, recipient?: string, color?: number, style?: number): void {
    switch (channel) {
      case 'nearby': this.put({ kind: 'general', sender, text }); break;
      case 'whisper': this.put({ kind: 'whisper', sender, recipient: recipient ?? '', text }); break;
      case 'shout': this.put({ kind: 'shout', sender, text, color }); break;
      case 'party': case 'guild': this.put({ kind: channel, sender, text }); break;
      case 'announcement': this.put({ kind: 'announcement', text }); break;
      case 'system': this.put({ kind: 'game', text: sender === '' ? text : `[${sender}] ${text}`, color: color ?? (sender === '' ? undefined : NO_WAKE), ...(style !== undefined ? { style } : {}) }); break;
    }
  }

  /** Each frame: 300 s after the last use the words go (`Process`, :495-500). */
  update(): void {
    if (this.now() - this.lastUse >= FADE_MS) this.text.element.dataset.faded = 'true';
  }

  dispose(): void {
    this.doc.removeEventListener('pointerdown', this.onOutsidePress, true);
    this.filterWindow.dispose();
    this.helpWindow.dispose();
    this.frame.close();
    this.systemWindow.close();
    this.frame.element.remove();
    this.systemWindow.element.remove();
  }

  /** Lock and the filters kept for the next time. */
  private keep(): void {
    this.settings.lock = this.lock.checked;
    this.settings.filters = [...this.filters];
    writeChatSettings(this.options.storage, this.settings);
  }

  /** The chat's place kept once it was moved or resized (`SerializeRegInfo`'s rectangle). */
  private keepPlace(): void {
    if (!this.shown || !this.frame.isOpen) return;
    const { x, y } = this.frame.position;
    const { width, height } = this.frame.size;
    this.settings.place = { x, y, width, height };
    this.keep();
  }

  /** The words shown again, the fade's clock started again (`m_timerInputTimeOut.Reset()`). */
  private touch(): void {
    this.lastUse = this.now();
    delete this.text.element.dataset.faded;
  }

  /** A press out of the chat's windows: the line loses the focus, the System window's menu goes. */
  private readonly onOutsidePress = (event: Event): void => {
    const target = event.target as Node | null;
    if (!this.systemWindow.element.contains(target)) this.menu.hidden = true;
    if (this.elements.some((element) => element.contains(target))) return;
    this.close();
  };

  /** A tab chosen (`WIDC_RADIO1` to 5, :690-719): its prefix in the line, the line focused, its lines shown. */
  private chooseTab(index: number): void {
    if (this.tabs[index]!.disabled) return;
    this.tab = index;
    this.tabs.forEach((tab, i) => { tab.checked = i === index; });
    this.input.value = CHAT_TABS[index]!.prefix;
    this.input.focus();
    this.drawMacro();
    this.rebuild();
    this.drawChecks();
  }

  /** `SetChannel`: the tab's lines from all the lines kept, at the end. */
  private rebuild(): void {
    const filter = this.filters[this.tab]!;
    this.text.replace(this.kept.filter((line) => tabShows(filter, line.style)));
  }

  /** Enter in the line (`EN_RETURN`, :758-873). */
  private submit(): void {
    const typed = this.input.value;
    const text = typed.trimStart();
    if (text !== '') {
      this.history.remember(text);
      this.apply(this.sender.line(text, { authorization: this.authorization, partySize: this.party ? 2 : 0 }));
      const name = whisperedName(text);
      if (name !== undefined) this.lastWhispered = name;
    }
    this.input.value = '';
    this.suggestions.update();
    this.drawMacro();
    this.touch();
    // Lock keeps the line's focus for the next line; else it goes back to the world (:848-872)
    if (!this.lock.checked) this.close();
  }

  /** What a line does: sent, run here, and its red lines (into the chat's text, `pWndChat->PutString`, or game lines). */
  private apply(outcome: SendOutcome): void {
    try {
      if (outcome.send !== undefined) { encodeChat('nearby', outcome.send); this.options.send(outcome.send); }
    } catch (error) {
      this.direct(error instanceof Error ? error.message : 'Unable to send message.', 0xffff0000);
    }
    if (outcome.client !== undefined) this.onClientCommand(outcome.client.command, outcome.client.args, outcome.client.line);
    for (const note of outcome.notes) {
      if (note.game === true) this.put({ kind: 'game', text: note.text, color: note.color });
      else this.direct(note.text, note.color);
    }
  }

  /** `CWndChat::PutString`: a line into the chat's text alone, not kept for the tabs (:969-995). */
  private direct(text: string, color: number): void {
    this.text.add({ text, color, style: CHATSTY.GAME });
    if (color !== NO_WAKE) this.touch();
  }

  private drawMacro(): void {
    if (this.input.value === '') delete this.macro.dataset.full;
    else this.macro.dataset.full = 'true';
  }

  /** The filter's checks as this tab's filter has them, this tab's own disabled (`SetButtonStatus`, :61-111). */
  private drawChecks(): void {
    const filter = this.filters[this.tab]!;
    FILTER_CHECKS.forEach((check, i) => {
      const button = this.checks[i]!;
      button.checked = (filter & check.style) !== 0;
      button.disabled = check.style === CHAT_TABS[this.tab]!.style;
    });
  }

  private openFilter(): void {
    this.drawChecks();
    if (!this.filterWindow.isOpen) this.filterWindow.open();
  }

  /** The System window shown beside the chat (at its right if it fits, else its left; :645-676) or hidden. */
  private showSystem(shown: boolean): void {
    this.system.checked = shown;
    if (!shown) { this.systemWindow.close(); return; }
    const { x, y } = this.frame.position;
    const { width } = this.frame.size;
    const logWidth = this.systemWindow.size.width - INSETS[0] - INSETS[2];
    const room = this.systemWindow.element.parentElement?.clientWidth ?? 0;
    this.systemWindow.open({ x: x + width + logWidth < room ? x + width : x - logWidth, y });
    this.logText.toEnd();
  }

  /** `OnSize` and `AdditionalSkinTexture`: every control at its place for the window's size, the strip under the line. */
  private layout(): void {
    const { width, height } = this.frame.size;
    const layout = chatLayout(width - INSETS[0] - INSETS[2], height - INSETS[1] - INSETS[3]);
    this.text.place(layout.text);
    this.tabs.forEach((tab, i) => place(tab.element, layout.tabs[i]!));
    place(this.lock.element, layout.lock);
    place(this.option, layout.option);
    place(this.system.element, layout.system);
    place(this.moveLock.element, layout.moveLock);
    place(this.help, layout.help);
    place(this.closeButton, layout.close);
    place(this.macro, layout.macro);
    place(this.edit, layout.edit);
    this.strip.replaceChildren(...editStrip(width, height).map(({ picture, left, top }) => {
      const piece = this.doc.createElement('div');
      piece.style.left = `${left}px`;
      piece.style.top = `${top}px`;
      piece.style.width = `${STRIP_WIDTHS[picture] ?? 16}px`;
      piece.style.backgroundImage = themeUrl(this.art, picture);
      piece.dataset.picture = picture;
      return piece;
    }));
  }
}

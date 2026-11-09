// The chat line's helpers both chats use (2026-11-09: taken out of chatWindow.ts as they were, for the desktop chat,
// neuzChat.ts): the lines sent that the arrows bring back, and the command list over the line ("/" typed, 2026-11-05).

import { isGameMaster } from '../authorization';
import { AUTH_GENERAL, suggest } from './chatCommands';
import type { ChatCommand, Suggestion } from './chatCommands';

/** `MAX_HISTORY_STRING` (`WndCommunication.cpp:15`): the lines sent that Arrow Up can bring back. */
const MAX_HISTORY = 20;

/**
 * The lines sent, oldest first: CWndChat's m_strHistory, at most MAX_HISTORY_STRING (WndCommunication.cpp:15, :822-828).
 * Arrow Up shows the line sent before the one shown (EN_UP, WndCommunication.cpp:741-755), stopping at the oldest; Arrow
 * Down the one after it, then what was being typed (2026-11-05: Neuz has Up only, and wraps round).
 */
export class ChatHistory {
  private readonly lines: string[] = [];
  /** The line of `lines` shown by Arrow Up or Down, or -1 while none is; `draft` is what was typed before. */
  private recalled = -1;
  private draft = '';

  /** Arrow Up or Down in `input`: the line before or after the one shown. */
  recall(event: KeyboardEvent, input: HTMLInputElement): void {
    const up = event.key === 'ArrowUp';
    if (this.lines.length === 0 || (!up && this.recalled < 0)) return;
    event.preventDefault();
    if (up) {
      if (this.recalled < 0) { this.draft = input.value; this.recalled = this.lines.length; }
      this.recalled = Math.max(0, this.recalled - 1);
    } else {
      this.recalled += 1;
    }
    if (this.recalled >= this.lines.length) { this.recalled = -1; input.value = this.draft; } else input.value = this.lines[this.recalled]!;
    const end = input.value.length;
    input.setSelectionRange(end, end);
  }

  /** A line sent goes to the end (once, if it is the last line again), the oldest out past 20. */
  remember(text: string): void {
    if (this.lines.at(-1) !== text) this.lines.push(text);
    if (this.lines.length > MAX_HISTORY) this.lines.shift();
    this.recalled = -1; this.draft = '';
  }
}

/**
 * 2026-11-05: the command suggestions over the line ("/" typed): the arrows walk them, Tab or a click takes one. `element`
 * goes over the line; `onInput` follows the typing (the highlight follows what is typed, SelectString,
 * WndCommunication.cpp:890-899); `key` takes the keys the open list takes.
 */
export class CommandSuggestions {
  readonly element: HTMLElement;
  private rows: Suggestion[] = [];
  private picked = -1;
  private authorization = AUTH_GENERAL;

  constructor(private readonly input: HTMLInputElement, private readonly doc: Document,
    private readonly commands: readonly ChatCommand[]) {
    this.element = doc.createElement('div'); this.element.className = 'chat-suggestions';
    this.element.setAttribute('role', 'listbox'); this.element.setAttribute('aria-label', 'Chat commands');
    this.element.hidden = true;
    input.setAttribute('aria-autocomplete', 'list');
  }

  /** The own account's authorization (`m_dwAuthorization`, ADD_OBJ): which commands the suggestions offer. */
  setAuthorization(authorization: number): void {
    this.authorization = authorization;
    this.update();
  }

  /** What was typed changed: the highlight goes to the typed name. */
  onInput(): void { this.picked = -2; this.update(); }

  /** Whether the list shows. */
  get open(): boolean { return !this.element.hidden && this.rows.length > 0; }

  /** Hides the list until the line changes. */
  hide(): void { this.element.hidden = true; this.rows = []; }

  /** The suggestions for the line as it is: shown while it starts with "/" and some command matches. */
  update(): void {
    const { typing, rows, selected } = suggest(this.input.value, this.authorization, this.commands);
    this.rows = typing ? rows : [];
    if (this.picked === -2) this.picked = selected;
    if (this.picked >= this.rows.length) this.picked = this.rows.length - 1;
    const doc = this.doc;
    this.element.replaceChildren(...rows.map(({ command, name }, i) => {
      const row = doc.createElement('div');
      row.className = 'chat-suggestion';
      row.dataset.command = command.names[0]!;
      if (typing) {
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', String(i === this.picked));
        // a press would take the focus from the line first: the row is taken on the press itself
        row.addEventListener('pointerdown', (event) => { event.preventDefault(); this.take(i); });
      }
      const head = doc.createElement('span'); head.className = 'chat-suggestion-name';
      head.textContent = `/${name}${command.usage ? ` ${command.usage}` : ''}`;
      const others = command.names.filter((n) => n !== name).map((n) => `/${n}`).join(' ');
      const rest = doc.createElement('span'); rest.className = 'chat-suggestion-help';
      rest.textContent = [others, command.help].filter(Boolean).join(' · ');
      row.append(head, rest);
      if (isGameMaster(command.auth)) {
        const badge = doc.createElement('span'); badge.className = 'chat-suggestion-gm'; badge.textContent = 'GM';
        row.append(badge);
      }
      return row;
    }));
    this.element.hidden = rows.length === 0;
    this.input.setAttribute('aria-expanded', String(rows.length > 0 && typing));
    this.element.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }

  /** The keys the open suggestions take: the arrows walk them, Tab (or Enter on a walked-to row) takes one, Escape hides them. */
  key(event: KeyboardEvent): boolean {
    if (this.element.hidden || this.rows.length === 0) return false;
    const count = this.rows.length;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        this.picked = event.key === 'ArrowDown' ? (this.picked + 1) % count : (this.picked <= 0 ? count : this.picked) - 1;
        this.update();
        return true;
      case 'Tab':
        event.preventDefault();
        this.take(Math.max(0, this.picked));
        return true;
      case 'Enter': {
        // a row other than what is typed is taken, and nothing is sent (WndCommunication.cpp:758-778)
        const row = this.rows[this.picked];
        if (row === undefined || this.input.value.slice(1) === row.name) return false;
        event.preventDefault();
        this.take(this.picked);
        return true;
      }
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.hide();
        return true;
      default:
        return false;
    }
  }

  /** The suggestion `i` goes in the line, "/name ", for its words to be typed after it. */
  private take(i: number): void {
    const row = this.rows[i];
    if (row === undefined) return;
    this.input.value = `/${row.name} `;
    this.picked = -1;
    const end = this.input.value.length;
    this.input.setSelectionRange(end, end);
    this.update();
    this.input.focus();
  }
}

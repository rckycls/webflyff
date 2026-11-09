import { encodeChat } from '@flyffweb/protocol';
import type { ChatChannel } from '@flyffweb/protocol';
import { AUTH_GENERAL, lineAction } from './chatCommands';
import type { ChatCommand } from './chatCommands';
import { CHAT_COMMANDS, EMOTICONS } from './chatCommandTable';
import { ChatHistory, CommandSuggestions } from './chatInput';

/** Session-local chat. Only server echoes enter the transcript; text is never interpreted as markup. */
type ChatView = ChatChannel | 'all' | 'system' | 'announcement';

const ICONS: Record<string, string> = {
  Send: 'M3 10 21 3 14 21 11 13 3 10ZM11 13 21 3',
  Chat: 'M4 4H20V16H11L6 21V16H4Z',
  Whisper: 'M3 5H21V19H3ZM3 5 12 12 21 5',
  Shout: 'M4 9H9L19 4V20L9 15H4ZM8 15 10 21M22 9V15',
  Party: 'M8 11A4 4 0 1 0 8 3 4 4 0 0 0 8 11ZM2 21V18A6 6 0 0 1 12 14M16 11A3 3 0 1 0 16 5 3 3 0 0 0 16 11ZM13 21V17A4 4 0 0 1 21 17V21Z',
  Guild: 'M12 2 21 6V13Q21 19 12 22 3 19 3 13V6ZM12 6V17M7 11H17',
  System: 'M9 3H15L16 6 19 5 22 10 19 12 22 14 19 19 16 18 15 21H9L8 18 5 19 2 14 5 12 2 10 5 5 8 6ZM16 12A4 4 0 1 0 8 12 4 4 0 0 0 16 12Z',
  Announcement: 'M4 17H20L18 14V9A6 6 0 0 0 6 9V14ZM9 20Q12 23 15 20',
  Lock: 'M5 10H19V21H5ZM8 10V6A4 4 0 0 1 16 6V10M12 14V17',
  Filter: 'M3 3H21L14 12V21H10V12Z',
  'Minimize chat': 'M6 12H18',
};

function iconButton(button: HTMLButtonElement, label: string, doc: Document): void {
  button.setAttribute('aria-label', label);
  const text = doc.createElement('span'); text.className = 'chat-button-label'; text.textContent = button.textContent;
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.classList.add('chat-button-icon');
  const path = doc.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute('d', ICONS[label]!); path.setAttribute('fill', 'none'); path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2'); path.setAttribute('stroke-linejoin', 'round'); path.setAttribute('stroke-linecap', 'round');
  svg.append(path); button.replaceChildren(svg, text);
}
export class ChatWindow {
  private view: ChatView = 'all';
  /** In a party: the Party view sends to it (`setParty`). */
  private party = false;
  private readonly tabs = new Map<ChatView, HTMLButtonElement>();
  readonly element: HTMLElement;
  private readonly log: HTMLElement;
  private readonly form: HTMLFormElement;
  private readonly input: HTMLInputElement;
  private readonly feedback: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  /** The lines sent, which the arrows bring back (chatInput.ts). */
  private readonly history = new ChatHistory();
  /** 2026-11-05: the command suggestions over the line (chatInput.ts). */
  private readonly suggestions: CommandSuggestions;
  private authorization = AUTH_GENERAL;
  constructor(send: (channel: ChatChannel, text: string, target: string) => void,
    onFocus: () => void, private readonly doc: Document = document,
    private readonly commands: readonly ChatCommand[] = CHAT_COMMANDS) {
    this.element = doc.createElement('section'); this.element.className = 'hud-chat';
    this.element.setAttribute('aria-label', 'Chat');
    this.toggle = doc.createElement('button'); this.toggle.type = 'button'; this.toggle.textContent = 'Chat';
    this.toggle.addEventListener('click', () => { this.selectView('all'); this.open(); });
    this.log = doc.createElement('div'); this.log.className = 'chat-transcript';
    this.log.setAttribute('role', 'log'); this.log.setAttribute('aria-live', 'polite');
    this.form = doc.createElement('form');
    this.input = doc.createElement('input'); this.input.name = 'message';
    this.input.setAttribute('aria-label', 'Chat message'); this.input.maxLength = 259; this.input.autocomplete = 'off';
    const button = doc.createElement('button'); button.type = 'submit'; button.textContent = 'Send';
    this.feedback = doc.createElement('div'); this.feedback.className = 'chat-feedback'; this.feedback.setAttribute('role', 'status');
    this.form.append(this.input, button, this.feedback);
    const bar = doc.createElement('div'); bar.className = 'chat-toolbar';
    for (const [view, label] of [['all', 'Chat'], ['whisper', 'Whisper'], ['shout', 'Shout'], ['party', 'Party'], ['guild', 'Guild'], ['system', 'System'], ['announcement', 'Announcement']] as const) {
      const tab = view === 'all' ? this.toggle : doc.createElement('button');
      tab.type = 'button'; tab.textContent = label; tab.dataset.view = view;
      tab.setAttribute('aria-pressed', String(view === 'all'));
      if (view !== 'all') tab.addEventListener('click', () => { this.selectView(view); this.open(); });
      this.tabs.set(view, tab); bar.append(tab);
    }
    const lock = doc.createElement('button'); lock.type = 'button'; lock.textContent = 'Lock';
    lock.disabled = true; lock.title = 'Chat is fixed above the taskbar';
    lock.setAttribute('aria-pressed', 'true'); lock.className = 'chat-lock';
    const filter = doc.createElement('button'); filter.type = 'button'; filter.textContent = 'Filter'; filter.disabled = true;
    filter.title = 'Filter is not configured';
    const minimize = doc.createElement('button'); minimize.type = 'button'; minimize.textContent = '−';
    minimize.setAttribute('aria-label', 'Minimize chat');
    minimize.addEventListener('click', () => { this.element.classList.toggle('chat-minimized'); });
    bar.append(lock, filter, minimize);
    for (const tab of bar.querySelectorAll('button')) iconButton(tab, tab.getAttribute('aria-label') ?? tab.textContent!, doc);
    iconButton(button, 'Send', doc);
    this.element.append(this.log, bar, this.form);
    this.input.addEventListener('focus', () => this.open());
    this.element.addEventListener('focusin', onFocus);
    this.doc.addEventListener('pointerdown', this.onOutsidePress, true);
    this.element.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); this.close(); }
    });
    this.element.addEventListener('keyup', (event) => event.stopPropagation());
    // 2026-11-05: the command suggestions over the line ("/" typed): the arrows walk them, Tab or a click takes one
    this.suggestions = new CommandSuggestions(this.input, doc, commands);
    this.form.prepend(this.suggestions.element);
    // the highlight follows what is typed (SelectString, WndCommunication.cpp:890-899)
    this.input.addEventListener('input', () => this.suggestions.onInput());
    this.input.addEventListener('keydown', (event) => {
      if (this.suggestions.key(event)) return;
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') this.history.recall(event, this.input);
    });
    this.form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (this.mobile) { this.close(); button.blur(); }
      try {
        const text = this.input.value.trim();
        // FuncTextCmd.cpp registers the aliases; preserve the typed command for native server routing.
        // the Party view in a party is Neuz's party channel, which writes "/p " before the line (WndCommunication.cpp:212-216,
        // :708-713); a typed command goes as typed
        const channel: ChatChannel = this.view === 'party' && this.party && !text.startsWith('/') ? 'party' : 'nearby';
        // 2026-11-05: as ParsingChat and ParsingCommand do (FuncTextCmd.cpp:5549-5650): a client command runs here, an
        // unknown or refused one goes nowhere, the rest is sent
        const action = lineAction(text, this.authorization, this.commands, EMOTICONS);
        if (action.kind === 'send') { encodeChat(channel, text); send(channel, text, ''); }
        else if (action.kind === 'client') this.onClientCommand(action.command, action.args);
        this.history.remember(text);
        this.input.value = ''; this.feedback.textContent = ''; this.suggestions.update(); if (!this.mobile) this.input.focus();
      } catch (error) { this.feedback.textContent = error instanceof Error ? error.message : 'Unable to send message.'; }
    });
  }
  /** 2026-11-05: a client command typed (TCM_CLIENT: /position, /Time ...), with what follows its name. */
  onClientCommand: (command: string, args: string) => void = () => {};

  /** The own account's authorization (`m_dwAuthorization`, ADD_OBJ): which commands the suggestions offer. */
  setAuthorization(authorization: number): void {
    this.authorization = authorization;
    this.suggestions.setAuthorization(authorization);
  }

  /** In a party or not: with the Party view chosen, a typed line goes to the party while in one. */
  setParty(inParty: boolean): void { this.party = inParty; }
  private selectView(view: ChatView): void {
    this.view = view;
    for (const [key, tab] of this.tabs) tab.setAttribute('aria-pressed', String(key === view));
    for (const line of this.log.children) this.filterLine(line as HTMLElement);
    this.log.scrollTop = this.log.scrollHeight;
  }
  private filterLine(line: HTMLElement): void {
    line.hidden = this.view !== 'all' && line.dataset.channel !== this.view && !(this.view === 'system' && line.dataset.channel === 'announcement');
  }
  private get mobile(): boolean { return this.doc.defaultView?.matchMedia?.('(pointer: coarse)').matches ?? false; }
  private readonly onOutsidePress = (event: Event): void => {
    if (!this.element.contains(event.target as Node | null)) this.close();
  };
  get typing(): boolean { return this.element.contains(this.doc.activeElement); }
  open(): void { this.element.classList.remove('chat-minimized'); this.form.hidden = false; this.element.dataset.expanded = 'true'; this.toggle.ariaExpanded = 'true'; if (!this.mobile) this.input.focus(); }
  close(): void {
    if (this.typing) (this.doc.activeElement as HTMLElement).blur();
    delete this.element.dataset.expanded; this.toggle.ariaExpanded = 'false';
  }
  /** `_color`: the desktop chat's (neuzChat.ts); the phone colours a line by its channel. */
  append(channel: ChatChannel | 'system' | 'announcement', sender: string, text: string, recipient?: string, _color?: number): void {
    const bottom = this.log.scrollHeight - this.log.clientHeight - this.log.scrollTop < 24;
    const line = this.doc.createElement('div'); line.dataset.channel = channel;
    line.textContent = `[${channel}] ${sender.slice(0, 32)}${recipient ? ` → ${recipient.slice(0, 32)}` : ''}${sender ? ': ' : ''}${text.slice(0, 1023)}`;
    this.filterLine(line); this.log.append(line);
    while (this.log.children.length > 150) this.log.firstElementChild!.remove();
    if (bottom) this.log.scrollTop = this.log.scrollHeight;
  }
  dispose(): void { this.doc.removeEventListener('pointerdown', this.onOutsidePress, true); this.element.remove(); }
}

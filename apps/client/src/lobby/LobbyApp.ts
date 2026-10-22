import type { CharacterSummary, ServerEntry } from '@flyffweb/protocol';
import { UNEXPECTED_PROBLEM } from './errorText';
import type { LobbyEvent, LoginFlow } from './LoginFlow';
import { alertElement, alreadyConnectedView } from './views/messageView';
import { characterView } from './views/characterView';
import { createView } from './views/createView';
import { deleteView } from './views/deleteView';
import { loginView } from './views/loginView';
import { serverView } from './views/serverView';
import { h } from './views/dom';
import type { View } from './views/dom';

type Screen = 'login' | 'alreadyConnected' | 'servers' | 'characters' | 'create' | 'delete';

/**
 * The screens on which the session is open and an `error` event answers a request of the player (a name already in
 * use, a wrong Bank PIN): the player stays where they are and tries again. On any other screen an error or a close
 * ends the login, and the player goes back to the login form.
 */
const SESSION_SCREENS: ReadonlySet<Screen> = new Set<Screen>(['servers', 'characters', 'create', 'delete']);

/**
 * The lobby page: one screen at a time in `root`, driven by the `LobbyEvent`s of the flow (hand them to `handle`)
 * and by what the player does. All text from a server goes into the page as text, never as markup.
 */
export class LobbyApp {
  private screen: Screen = 'login';
  private view: View | undefined;
  private servers: ServerEntry[] = [];
  private characters: CharacterSummary[] = [];
  /** The account last typed, so a player sent back to the login form does not type it again. */
  private account = '';
  /** Holds at most one `role="alert"` element. */
  private readonly notice = h('div', { class: 'notice' });
  /** Progress text for a screen reader and the eye ("Logging in…"); empty when there is none. */
  private readonly status = h('p', { class: 'status', role: 'status' });
  private readonly stage = h('div', { class: 'stage' });

  constructor(root: HTMLElement, private readonly flow: LoginFlow) {
    root.replaceChildren(h('header', {}, h('h1', {}, 'FlyFF')), this.notice, this.status, this.stage);
    this.showLogin();
  }

  /** What the flow reports. */
  handle(event: LobbyEvent): void {
    switch (event.type) {
      case 'serverList':
        this.servers = event.servers;
        this.showServers();
        break;
      case 'characters':
        this.characters = event.characters;
        this.showCharacters();
        break;
      case 'alreadyConnected':
        this.show('alreadyConnected', alreadyConnectedView({
          onDisconnect: () => {
            // The flow sends nothing back; the player logs in again once the other session is closed.
            this.flow.closeExistingConnection();
            this.showLogin(undefined, 'The other connection was asked to close. Log in again.');
          },
          onCancel: () => this.logout(),
        }));
        break;
      case 'error':
        if (SESSION_SCREENS.has(this.screen)) {
          this.status.textContent = '';
          this.setAlert(event.message);
          this.view?.idle?.();
        } else this.showLogin(event.message);
        break;
      case 'closed':
        this.showLogin(event.message);
        break;
    }
  }

  /** The login form; `busy` while the lobby logs in by itself (Change channel), so the form cannot start another login. */
  private showLogin(alert?: string, status?: string, busy = false): void {
    this.show('login', loginView({ account: this.account, busy, onLogin: (account, password) => this.login(account, password) }), alert, status);
  }

  private showServers(): void {
    this.show('servers', serverView({
      servers: this.servers,
      onSelect: (channel) => this.selectChannel(channel),
      onLogout: () => this.logout(),
    }));
  }

  private showCharacters(): void {
    this.show('characters', characterView({
      characters: this.characters,
      onCreate: (slot) => this.showCreate(slot),
      onDelete: (character) => this.showDelete(character),
      onChangeChannel: () => this.changeChannel(),
      onLogout: () => this.logout(),
    }));
  }

  private showCreate(slot: number): void {
    this.show('create', createView({
      slot,
      onCreate: (character) => {
        this.setAlert(undefined);
        this.status.textContent = 'Creating the character…';
        this.flow.createCharacter(character);
      },
      onInvalid: (message) => this.setAlert(message),
      onCancel: () => this.showCharacters(),
    }));
  }

  private showDelete(character: CharacterSummary): void {
    this.show('delete', deleteView({
      character,
      onDelete: (bankPin) => {
        this.setAlert(undefined);
        this.status.textContent = 'Deleting the character…';
        this.flow.deleteCharacter(character.slot, bankPin);
      },
      onInvalid: (message) => this.setAlert(message),
      onCancel: () => this.showCharacters(),
    }));
  }

  private login(account: string, password: string): void {
    this.account = account.trim();
    this.setAlert(undefined);
    this.status.textContent = 'Logging in…';
    this.run(this.flow.login(account, password));
  }

  private selectChannel(channel: ServerEntry): void {
    this.setAlert(undefined);
    this.status.textContent = 'Loading the characters…';
    this.run(this.flow.selectChannel(channel));
  }

  /**
   * Another channel. The login server forgets the login once its connection closes, so the flow logs in again for a
   * new server list, and the player sees what Neuz's Back button shows: the login form, busy, until the list comes.
   * An error or a close then lands on the login form, as for any login.
   */
  private changeChannel(): void {
    this.showLogin(undefined, 'Logging in…', true);
    this.flow.changeChannel();
  }

  /** Leaves the session: every connection is closed, and the login form is shown. */
  private logout(): void {
    this.flow.dispose();
    this.showLogin();
  }

  /** Watches work the flow started. A rejection is a bug, not an answer of a server: log it and let the player start over. */
  private run(work: Promise<void>): void {
    work.catch((error: unknown) => {
      console.error('the lobby flow failed:', error);
      this.showLogin(UNEXPECTED_PROBLEM);
    });
  }

  /** Puts a screen in place of the last one. `alert` and `status` are what the new screen starts with. */
  private show(screen: Screen, view: View, alert?: string, status?: string): void {
    const first = this.view === undefined;
    this.screen = screen;
    this.view = view;
    this.stage.replaceChildren(view.element);
    this.setAlert(alert);
    this.status.textContent = status ?? '';
    // Keyboard and screen-reader users start at the top of the new screen, not on the button that has just gone. The
    // page's first screen is left alone: nothing has been asked for yet.
    if (!first) view.element.querySelector<HTMLElement>('h2')?.focus();
  }

  /** Shows one message, replacing the last, or none. Brought into view: on a long screen it would be above the fold. */
  private setAlert(message: string | undefined): void {
    if (message === undefined) {
      this.notice.replaceChildren();
      return;
    }
    const alert = alertElement(message);
    this.notice.replaceChildren(alert);
    alert.scrollIntoView({ block: 'nearest' });
  }
}

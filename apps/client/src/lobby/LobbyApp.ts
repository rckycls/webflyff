import type { CharacterSummary, ServerEntry } from '@flyffweb/protocol';
import { UNEXPECTED_PROBLEM } from './errorText';
import type { FlowClock, LobbyEvent, LoginFlow, WorldEntry } from './LoginFlow';
import { systemClock } from './LoginFlow';
import { Reconnect } from './reconnect';
import type { DroppedWorld } from '../world/WorldScreen';
import { alertElement, alreadyConnectedView } from './views/messageView';
import { characterView } from './views/characterView';
import type { CharacterView } from './views/characterView';
import { createView } from './views/createView';
import type { CreateView } from './views/createView';
import { deleteView } from './views/deleteView';
import { openingLook } from './createRules';
import { BLOCKED_BOX, settleSelection } from './selectRules';
import { loadParty } from '../world/party/partyCatalog';
import { loginView } from './views/loginView';
import { serverView } from './views/serverView';
import { h } from './views/dom';
import type { View } from './views/dom';
import { frameLobby, skinLobby } from './skin';
import { WorldPrefetch } from './worldPrefetch';
import { pageAssets, pageGameData } from '../pageAssets';

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
  /**
   * The Select Character window's selection (`m_nSelectCharacter`, static in Neuz): kept between visits, after Create,
   * Cancel, Delete and Back; a blocked character's moves to the first usable one when a list comes (`settleSelection`).
   */
  private selectedSlot = 0;
  /** The Select Character window while it is shown: the Delete Character window opens over it. */
  private selectView: CharacterView | undefined;
  /** The jobs' names for the select window's tooltip, once the game data is in. */
  private jobTitles: string[] | null = null;
  /** `InvalidName_ENG.inc` and `Letter_ENG.inc` (the party catalog) for the create window, once loaded. */
  private nameRules: { invalidNames: readonly string[]; letters: string } | null = null;
  /** The selected character's world, fetched into the browser's cache while the list is shown (`WorldPrefetch`). */
  private readonly prefetch = new WorldPrefetch(pageAssets, async (worldId) => (await pageGameData()).worlds.get(worldId));
  /** The account last typed, so a player sent back to the login form does not type it again. */
  private account = '';
  /** custom (owner 2026-11-17): the password just typed, until the server list (then onLoggedIn has it), else ''. */
  private typedPassword = '';
  /** Holds at most one `role="alert"` element. */
  private readonly notice = h('div', { class: 'notice' });
  /** Progress text for a screen reader and the eye ("Logging in…"); empty when there is none. */
  private readonly status = h('p', { class: 'status', role: 'status' });
  private readonly stage = h('div', { class: 'stage' });
  /**
   * The entry the player is in the world with, from the hand-over until its `done` runs. Each entry's `done` is tied to
   * its own token, so only the first `done` of the current entry acts: a repeated one, or one left over from an earlier
   * entry, must not bring the lobby back over a later world.
   */
  private world: object | undefined;
  /** The reconnect of a dropped world, while its box shows (Piece 6 M3): it takes the flow's events first. */
  private reconnect: Reconnect | undefined;

  /**
   * `onEnter` takes over when the player enters the world with a character: it gets the `WorldEntry` (the lobby has let go of
   * it, the login-server connection included) and `done`, which brings the lobby back to the login form with a message
   * (or none) once the world is over. The lobby's stage is empty when `onEnter` is called, so the world screen may fill
   * `root` as it likes; `done` puts the lobby's page back. `onDrop` gets a world that dropped on its own after it was
   * shown; `reconnected` is true for the world a reconnect enters, whose session endings are drops from the start, so a
   * new world that drops before it is shown brings the box back with the login kept.
   *
   * `onPlayTap` is called at the start of the taps that log in and enter the world, inside their handlers: there the
   * page asks for full screen and the landscape lock (`Landscape.requestLock`, spec §3.10), which a browser grants only to
   * a tap.
   */
  constructor(
    private readonly root: HTMLElement,
    private readonly flow: LoginFlow,
    private readonly onEnter: (
      entry: WorldEntry, done: (message?: string) => void, onDrop: (drop: DroppedWorld) => void, reconnected: boolean,
    ) => void,
    private readonly onPlayTap: () => void = () => {},
    /** The page's audio: the title track plays whenever the login form is shown (Piece 6 M2). */
    private readonly audio: { title(): void } | null = null,
    /** The reconnect's 5 minutes run on it. */
    private readonly clock: FlowClock = systemClock,
    /** The account the login form starts with: the name just made at /sign-up (website spec §3.3), or none. */
    initialAccount = '',
    /**
     * custom (owner 2026-11-17): the game accepted the login (the server list came): the typed account and password, once,
     * for the site's session (Auto Play's weekly hours, world/autoplay/usageLimit.ts). Then the lobby forgets the password.
     */
    private readonly onLoggedIn: (account: string, password: string) => void = () => {},
  ) {
    this.account = initialAccount.trim();
    this.mount();
    this.showLogin();
  }

  /** Puts the lobby's frame in the page. */
  private mount(): void {
    this.root.replaceChildren(h('header', {}, h('h1', {}, 'FlyFF')), this.notice, this.status, this.stage);
    this.root.classList.add('classic-lobby');
    void skinLobby(this.root);
  }

  /** What the flow reports. */
  handle(event: LobbyEvent): void {
    if (this.reconnect?.handle(event) === true) return;
    switch (event.type) {
      case 'serverList':
        if (this.typedPassword !== '') {
          const password = this.typedPassword;
          this.typedPassword = '';
          this.onLoggedIn(this.account, password);
        }
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
    // the title track, forever, at the start and after every logout (Neuz.cpp:1724, :1465-1471, WM_LOGOUT)
    this.audio?.title();
    this.show('login', loginView({ account: this.account, busy, onLogin: (account, password) => this.login(account, password) }), alert, status);
  }

  private showServers(): void {
    this.show('servers', serverView({
      servers: this.servers,
      onSelect: (channel) => this.selectChannel(channel),
      onLogout: () => this.logout(),
    }));
  }

  /** The Select Character window (V15's `CWndSelectChar`), the selection kept from the last visit. */
  private showCharacters(): void {
    this.selectedSlot = settleSelection(this.selectedSlot, this.characters);
    const view = characterView({
      characters: this.characters,
      selected: this.selectedSlot,
      jobTitle: (job) => this.jobTitles?.[job] ?? '',
      onCreate: (slot) => this.showCreate(slot),
      onEnter: (character) => this.enter(character),
      onDelete: (character) => this.showDelete(character),
      onBlocked: () => this.setAlert(BLOCKED_BOX.text),
      onSelect: (slot, character) => {
        this.selectedSlot = slot;
        // the selected character's world into the cache while the player looks (2026-11-04 loading audit)
        if (character === undefined) this.prefetch.abort();
        else void this.prefetch.start(character.worldId, character.position);
      },
      onChangeChannel: () => this.changeChannel(),
    });
    this.show('characters', view);
    this.selectView = view;
    if (this.jobTitles === null) {
      pageGameData().then((data) => { this.jobTitles = data.jobs.map((job) => job.title); }, () => {});
    }
  }

  /** The New Character window (`CWndCreateChar`) for the empty `slot`: a woman, a random hair style and face. */
  private showCreate(slot: number): void {
    if (this.nameRules === null) {
      void pageAssets().then((store) => loadParty(store, (error) => console.warn('Name rules unavailable:', error)))
        .then((party) => { if (party !== null) this.nameRules = { invalidNames: party.invalidNames, letters: party.letters }; })
        .catch(() => {});
    }
    this.show('create', createView({
      slot,
      look: openingLook(),
      nameRules: () => this.nameRules,
      onCreate: (character) => {
        this.setAlert(undefined);
        this.status.textContent = 'Creating the character…';
        this.flow.createCharacter(character);
      },
      onInvalid: (message) => this.setAlert(message),
      onCancel: () => this.showCharacters(),
    }));
  }

  /**
   * The Delete Character window (`CWndDeleteChar`), modal over the Select Character window: the select window stays
   * behind it, out of reach, and comes back as it was on Cancel. The new list after a delete replaces both.
   */
  private showDelete(character: CharacterSummary): void {
    const host = this.selectView;
    if (host === undefined || this.screen !== 'characters') return;
    const view = deleteView({
      character,
      onDelete: (password) => {
        this.setAlert(undefined);
        this.status.textContent = 'Deleting the character…';
        this.flow.deleteCharacter(character.slot, password);
      },
      onInvalid: (message) => this.setAlert(message),
      onCancel: () => this.closeDelete(),
    });
    frameLobby(view.element);
    const modal = h('div', { class: 'lobby-modal' }, view.element);
    for (const child of host.element.children) (child as HTMLElement).inert = true;
    host.element.append(modal);
    this.screen = 'delete';
    this.view = view;
    this.stage.dataset.modal = 'delete';
    this.setAlert(undefined);
    this.status.textContent = '';
    // V15 puts the focus in the edit; a phone's keyboard is not opened by itself (the lobby's rule)
    const coarse = this.root.ownerDocument.defaultView?.matchMedia('(pointer: coarse)').matches ?? false;
    view.element.querySelector<HTMLElement>(coarse ? 'h2' : 'input')?.focus();
  }

  /** Cancel on the Delete Character window: the select window as it was. */
  private closeDelete(): void {
    const host = this.selectView;
    if (host === undefined || this.screen !== 'delete') return;
    host.element.querySelector('.lobby-modal')?.remove();
    for (const child of host.element.children) (child as HTMLElement).inert = false;
    this.screen = 'characters';
    this.view = host;
    delete this.stage.dataset.modal;
    this.setAlert(undefined);
    this.status.textContent = '';
    host.element.querySelector<HTMLElement>('.cs-delete')?.focus();
  }

  private login(account: string, password: string): void {
    this.onPlayTap();
    this.account = account.trim();
    this.typedPassword = password; // custom (owner 2026-11-17): for onLoggedIn, forgotten at the server list
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

  /**
   * Enter on a character: the flow hands over what the world needs, and the world takes the page. If the flow cannot
   * (the login server has not sent the cache address or the clock yet), the player stays and is told so. `reconnected`
   * is for the world a reconnect enters (`onEnter`).
   */
  private enter(character: CharacterSummary, reconnected = false): void {
    this.onPlayTap();
    // what is in flight finishes: the world's own requests for the same files wait for it
    this.prefetch.stop();
    const entry = this.flow.handOver(character.slot);
    if (entry === undefined) {
      this.setAlert(UNEXPECTED_PROBLEM);
      // Accept disabled itself: the player may try again
      this.view?.idle?.();
      return;
    }
    // Nothing of the lobby is left to answer: the flow reports no more, and the screens are gone.
    this.screen = 'login';
    this.view = undefined;
    this.selectView = undefined;
    this.setAlert(undefined);
    this.status.textContent = '';
    this.stage.replaceChildren();
    this.root.classList.remove('classic-lobby');
    delete this.stage.dataset.screen;
    const world = {};
    this.world = world;
    this.onEnter(entry, (message) => {
      if (this.world !== world) return;
      this.world = undefined;
      this.mount();
      this.showLogin(message);
      // Back from the world: keyboard and screen-reader users start at the top of the form, as on any later screen.
      this.stage.querySelector<HTMLElement>('h2')?.focus();
    }, (drop) => {
      if (this.world === world) this.dropped(drop);
    }, reconnected);
  }

  /**
   * The world dropped on its own (Piece 6 M3): its box offers Reconnect, a fresh login to the same channel and character
   * (`Reconnect`), and Back to login. Whichever way it ends, the frozen world is closed first: into the new world through
   * `enter`, or back to the lobby at the step the server's answer leads to.
   */
  private dropped(drop: DroppedWorld): void {
    const leave = (): void => {
      this.reconnect = undefined;
      this.world = undefined;
      drop.close();
    };
    const back = (show: () => void): void => {
      leave();
      this.mount();
      show();
      this.stage.querySelector<HTMLElement>('h2')?.focus();
    };
    // taken, not shared: the frozen world may stay up past the 5 minutes, and the hash must not stay with it
    const kept = drop.kept!;
    drop.kept = undefined;
    this.reconnect = new Reconnect(this.flow, kept, this.clock, {
      box: (state) => drop.box(state),
      enter: (character) => {
        leave();
        this.characters = [character];
        this.enter(character, true);
      },
      toLogin: (message) => back(() => this.showLogin(message)),
      toServers: (message, servers) => back(() => {
        this.servers = servers;
        this.showServers();
        this.setAlert(message);
      }),
      toCharacters: (message, characters) => back(() => {
        this.characters = characters;
        this.showCharacters();
        this.setAlert(message);
      }),
    }, drop.message);
    drop.onReconnect = () => {
      this.onPlayTap(); // the landscape lock, as the login and Enter taps ask (the plan's ruling 9)
      this.reconnect?.tap();
    };
    drop.onBack = () => this.reconnect?.back();
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

  /**
   * Puts a screen in place of the last one. `alert` and `status` are what the new screen starts with. The stage says which
   * screen it holds (`data-screen`), for its landscape layout (style.css).
   */
  private show(screen: Screen, view: View, alert?: string, status?: string): void {
    const first = this.view === undefined;
    this.screen = screen;
    this.view = view;
    this.selectView = undefined;
    if (screen !== 'characters') this.prefetch.abort();
    frameLobby(view.element);
    this.stage.dataset.screen = screen;
    delete this.stage.dataset.modal;
    this.stage.replaceChildren(view.element);
    // the 3D characters (lobbyPortraits.ts, with three.js, loaded on its own); they let go once the window has gone
    if (screen === 'characters') {
      const characters = this.characters;
      void import('./lobbyPortraits').then(({ selectPortraits }) => selectPortraits(view.element, characters, () => this.selectedSlot));
    } else if (screen === 'create') {
      const create = view as CreateView;
      void import('./lobbyPortraits').then(({ createPortrait }) => createPortrait(view.element, () => create.look()));
    }
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

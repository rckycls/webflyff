// One-tap reconnect (Piece 6 M3, a browser adaptation: Neuz has none; docs/superpowers/specs/2026-11-02-piece6-design.md
// §3.4). After the world session dropped on its own, each tap is a fresh login, step by step, through the lobby's
// LoginFlow: CERTIFY with the kept account and password hash, the same channel of the same server if the fresh list
// still has it, the character list, and the same character by its player id; the lobby then enters it as usual. Nothing
// of before is sent again, and the old auth key is never used (the servers would refuse it,
// docs/superpowers/specs/2026-11-02-piece6-m3-reconnect-research.md §3).
//
// One attempt at a time, and only on a tap: no automatic retry, so the client never meets the servers' login limits by
// itself. The kept login lives here, in memory, for 5 minutes from the drop, and is forgotten on Back to login, when the
// attempt hands over, and when the 5 minutes run out. An attempt still running then finishes; after it, only Back to
// login is left. ERROR 103 (the account still in the game, most often the dropped session the gateway keeps alive for a
// minute or so) keeps the box and kicks nothing: the client never sends CLOSE_EXISTING_CONNECTION by itself.

import type { CharacterSummary, ServerEntry } from '@flyffweb/protocol';
import { errorText } from './errorText';
import type { FlowClock, LobbyEvent, LoginFlow } from './LoginFlow';

/** What a reconnect needs of the dropped session: never the plain password. */
export interface KeptLogin {
  account: string;
  passwordHash: string;
  /** The channel's parent server: a channel id is unique only within it. */
  serverId: number;
  channelId: number;
  playerId: number;
}

/** What the box shows. */
export interface BoxState {
  text: string;
  /** False once the kept login is gone: only Back to login is left. */
  canReconnect: boolean;
  /** An attempt is running: Reconnect is greyed. */
  busy: boolean;
}

/** Where the reconnect leads, besides its box. */
export interface ReconnectOut {
  box(state: BoxState): void;
  /** The character was found: the lobby enters it (the flow holds its login). */
  enter(character: CharacterSummary): void;
  /** Back to the login form, with the server's message when there is one. */
  toLogin(message?: string): void;
  /** The channel is gone: the fresh server list, to pick another. */
  toServers(message: string, servers: ServerEntry[]): void;
  /** The character is gone: the fresh character list. */
  toCharacters(message: string, characters: CharacterSummary[]): void;
}

/** How long the login is kept after a drop. */
export const KEPT_LOGIN_MS = 5 * 60_000;
export const RECONNECTING_TEXT = 'Reconnecting…';
export const STILL_IN_GAME_TEXT = 'This account is still in the game. Wait a minute, then tap Reconnect.';
export const EXPIRED_TEXT = 'The saved login has expired.';
export const NO_CHANNEL_TEXT = 'The channel is not available.';
export const NO_CHARACTER_TEXT = 'The character is no longer on this account.';

/**
 * The refusals that go to the login form with the server's message: a banned or blocked account, a wrong password, the
 * lockouts (errorText.ts, the certifier's ERRORs 119-125, 132, 134, 135).
 */
const TO_LOGIN: ReadonlySet<string> = new Set([119, 120, 121, 122, 123, 124, 125, 132, 134, 135].map(errorText));

/** A channel the server list says cannot take the player, as the lobby's channel buttons tell (serverView.ts). */
const unavailable = (channel: ServerEntry): boolean =>
  channel.enabled === 0 || (channel.maxPlayers > 0 && channel.playerCount >= channel.maxPlayers);

export class Reconnect {
  private kept: KeptLogin | null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** The login of the attempt running, kept for it even past the 5 minutes; null between attempts. */
  private attempt: KeptLogin | null = null;
  private over = false;

  constructor(
    private readonly flow: Pick<LoginFlow, 'relogin' | 'selectChannel' | 'dispose'>,
    kept: KeptLogin,
    private readonly clock: FlowClock,
    private readonly out: ReconnectOut,
    message: string,
  ) {
    this.kept = kept;
    this.timer = clock.setTimeout(() => {
      this.timer = undefined;
      this.kept = null;
      if (this.attempt === null && !this.over) this.show(EXPIRED_TEXT);
    }, KEPT_LOGIN_MS);
    this.show(message);
  }

  /** The Reconnect button: a fresh login, unless one is running or the login is gone. */
  tap(): void {
    if (this.over || this.attempt !== null || this.kept === null) return;
    this.attempt = this.kept;
    this.out.box({ text: RECONNECTING_TEXT, canReconnect: true, busy: true });
    void this.flow.relogin(this.attempt.account, this.attempt.passwordHash);
  }

  /** A flow event while an attempt runs: true when it was the attempt's, which the lobby then leaves alone. */
  handle(event: LobbyEvent): boolean {
    const attempt = this.attempt;
    if (this.over || attempt === null) return false;
    switch (event.type) {
      case 'serverList': {
        const channel = event.servers.find((s) => s.id === attempt.channelId && s.parent === attempt.serverId);
        if (channel === undefined || unavailable(channel)) {
          this.finish();
          this.out.toServers(NO_CHANNEL_TEXT, event.servers);
        } else {
          void this.flow.selectChannel(channel);
        }
        return true;
      }
      case 'characters': {
        const character = event.characters.find((c) => c.playerId === attempt.playerId);
        this.finish();
        if (character === undefined) this.out.toCharacters(NO_CHARACTER_TEXT, event.characters);
        else this.out.enter(character);
        return true;
      }
      case 'alreadyConnected':
        this.flow.dispose(); // its certifier would report its closing later
        this.failed(STILL_IN_GAME_TEXT);
        return true;
      case 'error':
        if (TO_LOGIN.has(event.message)) {
          this.finish();
          this.flow.dispose();
          this.out.toLogin(event.message);
        } else {
          this.flow.dispose();
          this.failed(event.message);
        }
        return true;
      case 'closed':
        this.flow.dispose();
        this.failed(event.message);
        return true;
    }
  }

  /** The Back to login button: the attempt is closed, the login forgotten, and the login form shown. */
  back(): void {
    if (this.over) return;
    this.finish();
    this.flow.dispose();
    this.out.toLogin();
  }

  /** The reconnect is over: its login is forgotten, and later events are the lobby's. */
  private finish(): void {
    this.over = true;
    this.attempt = null;
    this.kept = null;
    if (this.timer !== undefined) this.clock.clearTimeout(this.timer);
    this.timer = undefined;
  }

  /** An attempt failed: the box shows why, ready for another tap while the login is kept. */
  private failed(text: string): void {
    this.attempt = null;
    this.show(this.kept === null ? EXPIRED_TEXT : text);
  }

  private show(text: string): void {
    this.out.box({ text, canReconnect: this.kept !== null, busy: false });
  }
}

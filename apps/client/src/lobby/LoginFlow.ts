import {
  CloseCode, NULL_ID, Port, ProtocolError, decodeCertifierMessage, decodeLoginMessage, deleteKey, encodeCertify,
  encodeCloseExistingConnection, encodeCreatePlayer, encodeDeletePlayer, encodeErrorReply, encodeGetPlayerList,
  encodeKeepAlive, encodePing, encodeQueryTickCount, hashPassword,
} from '@flyffweb/protocol';
import type { CharacterSummary, NewCharacter, ServerEntry, SlotMessenger } from '@flyffweb/protocol';
import type { OpenChannel, PacketChannel } from '../net/PacketChannel';
import { ServerClock } from '../net/serverClock';
import { ServerError, UNEXPECTED_PROBLEM, closeText, errorText } from './errorText';
import { isCharacterSlot, isValidAppearance, validateBankPin, validateCharacterName } from './validation';

/** What the lobby views are told. After `error` or `closed` from the certifier phase, every connection is already closed. */
export type LobbyEvent =
  | { type: 'serverList'; servers: ServerEntry[] }
  | { type: 'characters'; characters: CharacterSummary[] }
  | { type: 'alreadyConnected' }
  | { type: 'error'; message: string }
  | { type: 'closed'; message: string };

/** The timers and the time `LoginFlow` uses, so a test can drive them. `now` is in milliseconds from any starting point. */
export interface FlowClock {
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  now(): number;
}

const systemClock: FlowClock = {
  // Called through the global, not handed over bare: a browser's setTimeout throws "Illegal invocation" as a method of another object.
  setTimeout: ((handler: () => void, ms?: number) => globalThis.setTimeout(handler, ms)) as typeof setTimeout,
  clearTimeout: ((handle: ReturnType<typeof setTimeout> | undefined) => globalThis.clearTimeout(handle)) as typeof clearTimeout,
  now: () => Math.floor(performance.now()),
};

/**
 * What entering the world needs, handed over by `LoginFlow.handOver` when the player picks a character. The flow keeps
 * none of it afterwards; the new owner (the world session) closes `login` when it is done with it.
 */
export interface WorldEntry {
  /** The login-server connection, still open: the world session pings it from now on and sets `onPacket` and `onClose` itself. */
  login: PacketChannel;
  /** The cache server, `${cacheAddress}:5400`: the address the login server's CACHE_ADDR gave (`CDPLoginClient::OnCacheAddr`). */
  cacheTarget: string;
  account: string;
  passwordHash: string;
  authKey: number;
  /** The id of the channel picked in the server list (the `dwID` of GETPLAYERLIST). */
  channelId: number;
  character: CharacterSummary;
  /** The messenger the login server listed for the character's slot, if it listed one. */
  messenger: SlotMessenger | undefined;
  /** The server's clock, started by the login server's QUERYTICKCOUNT answer. */
  clock: ServerClock;
}

/** How long the certifier gets to answer (Neuz: `m_dwTimeOutDis`, 20 s). */
const CERTIFY_TIMEOUT_MS = 20000;
const TIMEOUT_TEXT = 'The server did not answer in time.';
/**
 * How often the login server is pinged (Neuz: `CDPLoginClient`'s `m_timer`, 10 s). It drops a connection that sent
 * no PING for 90 s, checking once a minute (`CUserMng::DestroyAbnormalPlayer`).
 */
const PING_INTERVAL_MS = 10000;
/** How long Change channel waits between closing the login server and connecting to the certifier (Neuz: `Sleep( 1000 )`). */
const CHANGE_CHANNEL_PAUSE_MS = 1000;
/** The WebSocket close code of a connection that never opened. */
const GATEWAY_UNREACHABLE = 1006;
/** The database's `VARCHAR(32)`; the rebuilt certifier drops a longer name (`CAccountMgr::IsAccountName`). */
const MAX_ACCOUNT_LENGTH = 32;

/**
 * CERTIFY for the account, and the password hash it carries; `undefined` for an account the certifier would drop
 * without an answer (`CDPCertifier::OnCertify`: empty, with an apostrophe, and with the rebuilt certifier also over 32
 * characters or with a space inside) or that the wire cannot carry.
 */
function prepareCertify(account: string, password: string): { hash: string; certify: Uint8Array } | undefined {
  if (account === '' || account.length > MAX_ACCOUNT_LENGTH || account.includes("'") || account.includes(' ')) return undefined;
  try {
    const hash = hashPassword(password);
    return { hash, certify: encodeCertify(account, hash) };
  } catch (error) {
    // Text outside printable ASCII; the protocol refuses to send it.
    if (error instanceof ProtocolError) return undefined;
    throw error;
  }
}

/** Why a new character cannot be sent, as the message to show; `undefined` when it can. */
function createProblem(c: NewCharacter): string | undefined {
  // A slot or look outside the create screen's choices comes from a bug, not from typing, so it gets the generic message.
  if (!isCharacterSlot(c.slot) || !isValidAppearance(c)) return errorText(ServerError.NO_SUCH_GROUP);
  // The Bank PIN travels as a number; written back as 4 digits it follows the same rules as the typed one.
  const pin = String(c.bankPin).padStart(4, '0');
  return validateCharacterName(c.name) ?? validateBankPin(pin, pin);
}

/**
 * The lobby's conversation with the servers, as a state machine over two channels: the certifier (log in, server
 * list) and the login server (character list, create, delete). It never touches the DOM, `location` or `WebSocket`:
 * channels come from the injected `OpenChannel`, and the lobby views listen to `emit`.
 *
 * It does not throw out of a channel callback. A packet it cannot read ends the session with an `error` event.
 * Create and delete errors from the login server (a name already in use, a wrong Bank PIN) are shown with an
 * `error` event too, but the session stays open so the player can try again; call `dispose` to leave it.
 *
 * Besides the character list it keeps what entering the world needs (the cache server's address, the server's clock
 * started by QUERYTICKCOUNT, the channel picked), and `handOver` gives it all to the world session together with the
 * still-open login-server connection.
 */
export class LoginFlow {
  private account = '';
  private passwordHash = '';
  private authKey: number | undefined;
  private servers: ServerEntry[] = [];
  private characters: CharacterSummary[] = [];
  private messengers: SlotMessenger[] = [];
  /** The cache server's address from the login server's CACHE_ADDR; `undefined` until it comes. Belongs to the login-server connection. */
  private cacheAddress: string | undefined;
  /** Started by the login server's QUERYTICKCOUNT answer; made with the login-server connection. */
  private serverClock: ServerClock | undefined;
  /** The id of the channel the login-server connection was opened for. */
  private channelId: number | undefined;
  private certifier: PacketChannel | undefined;
  private loginServer: PacketChannel | undefined;
  /** True after ERROR 103, until the player answers the "close the other connection" prompt. */
  private offeredCloseExisting = false;
  /** True once the certifier's closing is no news: the server list is in, or the other session was asked to close. */
  private certifierQuiet = false;
  /** The timer of the step in flight: the certifier's 20 s to answer, or the pause of `changeChannel` before that. */
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** The next PING, set while a login-server connection is attached. */
  private pingTimer: ReturnType<typeof setTimeout> | undefined;
  /** Bumped whenever the work in flight is given up, so a channel that finishes opening later is closed, not used. */
  private epoch = 0;

  constructor(
    private readonly open: OpenChannel,
    private readonly certifierAddress: string,
    private readonly emit: (event: LobbyEvent) => void,
    private readonly clock: FlowClock = systemClock,
  ) {}

  /**
   * Starts a session (ending any earlier one): connects to the certifier and sends CERTIFY with the trimmed,
   * lower-cased account, as Neuz does. Resolves once CERTIFY is sent; the answer arrives as events (`serverList`,
   * `alreadyConnected`, `error`, `closed`). The certifier gets 20 s from this call; the wait for the gateway to
   * open the connection counts, so a connection that hangs also ends in a timeout.
   */
  async login(account: string, password: string): Promise<void> {
    this.reset();
    const epoch = this.epoch;
    const typed = account.trim().toLowerCase();
    const prepared = prepareCertify(typed, password);
    if (prepared === undefined) {
      // No such account can exist, so say what the server would.
      this.notify({ type: 'error', message: errorText(ServerError.FLYFF_PASSWORD) });
      return;
    }
    this.account = typed;
    this.passwordHash = prepared.hash;
    await this.certify(prepared.certify, epoch);
  }

  /**
   * Back to the server list for another channel, the way Neuz's Back button does it. Once the login-server connection
   * closes, the servers forget the login and its auth key lists no characters again: the account server takes one
   * GETPLAYERLIST per login (`CDPDBSrvr::OnGetPlayerList`). So the connection is closed and, after a second's pause,
   * the flow logs in again with the account and password hash it holds. The answer comes as it does for `login`: a
   * `serverList` with a new auth key, or `alreadyConnected`, `error` or `closed`; the certifier gets 20 s from the end
   * of the pause. The server list and the characters held until now are forgotten at once. Does nothing without a
   * server list; `login` or `dispose` during the pause calls it off.
   */
  changeChannel(): void {
    if (this.authKey === undefined) return;
    const epoch = ++this.epoch;
    this.stopTimer();
    this.closeLoginServer();
    this.closeCertifier();
    this.offeredCloseExisting = false;
    this.certifierQuiet = false;
    this.authKey = undefined;
    this.servers = [];
    this.forgetChannel();
    // The account and hash already went into a CERTIFY once, so this cannot throw.
    const certify = encodeCertify(this.account, this.passwordHash);
    this.timer = this.clock.setTimeout(() => {
      this.timer = undefined;
      this.certify(certify, epoch).catch((error: unknown) => {
        // `certify` reports a gateway it cannot reach itself; anything else it throws is a bug.
        console.error('Change channel could not log in again:', error);
        if (epoch === this.epoch) this.fail({ type: 'error', message: UNEXPECTED_PROBLEM });
      });
    }, CHANGE_CHANNEL_PAUSE_MS);
  }

  /**
   * The player agreed to disconnect the account's other session. Only valid after `alreadyConnected`; otherwise it
   * does nothing. The certifier sends no answer to this, so nothing is awaited and no event follows (Neuz waits a
   * second and lets the player log in again): the view goes back to the login form and the player logs in again.
   * The certifier channel stays open until then (`login` or `dispose` closes it), so the packet is not cut off.
   */
  closeExistingConnection(): void {
    if (!this.offeredCloseExisting || this.certifier === undefined) return;
    this.offeredCloseExisting = false;
    this.certifierQuiet = true;
    this.stopTimer();
    this.certifier.send(encodeCloseExistingConnection(this.account, this.passwordHash));
  }

  /**
   * Lists the characters on a channel of the server list: connects to the channel's parent server, as Neuz does.
   * Does nothing without a server list or for a channel that is not in it. The characters of an earlier channel are
   * forgotten at once, so nothing meant for the new server can name one of theirs. While the connection is open it
   * gets a PING every 10 s, as from Neuz: the login server drops a connection that sends none for 90 s.
   */
  async selectChannel(channel: ServerEntry): Promise<void> {
    const server = this.servers.find((s) => s.id === channel.parent && s.parent === NULL_ID);
    const authKey = this.authKey;
    if (server === undefined || authKey === undefined) return;
    const epoch = ++this.epoch;
    this.closeLoginServer();
    this.forgetChannel();
    const login = await this.openChannel(`${server.address}:${Port.LOGIN}`, epoch);
    if (login === undefined) return;
    // The clock and the cache address are the new connection's to learn: the server answers each connection by itself.
    this.channelId = channel.id;
    this.serverClock = new ServerClock(() => this.clock.now());
    this.attach('loginServer', login);
    this.startPing();
    login.send(encodeQueryTickCount(this.clock.now()));
    login.send(encodeGetPlayerList(authKey, this.account, this.passwordHash, channel.id));
  }

  /**
   * Sends CREATE_PLAYER. A character the wire cannot carry, or a name or Bank PIN the create screen refuses, is
   * answered with an `error` event and nothing is sent. The answer is a new `characters` event or an `error`.
   * Does nothing without a login-server connection (`selectChannel` first).
   */
  createCharacter(c: NewCharacter): void {
    const loginServer = this.loginServer;
    const authKey = this.authKey;
    if (loginServer === undefined || authKey === undefined) return;
    // What is checked is what is sent: the name without the spaces around it.
    const character = { ...c, name: c.name.trim() };
    const problem = createProblem(character);
    if (problem !== undefined) {
      this.notify({ type: 'error', message: problem });
      return;
    }
    loginServer.send(encodeCreatePlayer(this.account, this.passwordHash, character, authKey));
  }

  /**
   * Sends DEL_PLAYER for the character in `slot`, with the key made from the typed Bank PIN and the slot's messenger
   * friends. An empty slot or a PIN the create screen's rules refuse is answered with an `error` event and nothing is
   * sent. Does nothing without a login-server connection.
   */
  deleteCharacter(slot: number, bankPin: string): void {
    const loginServer = this.loginServer;
    const authKey = this.authKey;
    if (loginServer === undefined || authKey === undefined) return;
    const character = isCharacterSlot(slot) ? this.characters.find((c) => c.slot === slot) : undefined;
    if (character === undefined) {
      this.notify({ type: 'error', message: errorText(ServerError.NO_SUCH_GROUP) });
      return;
    }
    const problem = validateBankPin(bankPin, bankPin);
    if (problem !== undefined) {
      this.notify({ type: 'error', message: problem });
      return;
    }
    const friendIds = this.messengers.find((m) => m.slot === slot)?.friends.map((f) => f.id) ?? [];
    loginServer.send(encodeDeletePlayer(this.account, this.passwordHash, deleteKey(bankPin), character.playerId, authKey, friendIds));
  }

  /**
   * The player picked the character in `slot`: gives the world session what it needs and lets go of the session. The
   * PING and the timers stop and everything is forgotten, but the login-server connection is left open for the new owner,
   * which must set its `onPacket` and `onClose` at once: the flow ignores that channel from here on, and a later
   * `dispose` does not close it. The flow can start another session with `login`.
   *
   * `undefined`, with nothing changed, when there is no character in that slot, or the login server has not yet sent the
   * cache address or answered QUERYTICKCOUNT (or when the hand-over already happened).
   */
  handOver(slot: number): WorldEntry | undefined {
    const { loginServer: login, authKey, channelId, cacheAddress, serverClock } = this;
    const character = this.characters.find((c) => c.slot === slot);
    if (login === undefined || authKey === undefined || channelId === undefined || character === undefined) return undefined;
    if (cacheAddress === undefined || cacheAddress === '' || serverClock === undefined || !serverClock.started) return undefined;
    const entry: WorldEntry = {
      login,
      cacheTarget: `${cacheAddress}:${Port.CACHE}`,
      account: this.account,
      passwordHash: this.passwordHash,
      authKey,
      channelId,
      character,
      messenger: this.messengers.find((m) => m.slot === slot),
      clock: serverClock,
    };
    // `reset` stops the PING and the timers and closes the connections the flow holds: let the login server go first.
    this.loginServer = undefined;
    this.reset();
    return entry;
  }

  /** Closes every connection and forgets the session, without an event. The flow can start another with `login`. */
  dispose(): void {
    this.reset();
  }

  private attach(role: 'certifier' | 'loginServer', channel: PacketChannel): void {
    this[role] = channel;
    // A channel this flow closed or replaced is no longer `this[role]`, so what it still delivers is ignored.
    channel.onPacket = (body) => {
      if (this[role] !== channel) return;
      this.guarded(() => (role === 'certifier' ? this.onCertifierPacket(body) : this.onLoginServerPacket(body)));
    };
    channel.onClose = (code) => {
      if (this[role] !== channel) return;
      this[role] = undefined; // already over; nothing to close
      // Neuz does not tell the player when the certifier drops after the server list (`CheckNofityDisconnected`):
      // the auth key and the list stay good for the login server. Before the list, a drop ends the login.
      if (role === 'certifier' && this.certifierQuiet) {
        this.stopTimer();
        return;
      }
      this.fail({ type: 'closed', message: closeText(code) });
    };
  }

  /** Connects to the certifier and sends CERTIFY. The certifier gets 20 s from here; the wait for the gateway counts. */
  private async certify(certify: Uint8Array, epoch: number): Promise<void> {
    this.startTimer();
    const channel = await this.openChannel(this.certifierAddress, epoch);
    if (channel === undefined) return;
    this.attach('certifier', channel);
    channel.send(certify);
  }

  /** Opens a channel; `undefined` when the flow gave up meanwhile (the channel is closed) or the gateway could not be reached (reported). */
  private async openChannel(target: string, epoch: number): Promise<PacketChannel | undefined> {
    let channel: PacketChannel;
    try {
      channel = await this.open(target);
    } catch {
      if (epoch === this.epoch) this.fail({ type: 'closed', message: closeText(GATEWAY_UNREACHABLE) });
      return undefined;
    }
    if (epoch !== this.epoch) {
      channel.close();
      return undefined;
    }
    return channel;
  }

  private onCertifierPacket(body: Uint8Array): void {
    const message = decodeCertifierMessage(body);
    switch (message.type) {
      case 'keepAlive':
        this.certifier?.send(encodeKeepAlive());
        break;
      case 'serverList':
        this.stopTimer();
        // The server echoes the account it got; one that differs means the reply is not for this login.
        if (message.account !== this.account) {
          this.fail({ type: 'error', message: errorText(ServerError.CERT_GENERAL) });
          break;
        }
        this.authKey = message.authKey;
        this.servers = message.servers;
        this.offeredCloseExisting = false;
        this.certifierQuiet = true;
        this.notify({ type: 'serverList', servers: message.servers });
        break;
      case 'error':
        this.stopTimer();
        // The channel stays open: the player may ask to close the other session (`closeExistingConnection`).
        if (message.code === ServerError.DUPLICATE_ACCOUNT) {
          this.offeredCloseExisting = true;
          this.notify({ type: 'alreadyConnected' });
        } else this.fail({ type: 'error', message: errorText(message.code) });
        break;
      case 'errorString':
        this.stopTimer();
        // Neuz answers an ERROR_STRING with a bare ERROR. Closing the channel ends the server's side too.
        this.certifier?.send(encodeErrorReply());
        this.fail({ type: 'error', message: message.text });
        break;
      case 'unknown':
        this.warnUnknown(message.packetType);
        break;
    }
  }

  private onLoginServerPacket(body: Uint8Array): void {
    const message = decodeLoginMessage(body);
    switch (message.type) {
      case 'playerList':
        if (message.authKey !== this.authKey) {
          this.fail({ type: 'error', message: errorText(ServerError.CERT_GENERAL) });
          break;
        }
        this.characters = message.characters;
        this.messengers = message.messengers;
        // The certifier is closed once the character list is in. The recording that shows when Neuz does it is not
        // made yet; if it differs, move this line.
        this.closeCertifier();
        this.notify({ type: 'characters', characters: message.characters });
        break;
      case 'error':
        // Not the end of the session: a name in use or a wrong Bank PIN is answered the same way, and Neuz stays on its screen.
        this.notify({ type: 'error', message: errorText(message.code) });
        break;
      case 'unknown':
        this.warnUnknown(message.packetType);
        break;
      case 'cacheAddr':
        // CDPLoginClient::OnCacheAddr (Neuz/DPLoginClient.cpp:533): kept for the world session, which connects to it.
        this.cacheAddress = message.address;
        break;
      case 'queryTickCount':
        // CDPLoginClient::OnQueryTickCount (Neuz/DPLoginClient.cpp:104-115): the clock starts, or starts again as in Neuz.
        this.serverClock?.start(message.sentAt, message.tickCount);
        break;
      // Known packets that nothing in the lobby needs.
      case 'ping':
      case 'oneHourNotify':
      case 'loginNumPad':
      case 'loginProtect':
        break;
    }
  }

  private warnUnknown(packetType: number): void {
    // Neuz ignores a type it has no handler for.
    console.warn(`unknown packet 0x${packetType.toString(16).padStart(8, '0')}`);
  }

  /**
   * Tells the listener. A listener that throws is its own bug, not the server's: it is logged and the flow carries on,
   * so the throw cannot escape the channel callback this runs in, nor be taken for a bad packet.
   */
  private notify(event: LobbyEvent): void {
    try {
      this.emit(event);
    } catch (error) {
      console.error(`a lobby listener threw on a ${event.type} event:`, error);
    }
  }

  /** Runs the handling of one packet; whatever it throws (a body the decoders reject) ends the session instead of escaping the channel's callback. */
  private guarded(handle: () => void): void {
    try {
      handle();
    } catch (error) {
      // A ProtocolError message holds offsets and lengths, never packet contents.
      console.warn('could not process a server packet:', error instanceof Error ? error.message : String(error));
      this.fail({ type: 'error', message: closeText(CloseCode.BAD_SERVER_DATA) });
    }
  }

  private startTimer(): void {
    this.stopTimer();
    this.timer = this.clock.setTimeout(() => {
      this.timer = undefined;
      this.fail({ type: 'error', message: TIMEOUT_TEXT });
    }, CERTIFY_TIMEOUT_MS);
  }

  private stopTimer(): void {
    if (this.timer !== undefined) this.clock.clearTimeout(this.timer);
    this.timer = undefined;
  }

  /** Sets the next PING to the login server, 10 s from now; each one sets the next. */
  private startPing(): void {
    this.stopPing();
    this.pingTimer = this.clock.setTimeout(() => {
      this.pingTimer = undefined;
      const loginServer = this.loginServer;
      if (loginServer === undefined) return;
      loginServer.send(encodePing(this.clock.now()));
      this.startPing();
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer !== undefined) this.clock.clearTimeout(this.pingTimer);
    this.pingTimer = undefined;
  }

  private closeCertifier(): void {
    const channel = this.certifier;
    this.certifier = undefined;
    channel?.close();
  }

  /** Closes the login-server connection, if there is one, and stops its pings. */
  private closeLoginServer(): void {
    this.stopPing();
    const channel = this.loginServer;
    this.loginServer = undefined;
    channel?.close();
  }

  /** Ends the session with an event. Everything is closed first, so a view that reacts by starting over finds a clean flow. */
  private fail(event: LobbyEvent): void {
    this.reset();
    this.notify(event);
  }

  private reset(): void {
    this.epoch++;
    this.stopTimer();
    this.closeCertifier();
    this.closeLoginServer();
    this.offeredCloseExisting = false;
    this.certifierQuiet = false;
    this.account = '';
    this.passwordHash = '';
    this.authKey = undefined;
    this.servers = [];
    this.forgetChannel();
  }

  /** Forgets what belongs to a login-server connection: the characters, the cache address, the clock and the channel. */
  private forgetChannel(): void {
    this.characters = [];
    this.messengers = [];
    this.cacheAddress = undefined;
    this.serverClock = undefined;
    this.channelId = undefined;
  }
}

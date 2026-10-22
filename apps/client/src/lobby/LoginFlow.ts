import {
  CloseCode, NULL_ID, Port, ProtocolError, decodeCertifierMessage, decodeLoginMessage, deleteKey, encodeCertify,
  encodeCloseExistingConnection, encodeCreatePlayer, encodeDeletePlayer, encodeErrorReply, encodeGetPlayerList,
  encodeKeepAlive, encodeQueryTickCount, hashPassword,
} from '@flyffweb/protocol';
import type { CharacterSummary, NewCharacter, ServerEntry, SlotMessenger } from '@flyffweb/protocol';
import type { OpenChannel, PacketChannel } from '../net/PacketChannel';
import { ServerError, closeText, errorText } from './errorText';
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

/** How long the certifier gets to answer (Neuz: `m_dwTimeOutDis`, 20 s). */
const CERTIFY_TIMEOUT_MS = 20000;
const TIMEOUT_TEXT = 'The server did not answer in time.';
/** The WebSocket close code of a connection that never opened. */
const GATEWAY_UNREACHABLE = 1006;
/** `MAX_ACCOUNT` (42) is the C++ buffer, which holds the terminator too. */
const MAX_ACCOUNT_LENGTH = 41;

/** CERTIFY for the account, and the password hash it carries; `undefined` for an account or password the wire cannot carry. */
function prepareCertify(account: string, password: string): { hash: string; certify: Uint8Array } | undefined {
  if (account.length > MAX_ACCOUNT_LENGTH) return undefined;
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
 */
export class LoginFlow {
  private account = '';
  private passwordHash = '';
  private authKey: number | undefined;
  private servers: ServerEntry[] = [];
  private characters: CharacterSummary[] = [];
  private messengers: SlotMessenger[] = [];
  private certifier: PacketChannel | undefined;
  private loginServer: PacketChannel | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
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
      this.emit({ type: 'error', message: errorText(ServerError.FLYFF_PASSWORD) });
      return;
    }
    this.account = typed;
    this.passwordHash = prepared.hash;
    this.startTimer();
    const channel = await this.openChannel(this.certifierAddress, epoch);
    if (channel === undefined) return;
    this.attach('certifier', channel);
    channel.send(prepared.certify);
  }

  /** The player agreed to disconnect the account's other session (after `alreadyConnected`). The answer is the server list or an error. */
  closeExistingConnection(): void {
    if (this.certifier === undefined) return;
    this.certifier.send(encodeCloseExistingConnection(this.account, this.passwordHash));
    this.startTimer();
  }

  /** Lists the characters on a channel of the server list: connects to the channel's parent server, as Neuz does. */
  async selectChannel(channel: ServerEntry): Promise<void> {
    const server = this.servers.find((s) => s.id === channel.parent && s.parent === NULL_ID);
    const authKey = this.authKey;
    if (server === undefined || authKey === undefined) {
      this.emit({ type: 'error', message: errorText(ServerError.CERT_GENERAL) });
      return;
    }
    const epoch = ++this.epoch;
    this.closeLoginServer();
    const login = await this.openChannel(`${server.address}:${Port.LOGIN}`, epoch);
    if (login === undefined) return;
    this.attach('loginServer', login);
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
      this.emit({ type: 'error', message: problem });
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
      this.emit({ type: 'error', message: errorText(ServerError.NO_SUCH_GROUP) });
      return;
    }
    const problem = validateBankPin(bankPin, bankPin);
    if (problem !== undefined) {
      this.emit({ type: 'error', message: problem });
      return;
    }
    const friendIds = this.messengers.find((m) => m.slot === slot)?.friends.map((f) => f.id) ?? [];
    loginServer.send(encodeDeletePlayer(this.account, this.passwordHash, deleteKey(bankPin), character.playerId, authKey, friendIds));
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
      this.fail({ type: 'closed', message: closeText(code) });
    };
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
        this.emit({ type: 'serverList', servers: message.servers });
        break;
      case 'error':
        this.stopTimer();
        // The channel stays open: the player may ask to close the other session (`closeExistingConnection`).
        if (message.code === ServerError.DUPLICATE_ACCOUNT) this.emit({ type: 'alreadyConnected' });
        else this.fail({ type: 'error', message: errorText(message.code) });
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
        this.emit({ type: 'characters', characters: message.characters });
        break;
      case 'error':
        // Not the end of the session: a name in use or a wrong Bank PIN is answered the same way, and Neuz stays on its screen.
        this.emit({ type: 'error', message: errorText(message.code) });
        break;
      case 'unknown':
        this.warnUnknown(message.packetType);
        break;
      // Known packets that nothing in Piece 2 needs.
      case 'cacheAddr':
      case 'queryTickCount':
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

  private closeCertifier(): void {
    const channel = this.certifier;
    this.certifier = undefined;
    channel?.close();
  }

  private closeLoginServer(): void {
    const channel = this.loginServer;
    this.loginServer = undefined;
    channel?.close();
  }

  /** Ends the session with an event. Everything is closed first, so a view that reacts by starting over finds a clean flow. */
  private fail(event: LobbyEvent): void {
    this.reset();
    this.emit(event);
  }

  private reset(): void {
    this.epoch++;
    this.stopTimer();
    this.closeCertifier();
    this.closeLoginServer();
    this.account = '';
    this.passwordHash = '';
    this.authKey = undefined;
    this.servers = [];
    this.characters = [];
    this.messengers = [];
  }
}

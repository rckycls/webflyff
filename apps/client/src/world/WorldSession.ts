import {
  ArReader, CloseCode, MessageType, NULL_ID, ProtocolError, WORLD_READERS, decodeLoginMessage, decodeWorldPacket, encodeDestPos,
  encodeJoin, encodePing, encodePlayerBehavior, encodePlayerMoved, encodePreJoin, encodeWorldKeepAlive, readBundle,
} from '@flyffweb/protocol';
import type { BundleMessage, BundleResult, MoveReport, Vec3, WorldMessage } from '@flyffweb/protocol';
import { UNEXPECTED_PROBLEM, closeText, errorText } from '../lobby/errorText';
import { GATEWAY_UNREACHABLE, PING_INTERVAL_MS, TIMEOUT_TEXT, systemClock } from '../lobby/LoginFlow';
import type { FlowClock, WorldEntry } from '../lobby/LoginFlow';
import type { OpenChannel, PacketChannel } from '../net/PacketChannel';

/**
 * What the world screen is told. After `ended`, both connections are closed and nothing more comes. `messages` of the
 * first event are the JOIN bundle's, the WORLD_READINFO and the own ADD_OBJ among them.
 */
export type WorldEvent =
  | { type: 'entered'; worldId: number; pos: Vec3; playerObjectId: number; messages: BundleMessage<WorldMessage>[] }
  | { type: 'messages'; messages: BundleMessage<WorldMessage>[] }
  | { type: 'ended'; message: string };

/**
 * What the bundles looked like, for the overlay. `indexed` counts the bundles that had a valid table of contents, `skipped`
 * the messages of a type nothing reads (in a bundle without a table, the one that ended it too), `mismatched` the messages
 * whose reader did not end where the table says, and `unknownPackets` the top-level packets of a type this does not know.
 */
export interface SessionStats { bundles: number; indexed: number; skipped: number; mismatched: number; unknownPackets: number }

/** Neuz waits a second between connecting to the cache server and PRE_JOIN (`g_Neuz.m_timerConnect.Set( SEC( 1 ) )`, `_Interface/WndTitle.cpp:2123`). */
const CACHE_PAUSE_MS = 1000;
/** PRE_JOIN gets 15 s (`CWndSelectChar::Connected`, `_Interface/WndTitle.cpp:1980`, `m_dwTimeOutDis`). */
const PRE_JOIN_TIMEOUT_MS = 15000;
/** JOIN gets 25 s from its sending (`CDPLoginClient::OnPreJoin`, `Neuz/DPLoginClient.cpp:222`). */
const JOIN_TIMEOUT_MS = 25000;

const LOST_TEXT = 'The connection to the game was lost.';
// The world server closes both sessions when it finds the character already in the world (`CDPSrvr::OnAddUser`) and says nothing why.
const JOIN_CLOSED_TEXT =
  'The game closed the connection. If this character was still in the game from an earlier session, wait a moment and try again.';
const REPLACE_TEXT = "Moving to another map isn't supported yet.";
const BAD_DATA_TEXT = closeText(CloseCode.BAD_SERVER_DATA);

/**
 * The gateway's close codes that name their cause; they keep the lobby's text. The others (the server ending the
 * connection, 4002, and a dropped network, 1000 and 1006) are the step's own message.
 */
const GATEWAY_CAUSES: ReadonlySet<number> = new Set([
  CloseCode.SERVER_UNREACHABLE, CloseCode.NOT_ALLOWED, CloseCode.LIMIT, 1009, CloseCode.BAD_SERVER_DATA, CloseCode.FORBIDDEN_PACKET,
  CloseCode.TOO_MANY_CONNECTIONS, CloseCode.TOO_MANY_NEW_CONNECTIONS, CloseCode.GATEWAY_FULL,
]);

/**
 * Where the session is: `opening` (the cache channel is not open yet), `pausing` (the 1 s pause), `preJoin` and `join` (that
 * packet is sent, its answer awaited), `playing`, and `over` (ended or left: nothing is emitted or sent from here on).
 */
type Phase = 'opening' | 'pausing' | 'preJoin' | 'join' | 'playing' | 'over';

const hex = (n: number, width: number): string => `0x${n.toString(16).padStart(width, '0')}`;

/** The world and position of the first WORLD_READINFO of a bundle. */
function worldReadInfo(messages: BundleMessage<WorldMessage>[]): { worldId: number; pos: Vec3 } | undefined {
  for (const m of messages) if (m.value.type === 'worldReadInfo') return m.value;
  return undefined;
}

/** The position in a top-level REPLACE (type, world, position); `decodeWorldPacket` keeps only its world. */
function replacePosition(body: Uint8Array): Vec3 {
  const r = new ArReader(body);
  r.u32();
  r.u32();
  return r.vec3();
}

/**
 * The player's side of entering the world and playing in it, as a state machine over two channels: the login-server
 * connection the lobby hands over (PRE_JOIN, PING) and the cache-server connection it opens (JOIN, the bundles,
 * KEEP_ALIVE, the player's moves). Built like `LoginFlow`: channels from the injected `OpenChannel`, a clock to inject,
 * no DOM. The world screen listens to `emit` and drives `sendMoved` and the rest.
 *
 * Every ending closes both connections first and then emits one `ended` event with the text to show; `leave` closes them
 * too, without an event. Afterwards nothing is emitted or sent. The session does not throw out of a channel callback: a
 * packet it cannot read ends it with the bad-data text.
 */
export class WorldSession {
  readonly stats: SessionStats = { bundles: 0, indexed: 0, skipped: 0, mismatched: 0, unknownPackets: 0 };
  private phase: Phase = 'opening';
  private started = false;
  private cache: PacketChannel | undefined;
  /** JOIN, made by `start` with PRE_JOIN so that a name the wire cannot carry fails before anything is opened. */
  private joinPacket: Uint8Array | undefined;
  /** The world the player is in: the character list's until the JOIN bundle names it (WORLD_READINFO). A REPLACE elsewhere ends the session. */
  private worldId: number;
  /** The timer of the step in flight: the pause, or the wait for the PRE_JOIN or JOIN answer. */
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pingTimer: ReturnType<typeof setTimeout> | undefined;
  /** What was logged already, so that a type is named once per session. */
  private readonly warned = new Set<string>();

  /**
   * Takes over the login-server connection at once: `onPacket` and `onClose` are set here, since the lobby's flow
   * ignores that channel after the hand-over, and the 10 s PING goes on from the lobby's.
   */
  constructor(
    private readonly open: OpenChannel,
    private readonly entry: WorldEntry,
    private readonly emit: (event: WorldEvent) => void,
    private readonly clock: FlowClock = systemClock,
  ) {
    this.worldId = entry.character.worldId;
    entry.login.onPacket = (body) => {
      if (!this.over) this.guarded(() => this.onLoginPacket(body));
    };
    entry.login.onClose = (code) => {
      if (!this.over) this.end(this.closedText(code));
    };
    this.startPing();
  }

  /**
   * Steps 2-5 of entering: opens the cache connection, waits a second, sends PRE_JOIN on the login connection, and JOIN
   * on the cache connection once PRE_JOIN is answered. Resolves when the cache connection is open and the pause has begun;
   * the rest arrives as events (`entered`, `ended`). PRE_JOIN gets 15 s and JOIN 25 s, each from its sending. The browser
   * does not send the cache server's address packet: the gateway does. Does nothing after `leave` or an ending, or a second time.
   */
  async start(): Promise<void> {
    if (this.started || this.over) return;
    this.started = true;
    const { account, character, passwordHash, authKey, channelId, messenger } = this.entry;
    let preJoin: Uint8Array;
    try {
      preJoin = encodePreJoin(account, character.playerId, character.name);
      this.joinPacket = encodeJoin({
        worldId: character.worldId, playerId: character.playerId, authKey, partyId: character.partyId, guildId: character.guildId,
        warId: character.warId, channelId, slot: character.slot, name: character.name, account, passwordHash, messenger,
      });
    } catch (error) {
      if (!(error instanceof ProtocolError)) throw error;
      // A character name outside printable ASCII: the same packet would fail again, but the player has nothing else to try.
      this.end(UNEXPECTED_PROBLEM);
      return;
    }
    let cache: PacketChannel;
    try {
      cache = await this.open(this.entry.cacheTarget);
    } catch {
      this.end(closeText(GATEWAY_UNREACHABLE));
      return;
    }
    if (this.over) {
      cache.close();
      return;
    }
    this.cache = cache;
    cache.onPacket = (body) => {
      if (!this.over) this.guarded(() => this.onCachePacket(body));
    };
    cache.onClose = (code) => {
      // The server closing the connection after JOIN is how the world server turns away a character that is still in the world.
      if (!this.over) this.end(this.closedText(code, this.phase === 'join'));
    };
    this.phase = 'pausing';
    this.timer = this.clock.setTimeout(() => {
      this.timer = undefined;
      this.phase = 'preJoin';
      this.entry.login.send(preJoin);
      this.startTimer(PRE_JOIN_TIMEOUT_MS);
    }, CACHE_PAUSE_MS);
  }

  /** PLAYERMOVED (`CDPClient::SendPlayerMoved`). Sent only while playing. */
  sendMoved(m: MoveReport): void {
    this.playingCache()?.send(encodePlayerMoved(m));
  }

  /** PLAYERBEHAVIOR (`CDPClient::SendPlayerBehavior`). Sent only while playing. */
  sendBehavior(m: MoveReport): void {
    this.playingCache()?.send(encodePlayerBehavior(m));
  }

  /** The client's SNAPSHOT with one DESTPOS (`CDPClient::SendSnapshot`): a click-to-move. Sent only while playing. */
  sendDestPos(pos: Vec3, forward: boolean): void {
    this.playingCache()?.send(encodeDestPos(pos, forward));
  }

  /**
   * The player leaves the world: closes the cache and login connections, as Neuz does after logging out (the world
   * server saves the character when the cache server reports the closed connection). No event follows, and nothing
   * that arrives or runs later does anything.
   */
  leave(): void {
    this.close();
  }

  /** Read through a getter, so that a check after an `await` is not narrowed away from what `leave` did meanwhile. */
  private get over(): boolean {
    return this.phase === 'over';
  }

  private playingCache(): PacketChannel | undefined {
    return this.phase === 'playing' ? this.cache : undefined;
  }

  /** The text for a channel that closed: the gateway's own cause, else the step's message. */
  private closedText(code: number, awaitingJoin = false): string {
    if (GATEWAY_CAUSES.has(code)) return closeText(code);
    return awaitingJoin ? JOIN_CLOSED_TEXT : LOST_TEXT;
  }

  private onLoginPacket(body: Uint8Array): void {
    const message = decodeLoginMessage(body);
    switch (message.type) {
      case 'preJoin':
        // CDPLoginClient::OnPreJoin (Neuz/DPLoginClient.cpp:204): the answer is the cue for JOIN.
        if (this.phase !== 'preJoin' || this.cache === undefined || this.joinPacket === undefined) break;
        this.cache.send(this.joinPacket);
        this.phase = 'join';
        this.startTimer(JOIN_TIMEOUT_MS);
        break;
      case 'error':
        this.end(errorText(message.code));
        break;
      case 'unknown':
        this.warnOnce(`login ${message.packetType}`, `unknown login-server packet ${hex(message.packetType, 8)}`);
        break;
      // Known packets that nothing in the world needs.
      case 'playerList':
      case 'cacheAddr':
      case 'queryTickCount':
      case 'ping':
      case 'oneHourNotify':
      case 'loginNumPad':
      case 'loginProtect':
        break;
    }
  }

  private onCachePacket(body: Uint8Array): void {
    const packet = decodeWorldPacket(body);
    switch (packet.type) {
      case 'keepAlive':
        // CDPClient::OnKeepAlive (Neuz/DPClient.cpp:961): answered at once, from the callback.
        this.cache?.send(encodeWorldKeepAlive());
        break;
      case 'error':
        this.end(errorText(packet.code));
        break;
      case 'replace':
        // CDPClient::OnReplace (:2297) loads another map, which this client does not do (yet). Within the world it is passed on
        // like the message of the same name, whose object ID the world server sets to NULL_ID (`CUser::AddReplace`).
        if (packet.worldId !== this.worldId) this.end(REPLACE_TEXT);
        else if (this.phase === 'playing') {
          const value = { type: 'replace', worldId: packet.worldId, pos: replacePosition(body) } as const;
          this.notify({ type: 'messages', messages: [{ objectId: NULL_ID, type: MessageType.REPLACE, value }] });
        }
        break;
      case 'join':
        // CDPClient::OnJoin (:897) is OnSnapshot for the first bundle. A later bundle typed JOIN (`CAr::ReelIn` after a JOIN over 16 KB) is an ordinary one.
        if (this.phase === 'join' || this.phase === 'playing') this.onBundle(body);
        break;
      case 'snapshot':
        if (this.phase === 'playing') this.onBundle(body);
        break;
      case 'unknown':
        this.stats.unknownPackets++;
        this.warnOnce(`packet ${packet.packetType}`, `unknown game-server packet ${hex(packet.packetType, 8)}`);
        break;
    }
  }

  /** A JOIN or SNAPSHOT bundle: the first one, while `join` is awaited, enters the world. */
  private onBundle(body: Uint8Array): void {
    const bundle = readBundle(body, WORLD_READERS);
    this.count(bundle);
    const { messages } = bundle;
    // The first bundle names the world and the position (`info`); without that the session cannot start.
    const entering = this.phase === 'join';
    const info = entering ? worldReadInfo(messages) : undefined;
    if (entering) {
      if (info === undefined) {
        console.warn('the JOIN bundle has no WORLD_READINFO');
        this.end(BAD_DATA_TEXT);
        return;
      }
      this.worldId = info.worldId;
    }
    if (messages.some((m) => m.value.type === 'replace' && m.value.worldId !== this.worldId)) {
      this.end(REPLACE_TEXT);
      return;
    }
    if (info !== undefined) {
      this.stopTimer();
      this.phase = 'playing';
      this.notify({ type: 'entered', worldId: info.worldId, pos: info.pos, playerObjectId: bundle.playerObjectId, messages });
    } else if (messages.length > 0) {
      this.notify({ type: 'messages', messages });
    }
  }

  /** Counts a bundle and names, once each, the types the reader could not make sense of. */
  private count(bundle: BundleResult<WorldMessage>): void {
    this.stats.bundles++;
    if (bundle.indexed) this.stats.indexed++;
    this.stats.skipped += bundle.skipped.length;
    this.stats.mismatched += bundle.mismatched.length;
    for (const type of bundle.mismatched) {
      this.warnOnce(`type ${type}`, `message type ${hex(type, 4)} did not end where the bundle's table of contents says; its messages are dropped`);
    }
    if (bundle.stoppedAt !== null) {
      this.warnOnce(`type ${bundle.stoppedAt}`, `a bundle without a table of contents stopped at message type ${hex(bundle.stoppedAt, 4)}; the rest of it is dropped`);
    }
  }

  private warnOnce(key: string, text: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn(text);
  }

  /**
   * Tells the listener. A listener that throws is its own bug, not the server's: it is logged and the session carries
   * on, so the throw cannot escape the channel callback this runs in, nor be taken for a bad packet.
   */
  private notify(event: WorldEvent): void {
    try {
      this.emit(event);
    } catch (error) {
      console.error(`a world listener threw on a ${event.type} event:`, error);
    }
  }

  /** Runs the handling of one packet; whatever it throws (a body or table the readers reject) ends the session instead of escaping the channel's callback. */
  private guarded(handle: () => void): void {
    try {
      handle();
    } catch (error) {
      // A ProtocolError message holds offsets and lengths, never packet contents.
      console.warn('could not process a server packet:', error instanceof Error ? error.message : String(error));
      this.end(BAD_DATA_TEXT);
    }
  }

  private startTimer(ms: number): void {
    this.stopTimer();
    this.timer = this.clock.setTimeout(() => {
      this.timer = undefined;
      this.end(TIMEOUT_TEXT);
    }, ms);
  }

  private stopTimer(): void {
    if (this.timer !== undefined) this.clock.clearTimeout(this.timer);
    this.timer = undefined;
  }

  /** Sets the next PING to the login server, 10 s from now; each one sets the next (`CDPLoginClient`'s `m_timer`, as in `LoginFlow`). */
  private startPing(): void {
    this.pingTimer = this.clock.setTimeout(() => {
      this.pingTimer = undefined;
      this.entry.login.send(encodePing(this.clock.now()));
      this.startPing();
    }, PING_INTERVAL_MS);
  }

  /** Closes both connections and stops the timers, once; whatever the channels report afterwards is ignored. */
  private close(): void {
    if (this.over) return;
    this.phase = 'over';
    this.stopTimer();
    if (this.pingTimer !== undefined) this.clock.clearTimeout(this.pingTimer);
    this.pingTimer = undefined;
    this.cache?.close();
    this.entry.login.close();
  }

  /** Ends the session with the text to show. Everything is closed first, so a screen that reacts by starting over finds nothing open. */
  private end(message: string): void {
    if (this.over) return;
    this.close();
    this.notify({ type: 'ended', message });
  }
}

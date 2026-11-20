// Every request a player makes of a bot gets the game's own "no" (as the No button sends it), then the bot whispers a
// friendly line from the settings' list. One line per player a minute at most, so nobody can make a bot spam; the
// refusals themselves always go. Bots never talk to bots.
import type { WorldMessage } from '@flyffweb/protocol';

export interface RefusalSends {
  /** PARTYMEMBERCANCEL, mode 0 (`partyHud`'s No). */
  partyNo(leaderId: number, memberId: number): void;
  /** CONFIRMTRADECANCEL (`tradeHud`'s Cancel on the request). */
  tradeNo(askerId: number): void;
  /** DUELNO (`socialHud`'s No): the asker's player id. */
  duelNo(askerPlayerId: number, party: boolean): void;
  /** FRIENDCANCEL (`friendHud`'s No). */
  friendNo(askerId: number): void;
  /** REFUSE (`socialHud`'s No to a proposal). */
  coupleNo(): void;
  whisper(name: string, text: string): void;
}

export interface Names {
  ownName(): string;
  isBot(name: string): boolean;
  /** A mover in view by object id. */
  ofObject(objectId: number): string | undefined;
  /** A mover in view by player id. */
  ofPlayer(playerId: number): string | undefined;
}

/** A player gets at most one line in this long (ms). */
export const LINE_EVERY_MS = 60_000;

export class Refusals {
  /** When each player (lower-case name) last got a line. */
  private readonly lastLine = new Map<string, number>();

  constructor(
    private readonly sends: RefusalSends,
    private readonly replies: readonly string[],
    private readonly random: () => number,
    private readonly now: () => number,
    private readonly names: Names,
  ) {}

  onMessage(objectId: number, message: WorldMessage): void {
    switch (message.type) {
      case 'partyRequest':
        this.sends.partyNo(message.leader.id, message.member.id);
        this.reply(message.leaderName);
        break;
      case 'confirmTrade':
        this.sends.tradeNo(objectId);
        this.reply(this.names.ofObject(objectId));
        break;
      case 'duelRequest':
        this.sends.duelNo(message.asker, message.party);
        this.reply(this.names.ofPlayer(message.asker));
        break;
      case 'friendRequest':
        this.sends.friendNo(message.askerId);
        this.reply(message.name);
        break;
      case 'proposeResult':
        this.sends.coupleNo();
        this.reply(message.name);
        break;
      case 'guildInvite':
        // V15's No on a guild invite sends nothing (`guildHud` has no onNo)
        this.reply(this.names.ofObject(message.inviterId));
        break;
      case 'whisper':
      case 'say': {
        const own = this.names.ownName().toLowerCase();
        if (message.recipient.toLowerCase() === own && message.sender.toLowerCase() !== own) this.reply(message.sender);
        break;
      }
      default:
        break;
    }
  }

  /** A line to `name`, unless it is a bot, unknown, or had one within the last minute. */
  private reply(name: string | undefined): void {
    if (name === undefined || name === '' || this.names.isBot(name)) return;
    const key = name.toLowerCase();
    const now = this.now();
    const last = this.lastLine.get(key);
    if (last !== undefined && now - last < LINE_EVERY_MS) return;
    this.lastLine.set(key, now);
    const line = this.replies[Math.min(this.replies.length - 1, Math.floor(this.random() * this.replies.length))]!;
    this.sends.whisper(name, line);
  }
}

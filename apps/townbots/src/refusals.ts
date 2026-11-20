// Every request a player makes of a bot gets the game's own "no" (as the No button sends it), then the bot whispers a
// friendly line from the settings' list. After a line, that player gets the next one only after a random 5 to 10 minutes
// (owner, 2026-11-20), so nobody can make a bot spam; the refusals themselves always go. Bots never talk to bots.
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

/** After a line, the same player waits this long for the next: a random time from the first to the second (ms). */
export const LINE_WAIT_MS: readonly [number, number] = [5 * 60_000, 10 * 60_000];
/** Players remembered at most; past this, the ones whose wait is over are forgotten. */
const REMEMBERED = 500;

export class Refusals {
  /** When each player (lower-case name) may get a line again. */
  private readonly nextLine = new Map<string, number>();

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

  /** A line to `name`, unless it is a bot, unknown, or its wait since the last line (5 to 10 minutes) is not over. */
  private reply(name: string | undefined): void {
    if (name === undefined || name === '' || this.names.isBot(name)) return;
    const key = name.toLowerCase();
    const now = this.now();
    const next = this.nextLine.get(key);
    if (next !== undefined && now < next) return;
    if (this.nextLine.size >= REMEMBERED) for (const [player, at] of this.nextLine) if (at <= now) this.nextLine.delete(player);
    const [min, max] = LINE_WAIT_MS;
    this.nextLine.set(key, now + min + this.random() * (max - min));
    const line = this.replies[Math.min(this.replies.length - 1, Math.floor(this.random() * this.replies.length))]!;
    this.sends.whisper(name, line);
  }
}

// The Guild Siege's state the client keeps (2026-11-15, docs/guild-siege/research/A-client.md §3): Neuz's `g_GuildCombatMng`
// (`CGuildCombat`'s client half) and the per-mover `m_nGuildCombatState`. `apply` copies each `CDPClient::OnGuildCombat`
// handler's change and returns what the screen must do. Every count-down keeps the time it arrived (`now`), so a window
// that opens later still shows what is left.
//
//   OnGuildCombat dispatcher  Neuz/DPClient.cpp:6745-6821 and the handlers it calls
//
// The siege's chat lines, captions and count-down label belong to the arena's HUD (hud/guildCombat/arenaHud.ts), not here.

import type { GcInt64, GuildCombatLogEntry, GuildCombatMessage } from '@flyffweb/protocol';
import { GcState } from './guildCombatRules';

/** What the screen does after a message. */
export type GuildCombatEvent =
  /** The state, the winner or the best player changed: the name tags (trophies) to redraw. */
  | { kind: 'tags' }
  /** One mover's combat state changed (`OnGCUserState`): to write on the mover. */
  | { kind: 'userState'; moverId: number; state: number }
  /** The book's data changed: the siege windows to refresh. */
  | { kind: 'changed' }
  /** A message whose data is for a window or a line the siege HUD makes (apply, status, line-up, entry, texts, penya). */
  | { kind: 'message'; message: GuildCombatMessage };

export interface GuildCombatStatus { joinIndex: number; players: Array<{ playerId: number; lives: number }> }
export type GuildCombatGuildRank = { has: false } | { has: true; name: string; points: number };
export interface GuildCombatPlayerPoint { playerId: number; job: number; point: number }

export class GuildCombatBook {
  /** `m_nState`, CLOSE until told (the client's default). */
  state: number = GcState.CLOSE;
  /** `m_nGCState`, WAR_CLOSE until told. */
  warState: number = GcState.WAR_CLOSE;
  winGuildId = 0;
  winCount = 0;
  bestPlayerId = 0;
  /** `m_bRequest`: the own guild has applied. */
  requested = false;
  /** The running count-down: its label (the state that comes after, or ENTER) and the moment it ends, on the caller's clock. */
  countdown: { label: number; endsAt: number } | null = null;
  guildStatus: GuildCombatStatus | null = null;
  guildRanks: GuildCombatGuildRank[] = [];
  playerRanks: Array<Array<{ playerId: number; points: number }>> = [];
  /** Each guild's line-up by its defender's player id. */
  warPlayers = new Map<number, { id: number; status: number }[]>();
  log: GuildCombatLogEntry[] = [];
  playerPoints: GuildCombatPlayerPoint[] = [];
  /** The last GC_GETPENYAGUILD / GC_GETPENYAPLAYER (`result`, `penya`), for the siege HUD's lines. */
  lastPenya: { result: number; penya: GcInt64 } | null = null;

  private readonly states = new Map<number, number>();

  /** @param baseState a mover's own combat state when no USERSTATE has set it: the one its ADD_OBJ carried */
  constructor(private readonly baseState: (objectId: number) => number = () => 0) {}

  /** `pMover->m_nGuildCombatState`: the last USERSTATE for it, else what its ADD_OBJ carried, else 0. */
  combatStateOf(objectId: number): number {
    return this.states.get(objectId) ?? this.baseState(objectId);
  }

  /** A mover left the view: its ADD_OBJ will carry its state again. */
  forget(objectId: number): void {
    this.states.delete(objectId);
  }

  /**
   * 2026-11-15 (B5): the world changed: every mover is made anew from its ADD_OBJ (`m_nGuildCombatState` is a mover's), so
   * no USERSTATE of the last world is kept (a stale 1 would send the instant revive or allow the siege's PvP).
   */
  forgetMovers(): void {
    this.states.clear();
  }

  apply(message: GuildCombatMessage, now: number): GuildCombatEvent[] {
    switch (message.sub) {
      case 'gcState':
        this.state = message.state;
        this.warState = message.warState;
        return [{ kind: 'tags' }, { kind: 'changed' }];
      case 'winGuild':
        this.winGuildId = message.winGuildId;
        this.winCount = message.winCount;
        return [{ kind: 'tags' }, { kind: 'changed' }];
      case 'bestPlayer':
        this.bestPlayerId = message.playerId;
        return [{ kind: 'tags' }, { kind: 'changed' }];
      case 'isRequest':
        this.requested = message.requested;
        return [{ kind: 'changed' }];
      case 'userState':
        this.states.set(message.moverId, message.state);
        return [{ kind: 'userState', moverId: message.moverId, state: message.state }];
      case 'nextTimeState':
        this.countdown = { label: message.nextState, endsAt: now + message.msLeft };
        return [{ kind: 'changed' }];
      case 'enterTime':
        this.countdown = { label: GcState.ENTER, endsAt: now + message.msLeft };
        return [{ kind: 'changed' }];
      case 'warPlayerList':
        this.warPlayers = new Map(message.guilds.map((g) => [g.defenderId, g.members.map((m) => ({ id: m.playerId, status: m.status }))]));
        // B5: the tags too: a defender's guild line is pink (MoverRender.cpp:1590-1596)
        return [{ kind: 'tags' }, { kind: 'changed' }];
      case 'guildStatus':
        this.guildStatus = { joinIndex: message.joinIndex, players: message.players };
        return [{ kind: 'changed' }];
      case 'guildPrecedence':
        this.guildRanks = message.guilds;
        return [{ kind: 'changed' }];
      case 'playerPrecedence':
        this.playerRanks = message.guilds;
        return [{ kind: 'changed' }];
      case 'playerPoint':
        this.playerPoints = message.players;
        return [{ kind: 'changed' }, { kind: 'message', message }]; // B6: a window opens on it
      case 'log':
        this.log = message.entries;
        return [{ kind: 'changed' }, { kind: 'message', message }]; // B6: a window opens on it
      case 'logRealtime':
        this.log = [...this.log, {
          atkGuildId: message.atkGuildId, defGuildId: message.defGuildId, atkPlayerId: message.atkPlayerId,
          defPlayerId: message.defPlayerId, point: message.point, diffGuild: message.diffGuild, master: message.master,
          defender: message.defender, lastLife: message.lastLife,
        }];
        return [{ kind: 'changed' }, { kind: 'message', message }];
      case 'getPenyaGuild':
      case 'getPenyaPlayer':
        this.lastPenya = { result: message.result, penya: message.penya };
        return [{ kind: 'message', message }];
      default:
        return [{ kind: 'message', message }];
    }
  }
}

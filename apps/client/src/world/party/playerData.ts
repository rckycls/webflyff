// The player data (Piece 7 M4, [R §4]): `CPlayerDataCenter`'s client part, the name, job, level and log-in state of a
// player, which the party windows read every frame for a member out of view:
//
//   CPlayerDataCenter::GetPlayerData   _Common/playerdata.cpp:32-63   an unknown id: an empty entry (level 1) and ONE
//                                                                      query; an entry at level 0: level 1, one query
//   CDPClient::OnQueryPlayerData       Neuz/DPClient.cpp:13576-13606  the answer replaces the entry when its nVer is newer
//                                                                      (`GetPlayerData( id, FALSE )`: no query)
//   CDPClient::OnUpdatePlayerData      DPClient.cpp:977-1003          the record (not the name) when newer
//   CDPClient::OnLogout                DPClient.cpp:1005-1024         `uLogin = 0`

import type { WorldMessage } from '@flyffweb/protocol';

export interface PlayerData {
  name: string;
  job: number;
  level: number;
  sex: number;
  version: number;
  login: number;
}

export class PlayerDataCenter {
  private readonly entries = new Map<number, PlayerData>();

  /** `query` sends QUERY_PLAYER_DATA for a player (`SendQueryPlayerData( id )`). */
  constructor(private readonly query: (playerId: number) => void) {}

  /** `GetPlayerData( id )`: the entry, made and queried once when unknown, queried again once when its level is 0. */
  get(playerId: number): Readonly<PlayerData> {
    return this.entry(playerId, true);
  }

  /** 2026-11-10 (guild): the entry when known, asking nothing (`GetPlayerString`, the removed member's line). */
  peek(playerId: number): Readonly<PlayerData> | undefined {
    return this.entries.get(playerId);
  }

  /**
   * 2026-11-10 (guild): `GetPlayerData( id, FALSE )`, as `OnGuild` reads it before its one QUERY_PLAYER_DATA2
   * (DPClient.cpp:12662-12684): the version known, an empty entry made without a query when unknown.
   */
  version(playerId: number): number {
    return this.entry(playerId, false).version;
  }

  apply(message: WorldMessage): void {
    switch (message.type) {
      case 'playerData': {
        const entry = this.entry(message.playerId, false);
        if (entry.version < message.data.version) Object.assign(entry, { name: message.name, ...message.data });
        break;
      }
      case 'updatePlayerData': {
        const entry = this.entry(message.playerId, true);
        if (entry.version < message.data.version) Object.assign(entry, message.data);
        break;
      }
      case 'playerLogout':
        this.entry(message.playerId, true).login = 0;
        break;
      default:
        break;
    }
  }

  /** Forgets every entry (a log-out). */
  reset(): void {
    this.entries.clear();
  }

  private entry(playerId: number, query: boolean): PlayerData {
    let entry = this.entries.get(playerId);
    if (entry === undefined) {
      entry = { name: '', job: 0, level: 1, sex: 0, version: 0, login: 0 };
      this.entries.set(playerId, entry);
      if (query) this.query(playerId);
    } else if (entry.level === 0) {
      entry.level = 1;
      if (query) this.query(playerId);
    }
    return entry;
  }
}

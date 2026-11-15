import type { SiegeRankRow, SiegeWeekly } from './siege';

// What the web service asks of the database (sqlAccountStore.ts is the SQL Server one; the tests use a fake).

export interface AccountStore {
  /**
   * `dbo.usp_CreateNewAccount @account, @pw, 0, @email`: 1 made, 0 the name is taken, -1 an error (rolled back). Cash is
   * always 0 and the procedure sets the authority to a player's ('F').
   */
  create(account: string, passwordHash: string, email: string): Promise<number>;
  /** `dbo.usp_WebOnlineCount`: the characters in a world now. */
  onlineCount(): Promise<number>;
  /** `dbo.usp_WebSiegeWeekly`: the latest Saturday 20:00-21:59 siege of the last 7 days; all null when there is none. */
  siegeWeekly(): Promise<SiegeWeekly>;
  /** `dbo.usp_WebSiegeRankingPlayer` / `usp_WebSiegeRankingGuild`: the top 100, this week (since Sunday) or all time. */
  siegeRanking(board: 'player' | 'guild', week: boolean): Promise<SiegeRankRow[]>;
}

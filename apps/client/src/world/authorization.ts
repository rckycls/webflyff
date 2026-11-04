// A player's authorization (`CMover::m_dwAuthorization`, the letter ADD_OBJ sends) as Neuz reads it: what a game master
// is shown (the hits on its focus, `fx/combatEffects.ts`) and what is hidden from the others (the target bar of a game
// master, `hud/targetBar.ts`).

/** `AUTH_GAMEMASTER` (`_Common/authorization.h:23`), the letter `'L'`. */
export const AUTH_GAMEMASTER = 0x4c;

/**
 * `IsAuthHigher( AUTH_GAMEMASTER )` (`Mover.h:1061`): `IsAuthorizationHigher` (`authorization.h:93-102`) compares the
 * ranks of `GetAuthorizationRank` (`:58-82`), and the letters for one it has no rank for. The ranks keep the letters'
 * order on each side of `'L'` (every letter it ranks below 50 is before `'L'`, every one from 50 is `'L'` or after), so
 * the authorization is a game master's when its letter is `'L'` or later.
 */
export function isGameMaster(authorization: number): boolean {
  return authorization >= AUTH_GAMEMASTER;
}

/**
 * `GetAuthorizationRank` (`authorization.h:58-82`) as this server's Neuz is built (`VersionCommon.h:208-212`): its VIP
 * letters rank with the players and its staff moderator under the game masters; -1 for a letter it has no rank for.
 */
const RANKS: ReadonlyMap<string, number> = new Map([
  ['D', 0], ['F', 10], ['1', 11], ['2', 12], ['3', 13], ['G', 20], ['H', 30], ['J', 40], ['K', 45], ['L', 50], ['M', 60],
  ['N', 70], ['O', 80], ['P', 90],
]);

/**
 * `IsAuthorizationHigher` (`authorization.h:93-102`): the ranks compared, or the letters when either has none (2026-11-05:
 * the chat's commands, `hud/chatCommands.ts`).
 */
export function isAuthorizationHigher(current: number, required: number): boolean {
  const have = RANKS.get(String.fromCharCode(current)) ?? -1;
  const need = RANKS.get(String.fromCharCode(required)) ?? -1;
  if (have < 0 || need < 0) return required <= current;
  return have >= need;
}

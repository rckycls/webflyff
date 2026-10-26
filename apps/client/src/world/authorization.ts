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

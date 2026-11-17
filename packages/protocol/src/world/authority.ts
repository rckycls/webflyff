// The authority letters: `CMover::m_dwAuthorization` (ADD_OBJ sends its low byte), `ACCOUNT_TBL_DETAIL.m_chLoginAuthority`
// (the account's) and `CHARACTER_TBL.m_chAuthority` (a character's), as `Source/_Common/authorization.h` defines them.
//
// VIP1-VIP4 (vip-auth, 2026-11-17, the owner's request) are titles only: the servers treat them as AUTH_GENERAL in every
// check (`GetAuthLevel`, patch `2026-11-17-vip-auth`). Their letters sit before 'F' ('D' is AUTH_OBSERVER's), so each
// test against a letter after 'F' (the helper, the game masters...) gives them what it gives a player.

export const Authority = Object.freeze({
  OBSERVER: 'D',
  GENERAL: 'F',
  LOGCHATTING: 'G',
  JOURNALIST: 'H',
  HELPER: 'J',
  GAMEMASTER: 'L',
  GAMEMASTER2: 'M',
  GAMEMASTER3: 'N',
  OPERATOR: 'O',
  ADMINISTRATOR: 'P',
  VIP1: 'A',
  VIP2: 'B',
  VIP3: 'C',
  VIP4: 'E',
} as const);

export type AuthorityLetter = (typeof Authority)[keyof typeof Authority];

/** The four VIP letters, VIP1 first. */
export const VIP_AUTHORITIES: readonly AuthorityLetter[] = Object.freeze([Authority.VIP1, Authority.VIP2, Authority.VIP3, Authority.VIP4]);

/** Each letter's title, as the admin panel shows it. */
export const AUTHORITY_TITLES: Readonly<Record<AuthorityLetter, string>> = Object.freeze({
  D: 'Observer', F: 'Player', G: 'Chat logger', H: 'Journalist', J: 'Helper', L: 'GM 1', M: 'GM 2', N: 'GM 3',
  O: 'Operator', P: 'Admin', A: 'VIP 1', B: 'VIP 2', C: 'VIP 3', E: 'VIP 4',
});

/** The letters the admin panel can give an account or a character, in the order it lists them. */
export const SETTABLE_AUTHORITIES: readonly AuthorityLetter[] = Object.freeze([
  Authority.GENERAL, Authority.VIP1, Authority.VIP2, Authority.VIP3, Authority.VIP4, Authority.HELPER,
  Authority.GAMEMASTER, Authority.GAMEMASTER2, Authority.GAMEMASTER3, Authority.OPERATOR, Authority.ADMINISTRATOR,
]);

const code = (authority: number | string): number => (typeof authority === 'string' ? authority.charCodeAt(0) : authority);
const GENERAL_CODE = Authority.GENERAL.charCodeAt(0);
const VIP_CODES: ReadonlySet<number> = new Set(VIP_AUTHORITIES.map((letter) => letter.charCodeAt(0)));

/** `IsAuthVip`: one of the four VIP letters (a letter or its char code). */
export function isVipAuthority(authority: number | string): boolean {
  return VIP_CODES.has(code(authority));
}

/** `GetAuthLevel`: the char code the game's checks use; a VIP letter counts as AUTH_GENERAL's 'F'. */
export function authorityLevel(authority: number | string): number {
  const c = code(authority);
  return VIP_CODES.has(c) ? GENERAL_CODE : c;
}

/**
 * The letter a character plays with (`CDbManager::Join`, `_Database/DbManagerJoin.cpp:237`, with the vip-auth patch):
 * the account's letter, unless the account is a player ('F') or a VIP. Then the character's own letter counts, and a
 * VIP account's letter stays only while the character's own is 'F'.
 */
export function gameAuthority(account: string, character: string): string {
  if (account === Authority.GENERAL) return character;
  if (isVipAuthority(account)) return character === Authority.GENERAL ? account : character;
  return account;
}

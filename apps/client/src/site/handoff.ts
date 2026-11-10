// The new account's name, handed from the sign-up page to the game's login form at /play (website spec §3.3): kept in
// sessionStorage, read once by /play and cleared, never put in the address. A browser that refuses the storage
// (a private mode, a blocked site) gets an empty login form, as without the hand-off.

export const SIGN_UP_ACCOUNT_KEY = 'flyffweb.signUpAccount';

export function putSignUpAccount(storage: Storage | null, account: string): void {
  try {
    storage?.setItem(SIGN_UP_ACCOUNT_KEY, account);
  } catch {
    // no hand-off: the player types the name
  }
}

/** The name the sign-up page left, once: it is removed as it is read. `''` when there is none. */
export function takeSignUpAccount(storage: Storage | null): string {
  try {
    const account = storage?.getItem(SIGN_UP_ACCOUNT_KEY) ?? '';
    storage?.removeItem(SIGN_UP_ACCOUNT_KEY);
    return account;
  } catch {
    return '';
  }
}

/** The page's sessionStorage, or null where reading it throws. */
export function pageSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

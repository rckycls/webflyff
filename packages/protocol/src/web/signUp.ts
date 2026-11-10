// The sign-up rules (website spec §3.3-§3.4), shared by the sign-up page, which checks them first for the player's sake,
// and the web service, which checks them again because a page is in the player's hands.

export type SignUpField = 'account' | 'password' | 'confirm' | 'email';

/** What the page sends. `confirm` is the page's own: the server has none and skips that check. */
export interface SignUpForm { account: string; password: string; confirm?: string; email: string }

export interface SignUpProblem { field: SignUpField; message: string }

/** Names nobody may take: the exact names, and any name starting with one of the prefixes (both lower-case). */
export interface ReservedNames { exact: readonly string[]; prefixes: readonly string[] }

/** Spec §3.4's list; the web service's settings can replace it. */
export const DEFAULT_RESERVED_NAMES: ReservedNames = {
  exact: ['admin', 'administrator', 'gamemaster', 'staff', 'support', 'moderator', 'system', 'owner', 'root', 'server'],
  prefixes: ['gm', 'admin'],
};

/** The account as it is stored: trimmed, then lower-cased, as the certifier lower-cases names at login. */
export function normalizeAccount(account: string): string {
  return account.trim().toLowerCase();
}

const ACCOUNT_CHARACTERS = /^[a-z0-9_-]+$/;
// Printable ASCII, space to `~`: what the login can send. Exactly 32 characters can never be chosen: the login sends a
// 32-character input unhashed, as a hash already (`hashPassword`).
const PASSWORD_CHARACTERS = /^[\x20-\x7e]+$/;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const problem = (field: SignUpField, message: string): SignUpProblem => ({ field, message });

/**
 * The first rule the form breaks, or `undefined` when it keeps them all. The checks run in this order: the account
 * (empty, length, characters, reserved), the password (length, characters, a letter and a digit, not the name), the
 * confirmation when there is one, the email.
 */
export function checkSignUp(form: SignUpForm, reserved: ReservedNames = DEFAULT_RESERVED_NAMES): SignUpProblem | undefined {
  const account = normalizeAccount(form.account);
  if (account === '') return problem('account', 'Enter an account name.');
  if (account.length < 4 || account.length > 32) return problem('account', 'The account name must be 4 to 32 characters long.');
  if (!ACCOUNT_CHARACTERS.test(account)) return problem('account', 'Use only letters, numbers, - and _ in the account name.');
  if (reserved.exact.includes(account) || reserved.prefixes.some((prefix) => account.startsWith(prefix))) {
    return problem('account', 'That account name is reserved.');
  }

  const { password } = form;
  if (password.length < 8 || password.length > 31) return problem('password', 'The password must be 8 to 31 characters long.');
  if (!PASSWORD_CHARACTERS.test(password)) {
    return problem('password', 'Use only letters, numbers, spaces and common symbols in the password.');
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return problem('password', 'The password needs at least one letter and one number.');
  }
  if (password.toLowerCase() === account) return problem('password', 'The password cannot be the account name.');

  if (form.confirm !== undefined && form.confirm !== password) return problem('confirm', 'The passwords do not match.');

  const { email } = form;
  if (email !== '' && (email.length > 100 || !EMAIL_SHAPE.test(email))) {
    return problem('email', 'Enter a valid email address, or leave it empty.');
  }
  return undefined;
}

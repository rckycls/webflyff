// The pre-registration settings file, `.env` (docs/2026-11-15-prereg-login.md), read the same way by the gateway (who
// may log in) and the web service (how many accounts one IP and one browser may make). Text only: each app reads the
// file itself.

/** What the `.env` file says. `allowed` holds the names in lower case: account names are not case-sensitive. */
export interface PreregRule {
  on: boolean;
  allowed: ReadonlySet<string>;
  /** While `on`: how many accounts one IP, and one browser, may make in all. 0: no such cap. */
  maxAccounts: number;
  /** Problems worth a line in the log, for example a PREREG_ONLY that is neither true nor false. */
  warnings: string[];
}

/** The cap when the file names none: room for a family or a shared connection. */
export const DEFAULT_PREREG_MAX_ACCOUNTS = 3;

export const PREREG_OFF: PreregRule = Object.freeze({
  on: false, allowed: new Set<string>(), maxAccounts: DEFAULT_PREREG_MAX_ACCOUNTS, warnings: [],
});

const ON = new Set(['true', '1', 'yes', 'on']);
const OFF = new Set(['false', '0', 'no', 'off', '']);

/** The value of one `KEY=VALUE` line: quotes taken off, or a ` #` comment after an unquoted value. */
function value(raw: string): string {
  const text = raw.trim();
  const quote = text[0];
  if ((quote === '"' || quote === "'") && text.length >= 2 && text.endsWith(quote)) return text.slice(1, -1).trim();
  return text.replace(/\s+#.*$/, '').trim();
}

/**
 * Reads the text of a `.env` file: `KEY=VALUE` lines, `#` comments and blank lines; keys in any case; the last line
 * of a key wins.
 * - `PREREG_ONLY` true, 1, yes or on turns the lock on; false, 0, no, off, empty or no line leaves it off; anything
 *   else turns it on too, with a warning, so a typo never opens the game.
 * - `PREREG_ALLOWED_ACCOUNTS` is a list of account names split at commas (spaces and semicolons work too), trimmed and
 *   in lower case.
 * - `PREREG_MAX_ACCOUNTS_PER_IP` is a whole number from 0 (no cap) to 1000; no line or an empty one gives
 *   `DEFAULT_PREREG_MAX_ACCOUNTS`, anything else that too, with a warning.
 */
export function parsePreregEnv(text: string): PreregRule {
  const values = new Map<string, string>();
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    values.set(trimmed.slice(0, eq).trim().replace(/^export\s+/i, '').toUpperCase(), value(trimmed.slice(eq + 1)));
  }
  const warnings: string[] = [];
  const only = (values.get('PREREG_ONLY') ?? '').toLowerCase();
  const on = !OFF.has(only);
  if (on && !ON.has(only)) warnings.push(`PREREG_ONLY=${only} is neither true nor false: the lock is on`);
  const allowed = new Set(
    (values.get('PREREG_ALLOWED_ACCOUNTS') ?? '').split(/[\s,;]+/).map((name) => name.toLowerCase()).filter((name) => name !== ''),
  );
  const cap = values.get('PREREG_MAX_ACCOUNTS_PER_IP') ?? '';
  let maxAccounts = DEFAULT_PREREG_MAX_ACCOUNTS;
  if (/^\d{1,4}$/.test(cap) && Number(cap) <= 1000) maxAccounts = Number(cap);
  else if (cap !== '') warnings.push(`PREREG_MAX_ACCOUNTS_PER_IP=${cap} is not a whole number from 0 to 1000: ${DEFAULT_PREREG_MAX_ACCOUNTS} is used`);
  return { on, allowed, maxAccounts, warnings };
}

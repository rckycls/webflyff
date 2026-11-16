// The VIP list for the pre-registration reward (docs/2026-11-15-prereg-login.md): the accounts made while the lock was
// on, oldest first, as a CSV a spreadsheet opens. `vip` is yes for the first account of its IP that is also the first of
// its browser (or came with no browser cookie): one reward per connection and per browser. The owner decides in the end.

import type { SignUpRecord } from './signUpBook';

export const PREREG_CSV_HEADER =
  'signed_up_utc,account,ip,browser,accounts_on_ip,accounts_on_browser,first_on_ip,first_on_browser,vip';

/** A spreadsheet reads a cell starting with = + - @ as a formula: such a value gets a ' in front. */
function cell(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

/** The CSV of the pre-registration records among `records` (Windows line ends, header first). */
export function preregCsv(records: SignUpRecord[]): { csv: string; accounts: number; vip: number } {
  const prereg = records.filter((r) => r.prereg);
  const onIp = new Map<string, number>();
  const onBrowser = new Map<string, number>();
  for (const r of prereg) {
    onIp.set(r.ip, (onIp.get(r.ip) ?? 0) + 1);
    if (r.browser !== '') onBrowser.set(r.browser, (onBrowser.get(r.browser) ?? 0) + 1);
  }
  const seenIp = new Set<string>();
  const seenBrowser = new Set<string>();
  const lines = [PREREG_CSV_HEADER];
  let vip = 0;
  for (const r of prereg) {
    const firstOnIp = !seenIp.has(r.ip);
    const firstOnBrowser = r.browser === '' || !seenBrowser.has(r.browser);
    seenIp.add(r.ip);
    if (r.browser !== '') seenBrowser.add(r.browser);
    const isVip = firstOnIp && firstOnBrowser;
    if (isVip) vip++;
    lines.push([
      r.time, cell(r.account), r.ip, r.browser.slice(0, 8), String(onIp.get(r.ip)),
      r.browser === '' ? '' : String(onBrowser.get(r.browser)),
      firstOnIp ? 'yes' : 'no', r.browser === '' ? '' : firstOnBrowser ? 'yes' : 'no', isVip ? 'yes' : 'no',
    ].join(','));
  }
  return { csv: `${lines.join('\r\n')}\r\n`, accounts: prereg.length, vip };
}

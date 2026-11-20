// Redeem codes (2026-11-20, docs/superpowers/specs/2026-11-20-vip-codes-design.md): a use's items go by in-game mail,
// one mail per stack, titled `Code reward #<use id>` (the game moves those mails into the bag), with the panel's login:
// right after the redeem (deliverOne), and every 5 minutes for whatever still waits (deliverCodeUses, in the VIP job).
// usp_AdminCodeMailSend writes a use's mails once (WEB_CODE_SENT); the use is then marked delivered. Neither function
// throws: a failure is one warning line, and the use waits for the next run.

import type { Logger } from '../log';
import type { CodeAdminStore, CodeMailStore, PendingUse } from './codeStore';

/** The uses read at a time, and the most pages one run reads (2,000 uses). */
export const USES_PER_PAGE = 50;
export const MAX_USE_PAGES = 40;

export const codeMailTitle = (useId: number): string => `Code reward #${useId}`;
export const codeMailText = (label: string): string => `From code "${label}". Collect within 15 days.`.slice(0, 255);

export interface CodeDeliveryStores { admin: CodeAdminStore; mail: CodeMailStore }
export interface CodeDeliveryReport { sent: number; waiting: number }

const message = (error: unknown): string => String((error as Error)?.message ?? error).replace(/[\r\n]+/g, ' ');

/** One use: 'sent' (now or before), or 'waiting' (no character yet). Throws on a store failure. */
async function send(stores: CodeDeliveryStores, use: PendingUse): Promise<'sent' | 'waiting'> {
  const sent = await stores.mail.sendUse(use, codeMailTitle(use.id), codeMailText(use.label));
  if (sent.result === 0 || sent.idPlayer === null) return 'waiting';
  await stores.admin.markDelivered(use.id, sent.idPlayer, sent.characterName);
  return 'sent';
}

/** Every use not delivered yet, a page at a time, so uses that wait never hold back the ones behind them. */
export async function deliverCodeUses(stores: CodeDeliveryStores, log: Logger): Promise<CodeDeliveryReport> {
  const report: CodeDeliveryReport = { sent: 0, waiting: 0 };
  const pending: PendingUse[] = [];
  try {
    for (let afterId = 0, page = 0; page < MAX_USE_PAGES; page++) {
      const rows = await stores.admin.pending(USES_PER_PAGE, afterId);
      pending.push(...rows);
      if (rows.length < USES_PER_PAGE) break;
      afterId = rows[rows.length - 1]!.id;
    }
  } catch (error) {
    log.warn(`code: the uses waiting for their mail could not be read: ${message(error)}`);
    return report;
  }
  for (const use of pending) {
    try {
      if ((await send(stores, use)) === 'sent') report.sent++;
      else report.waiting++;
    } catch (error) {
      log.warn(`code: use ${use.id} not mailed (tried again in 5 minutes): ${message(error)}`);
    }
  }
  return report;
}

/** One use, right after its redeem. */
export async function deliverOne(stores: CodeDeliveryStores, log: Logger, useId: number): Promise<void> {
  try {
    const use = await stores.admin.pendingOne(useId);
    if (use !== undefined) await send(stores, use);
  } catch (error) {
    log.warn(`code: use ${useId} not mailed now (the VIP job tries again): ${message(error)}`);
  }
}

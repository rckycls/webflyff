// The VIP job (2026-11-19, VIP perks, docs/superpowers/specs/2026-11-19-vip-perks-design.md §1 and §4): every 5 minutes,
// while the vip and admin sections are on, the website keeps the in-game VIP letters in step with the VIP list and sends
// the gift boxes. In order:
//   1. adopt: an account or character with a VIP letter set by hand (before this) and no WEB_VIP row at all becomes
//      30 days of VIP at that level, with no box, so nobody silently loses a star the owner gave;
//   2. the account letters: the live VIP's letter, else F (staff letters never change; the SQL logs each change);
//   3. the characters' own VIP letters back to F (they would win over the account's at entry);
//   4. the gift boxes not sent yet: each one's mails to the account's character, once; a box waits while the account has
//      no character, or while its tier's box is empty.
// It never throws: a step that fails is one warning line, and the next steps still run. The game reads a letter each time
// a character enters the world, so a change counts from the player's next entry.
// 2026-11-20 (redeem codes): 5. the code uses whose mails are not written yet (codes/codeDelivery.ts).

import { deliverCodeUses } from '../codes/codeDelivery';
import type { CodeDeliveryStores } from '../codes/codeDelivery';
import type { Logger } from '../log';
import type { VipAdminStore, VipCharacterStore, VipGift, VipGiftItem } from './vipStore';

/** The first run a minute after start, then every 5 minutes. */
export const VIP_JOB_FIRST_MS = 60_000;
export const VIP_JOB_EVERY_MS = 5 * 60_000;
/** The unsent gift boxes read at a time, and the most pages one run reads (2,000 boxes). */
export const GIFTS_PER_RUN = 50;
export const MAX_GIFT_PAGES = 40;
export const GIFT_TEXT = 'Thank you for supporting osflyff.online!';

export interface VipJobStores { admin: VipAdminStore; characters: VipCharacterStore; codes?: CodeDeliveryStores }
export interface VipJobReport { adopted: number; letters: number; cleared: number; sent: number; waiting: number; codesSent: number; codesWaiting: number }

const VIP_LETTERS = ['A', 'B', 'C', 'E'];
const message = (error: unknown): string => String((error as Error)?.message ?? error).replace(/[\r\n]+/g, ' ');

/** `10206x20,10207x20`: what a box held, for the gift log. */
export function itemsText(items: VipGiftItem[]): string {
  return items.map((i) => `${i.itemId}x${i.count}`).join(',');
}

export async function runVipPerksJob(stores: VipJobStores, log: Logger): Promise<VipJobReport> {
  const report: VipJobReport = { adopted: 0, letters: 0, cleared: 0, sent: 0, waiting: 0, codesSent: 0, codesWaiting: 0 };
  const step = async (name: string, act: () => Promise<void>): Promise<boolean> => {
    try {
      await act();
      return true;
    } catch (error) {
      log.warn(`vip job: ${name} failed: ${message(error)}`);
      return false;
    }
  };

  // 1. adopt the hand-set letters: the highest VIP level found on the account or any of its characters (the account's
  // own spelling kept). Each account is adopted at most once ever (WEB_VIP_ADOPTED).
  const handSet = new Map<string, { account: string; level: number }>();
  const note = (account: string, letter: string): void => {
    const level = VIP_LETTERS.indexOf(letter) + 1;
    const key = account.toLowerCase();
    const seen = handSet.get(key);
    if (level > 0 && level > (seen?.level ?? 0)) handSet.set(key, { account: seen?.account ?? account, level });
  };
  let adoptionOk = await step('letterAccounts', async () => { for (const l of await stores.admin.letterAccounts()) note(l.account, l.letter); });
  adoptionOk = (await step('characterLetters', async () => { for (const l of await stores.characters.characterLetters()) note(l.account, l.letter); })) && adoptionOk;
  for (const { account, level } of handSet.values()) {
    adoptionOk = (await step(`adopt ${account}`, async () => { if (await stores.admin.adopt(account, level)) report.adopted++; })) && adoptionOk;
  }

  // 2. and 3. the letters; not in a run whose adoption step failed: a hand-set star it missed would be cleared for good
  if (adoptionOk) {
    await step('syncLetters', async () => { report.letters = (await stores.admin.syncLetters()).length; });
    await step('clearCharacterLetters', async () => { report.cleared = await stores.characters.clearCharacterLetters(); });
  } else {
    log.warn('vip job: the letters are left as they are this run (finding the hand-set ones failed); the next run tries again');
  }

  // 4. the gift boxes: every unsent one, a page at a time, so boxes that wait (no character yet, an empty tier) never
  // hold back the ones behind them
  await step('gifts', async () => {
    const pending: VipGift[] = [];
    for (let afterId = 0, page = 0; page < MAX_GIFT_PAGES; page++) {
      const rows = await stores.admin.pendingGifts(GIFTS_PER_RUN, afterId);
      pending.push(...rows);
      if (rows.length < GIFTS_PER_RUN) break;
      afterId = rows[rows.length - 1]!.id;
    }
    if (pending.length === 0) return;
    const allItems = await stores.admin.giftItems();
    const emptyTiers = new Set<number>();
    for (const gift of pending) {
      const items = allItems.filter((i) => i.level === gift.level).sort((a, b) => a.slot - b.slot);
      if (items.length === 0) {
        report.waiting++;
        emptyTiers.add(gift.level);
        continue;
      }
      await step(`gift ${gift.id}`, async () => {
        const sent = await stores.characters.sendGift(gift, items, `VIP ${gift.level} gift`, GIFT_TEXT);
        if (sent.result === 0 || sent.idPlayer === null) {
          report.waiting++;
          return;
        }
        await stores.admin.markGiftSent(gift.id, sent.idPlayer, sent.characterName, itemsText(items));
        if (sent.result === 1) report.sent++;
      });
    }
    for (const level of emptyTiers) log.warn(`vip job: the VIP ${level} gift box is empty: its gifts wait (panel, VIP tab, Gift box)`);
  });

  // 5. (2026-11-20) the code uses still waiting for their mail; deliverCodeUses never throws
  if (stores.codes !== undefined) {
    const codes = await deliverCodeUses(stores.codes, log);
    report.codesSent = codes.sent;
    report.codesWaiting = codes.waiting;
    if (codes.sent > 0) log.info(`vip job: ${codes.sent} code reward(s) mailed, ${codes.waiting} waiting`);
  }

  if (report.adopted + report.letters + report.cleared + report.sent > 0) {
    log.info(`vip job: ${report.adopted} adopted, ${report.letters} letter(s) changed, ${report.cleared} character letter(s) reset, ${report.sent} gift box(es) sent, ${report.waiting} waiting`);
  }
  return report;
}

/** The job with its timer: a run asked for while one is still going is skipped (it gives `undefined`). */
export class VipPerksJob {
  private running = false;
  private timers: NodeJS.Timeout[] = [];

  constructor(private readonly stores: VipJobStores, private readonly log: Logger) {}

  async run(): Promise<VipJobReport | undefined> {
    if (this.running) return undefined;
    this.running = true;
    try {
      return await runVipPerksJob(this.stores, this.log);
    } finally {
      this.running = false;
    }
  }

  start(firstMs = VIP_JOB_FIRST_MS, everyMs = VIP_JOB_EVERY_MS): void {
    const tick = () => { void this.run(); };
    this.timers.push(setTimeout(tick, firstMs).unref(), setInterval(tick, everyMs).unref());
  }

  stop(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers = [];
  }
}

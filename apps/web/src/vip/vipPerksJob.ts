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

import type { Logger } from '../log';
import type { VipAdminStore, VipCharacterStore, VipGiftItem } from './vipStore';

/** The first run a minute after start, then every 5 minutes. */
export const VIP_JOB_FIRST_MS = 60_000;
export const VIP_JOB_EVERY_MS = 5 * 60_000;
/** The most gift boxes one run sends. */
export const GIFTS_PER_RUN = 50;
export const GIFT_TEXT = 'Thank you for supporting osflyff.online!';

export interface VipJobStores { admin: VipAdminStore; characters: VipCharacterStore }
export interface VipJobReport { adopted: number; letters: number; cleared: number; sent: number; waiting: number }

const VIP_LETTERS = ['A', 'B', 'C', 'E'];
const message = (error: unknown): string => String((error as Error)?.message ?? error).replace(/[\r\n]+/g, ' ');

/** `10206x20,10207x20`: what a box held, for the gift log. */
export function itemsText(items: VipGiftItem[]): string {
  return items.map((i) => `${i.itemId}x${i.count}`).join(',');
}

export async function runVipPerksJob(stores: VipJobStores, log: Logger): Promise<VipJobReport> {
  const report: VipJobReport = { adopted: 0, letters: 0, cleared: 0, sent: 0, waiting: 0 };
  const step = async (name: string, act: () => Promise<void>): Promise<void> => {
    try {
      await act();
    } catch (error) {
      log.warn(`vip job: ${name} failed: ${message(error)}`);
    }
  };

  // 1. adopt the hand-set letters: the highest VIP level found on the account or any of its characters
  const handSet = new Map<string, number>();
  const note = (account: string, letter: string): void => {
    const level = VIP_LETTERS.indexOf(letter) + 1;
    const key = account.toLowerCase();
    if (level > 0 && level > (handSet.get(key) ?? 0)) handSet.set(key, level);
  };
  await step('letterAccounts', async () => { for (const l of await stores.admin.letterAccounts()) note(l.account, l.letter); });
  await step('characterLetters', async () => { for (const l of await stores.characters.characterLetters()) note(l.account, l.letter); });
  for (const [account, level] of handSet) {
    await step(`adopt ${account}`, async () => { if (await stores.admin.adopt(account, level)) report.adopted++; });
  }

  // 2. and 3. the letters
  await step('syncLetters', async () => { report.letters = (await stores.admin.syncLetters()).length; });
  await step('clearCharacterLetters', async () => { report.cleared = await stores.characters.clearCharacterLetters(); });

  // 4. the gift boxes
  await step('gifts', async () => {
    const pending = await stores.admin.pendingGifts(GIFTS_PER_RUN);
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

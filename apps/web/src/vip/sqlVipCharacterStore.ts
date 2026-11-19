// 2026-11-19 (VIP perks): the VIP job's CHARACTER_01_DBF side, as `flyffweb_admin` (its user there comes from
// Install-AdminLogin.ps1), through vip.sql's usp_AdminVipCharacterLetters, usp_AdminVipClearCharacterLetters and
// usp_AdminVipGiftSend. Typed parameters only. Checked by the owner's run in the VM, as the other SQL stores are.

import sql from 'mssql';
import type { AdminConfig } from '../admin/config';
import type { WebConfig } from '../config';
import { firstValue, lazyPool } from '../sqlAccountStore';
import type { VipCharacterStore } from './vipStore';

type Row = Record<string, unknown>;

/** The most item stacks one box holds (usp_AdminVipGiftSend's @item1..@item6). */
export const GIFT_SLOTS = 6;

export function sqlVipCharacterStore(settings: WebConfig['sql'], login: AdminConfig['sql']): VipCharacterStore & { close(): Promise<void> } {
  const characters = lazyPool({ ...settings, user: login.user, password: login.password }, settings.characterDatabase);
  const run = async (name: string, inputs: (r: sql.Request) => sql.Request = (r) => r) => inputs((await characters.get()).request()).execute(`dbo.${name}`);
  const textOrNull = (value: unknown): string | null => (value === null || value === undefined ? null : String(value).trim());
  return {
    async characterLetters() {
      const rows = ((await run('usp_AdminVipCharacterLetters')).recordset ?? []) as Row[];
      return rows.map((r) => ({ account: String(r.account ?? '').trim(), letter: String(r.letter ?? '').trim() }));
    },
    async clearCharacterLetters() {
      return Number(firstValue(await run('usp_AdminVipClearCharacterLetters')) ?? 0);
    },
    async sendGift(gift, items, title, text) {
      const stacks = [...items].sort((a, b) => a.slot - b.slot).slice(0, GIFT_SLOTS);
      const result = await run('usp_AdminVipGiftSend', (r) => {
        r.input('giftId', sql.Int, gift.id).input('account', sql.VarChar(32), gift.account)
          .input('title', sql.VarChar(128), title.slice(0, 128)).input('text', sql.VarChar(255), text.slice(0, 255));
        stacks.forEach((s, i) => r.input(`item${i + 1}`, sql.Int, s.itemId).input(`count${i + 1}`, sql.Int, s.count));
        return r;
      });
      const row = ((result.recordset ?? []) as Row[])[0];
      const code = Number(row?.result ?? 0);
      return { result: code === 1 || code === 2 ? code : 0, idPlayer: textOrNull(row?.idPlayer), characterName: textOrNull(row?.characterName) };
    },
    close: () => characters.close(),
  };
}

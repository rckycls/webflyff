// The `vip` section of web.config.json (Support / VIP, 2026-11-16). parseWebConfig catches what this throws: a bad
// section keeps Support / VIP off and the site running, as the admin section does. Without the section it is off.
//
//   "vip": { "uploadsDir": "C:\\flyff-web\\vip-uploads", "maxPendingPerAccount": 3, "deleteRejectedAfterDays": 30 }

import { integer, object, onlyKeys, text } from '../configHelpers';

export interface VipConfig {
  /** Where the receipts and QR pictures go: outside every folder Caddy serves. */
  uploadsDir: string;
  /** Requests one account may have processing at once. */
  maxPendingPerAccount: number;
  /** Days a rejected request keeps its receipt picture; 0 keeps it for ever. */
  deleteRejectedAfterDays: number;
}

const KEYS = ['uploadsDir', 'maxPendingPerAccount', 'deleteRejectedAfterDays'] as const;

export function parseVipConfig(value: unknown): VipConfig {
  const root = object(value, 'vip');
  onlyKeys(root, KEYS, 'vip');
  return {
    uploadsDir: text(root.uploadsDir, 'vip.uploadsDir'),
    maxPendingPerAccount: root.maxPendingPerAccount === undefined ? 3 : integer(root.maxPendingPerAccount, 'vip.maxPendingPerAccount', 1, 10),
    deleteRejectedAfterDays: root.deleteRejectedAfterDays === undefined ? 30 : integer(root.deleteRejectedAfterDays, 'vip.deleteRejectedAfterDays', 0, 3650),
  };
}

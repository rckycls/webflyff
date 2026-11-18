// The VIP tab (Support / VIP, 2026-11-16): the payment QRs players see, the tiers and their prices, and the queue of
// requests a player sent with a receipt. Approve sets the account's VIP (vip.sql usp_AdminVipApprove's rule: the same
// tier while it runs adds a month to its end; anything else starts the new tier now, for a month); Reject needs the
// reason the player will see. Every change is in the Log tab (runAudited), and the request keeps who decided and when.
// Without web.config.json's vip section every action answers 503 `off`.

import type { HttpAnswer } from '../../signUpHandler';
import { readImageField } from '../../vip/images';
import type { VipRequestStatus } from '../../vip/vipStore';
import { VIP_REQUEST_STATUSES } from '../../vip/vipStore';
import type { ActionHandler, AdminDeps } from '../adminServer';
import { runAudited } from '../audit';
import { intField, invalid, okReply, reply, textField } from './fields';

const off = (): HttpAnswer => reply(503, { error: 'off', message: 'Support / VIP is off: web.config.json has no good "vip" section.' });
const notFound = (): HttpAnswer => reply(404, { error: 'not_found' });

type VipDeps = NonNullable<AdminDeps['vip']>;
const withVip = (handler: (body: Record<string, unknown>, ctx: Parameters<ActionHandler>[1], deps: AdminDeps, vip: VipDeps) => Promise<HttpAnswer>): ActionHandler =>
  async (body, ctx, deps) => (deps.vip === undefined ? off() : handler(body, ctx, deps, deps.vip));

/** An optional text field: '' when missing or blank, `undefined` when not a string or too long. */
function optionalText(body: Record<string, unknown>, key: string, max: number): string | undefined {
  const value = body[key];
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text.length > max ? undefined : text;
}

const boolField = (body: Record<string, unknown>, key: string): boolean | undefined => (typeof body[key] === 'boolean' ? (body[key] as boolean) : undefined);

/** Dollars (or pesos) as the panel sends them (2, 4.5, "10.00") in cents, from 0.01 to 10,000. */
export function priceCents(value: unknown): number | undefined {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(text)) return undefined;
  const cents = Math.round(Number(text) * 100);
  return cents >= 1 && cents <= 1_000_000 ? cents : undefined;
}

const requests = withVip(async (body, _ctx, _deps, vip) => {
  const status = body.status;
  if (typeof status !== 'string' || !VIP_REQUEST_STATUSES.includes(status as VipRequestStatus)) return invalid('status');
  const rows = await vip.store.requests(status as VipRequestStatus);
  return reply(200, { rows: rows.map(({ hasReceipt, ...r }) => ({ ...r, receipt: hasReceipt ? `/vip/receipt/${r.id}` : null })) });
});

const approve = withVip(async (body, ctx, deps, vip) => {
  const id = intField(body, 'id', 1, 2_147_483_647);
  if (id === undefined) return invalid('id');
  const request = await vip.store.request(id);
  if (request === undefined) return notFound();
  if (request.status !== 'P') return reply(409, { error: 'refused', message: 'This request was already approved or rejected.' });
  return runAudited(deps, ctx, {
    action: 'vip.approve', account: request.account,
    before: { id, level: request.level, currency: request.currency, priceCents: request.priceCents, reference: request.reference, vipLevel: request.vipLevel, vipEndsAt: request.vipNowEndsAt },
  }, async () => {
    const done = await vip.store.approve(id, ctx.session.user);
    if (done.result === 'ok') return { answer: okReply({ level: done.level, endsAt: done.endsAt }), result: 'ok', after: { level: done.level, endsAt: done.endsAt } };
    return { answer: reply(409, { error: 'refused', message: 'This request was already approved or rejected.' }), result: 'refused', after: { result: done.result } };
  });
});

const reject = withVip(async (body, ctx, deps, vip) => {
  const id = intField(body, 'id', 1, 2_147_483_647);
  if (id === undefined) return invalid('id');
  const reason = textField(body, 'reason', 200);
  if (reason === undefined) return invalid('reason', 'Write the reason the player will see (at most 200 characters).');
  const request = await vip.store.request(id);
  if (request === undefined) return notFound();
  if (request.status !== 'P') return reply(409, { error: 'refused', message: 'This request was already approved or rejected.' });
  return runAudited(deps, ctx, {
    action: 'vip.reject', account: request.account, before: { id, level: request.level, reference: request.reference, reason },
  }, async () => ((await vip.store.reject(id, ctx.session.user, reason))
    ? { answer: okReply(), result: 'ok', after: { rejected: id } }
    : { answer: reply(409, { error: 'refused', message: 'This request was already approved or rejected.' }), result: 'refused', after: { decided: id } }));
});

const tiers = withVip(async (_body, _ctx, _deps, vip) => reply(200, { rows: await vip.store.tiers() }));

const tierSave = withVip(async (body, ctx, deps, vip) => {
  const level = intField(body, 'level', 1, 9);
  if (level === undefined) return invalid('level');
  const name = textField(body, 'name', 32);
  if (name === undefined) return invalid('name', 'Give the tier a name (at most 32 characters).');
  const cents = priceCents(body.price);
  if (cents === undefined) return invalid('price', 'The price is in US dollars, like 2 or 4.50.');
  // the peso price: empty for US$ only (players in the Philippines then see dollars for this tier)
  const php = body.pricePhp === undefined || body.pricePhp === null || body.pricePhp === '' ? null : priceCents(body.pricePhp) ?? false;
  if (php === false) return invalid('pricePhp', 'The peso price is like 115 or 230.50 (empty: US$ only).');
  const on = boolField(body, 'on');
  if (on === undefined) return invalid('on');
  const before = (await vip.store.tiers()).find((t) => t.level === level);
  if (before === undefined) return notFound();
  const tier = { level, name, priceCents: cents, pricePhpCents: php, on };
  return runAudited(deps, ctx, { action: 'vip.tierSave', before }, async () => ((await vip.store.saveTier(tier))
    ? { answer: okReply(), result: 'ok', after: tier }
    : { answer: notFound(), result: 'refused', after: { missing: level } }));
});

const qrs = withVip(async (_body, _ctx, _deps, vip) => {
  const rows = await vip.store.qrList();
  return reply(200, { rows: rows.map(({ imageFile: _file, ...r }) => ({ ...r, image: `/vip/qr/${r.id}` })) });
});

/** The fields a QR has besides its picture, checked; or the answer that refuses them. */
function qrFields(body: Record<string, unknown>): { label: string; accountName: string; note: string; on: boolean; order: number } | HttpAnswer {
  const label = textField(body, 'label', 40);
  if (label === undefined) return invalid('label', 'Give the QR a label, like GCash or Maya (at most 40 characters).');
  const accountName = textField(body, 'accountName', 80);
  if (accountName === undefined) return invalid('accountName', 'Give the account name players will see (at most 80 characters).');
  const note = optionalText(body, 'note', 200);
  if (note === undefined) return invalid('note', 'The note can be at most 200 characters.');
  const on = boolField(body, 'on');
  if (on === undefined) return invalid('on');
  const order = intField(body, 'order', 1, 999);
  if (order === undefined) return invalid('order', 'The order is a number from 1 to 999 (1 shows first).');
  return { label, accountName, note, on, order };
}

const qrAdd = withVip(async (body, ctx, deps, vip) => {
  const fields = qrFields(body);
  if ('status' in fields) return fields;
  const image = readImageField(body.image);
  if ('problem' in image) {
    return invalid('image', image.problem === 'too_big' ? 'The picture is over 5 MB.' : image.problem === 'missing' ? 'Pick the QR picture.' : 'The file is not a PNG, JPEG or WebP picture.');
  }
  return runAudited(deps, ctx, { action: 'vip.qrAdd', before: fields }, async () => {
    const imageFile = await vip.files.save('qr', image.bytes, image.type);
    try {
      const id = await vip.store.addQr({ ...fields, imageFile });
      return { answer: okReply({ id }), result: 'ok', after: { id } };
    } catch (error) {
      await vip.files.remove('qr', imageFile);
      throw error;
    }
  });
});

const qrSave = withVip(async (body, ctx, deps, vip) => {
  const id = intField(body, 'id', 1, 2_147_483_647);
  if (id === undefined) return invalid('id');
  const fields = qrFields(body);
  if ('status' in fields) return fields;
  const before = (await vip.store.qrList()).find((q) => q.id === id);
  if (before === undefined) return notFound();
  const { imageFile: _file, ...shown } = before;
  return runAudited(deps, ctx, { action: 'vip.qrSave', before: shown }, async () => ((await vip.store.saveQr({ id, ...fields }))
    ? { answer: okReply(), result: 'ok', after: fields }
    : { answer: notFound(), result: 'refused', after: { missing: id } }));
});

const qrDelete = withVip(async (body, ctx, deps, vip) => {
  const id = intField(body, 'id', 1, 2_147_483_647);
  if (id === undefined) return invalid('id');
  const before = (await vip.store.qrList()).find((q) => q.id === id);
  if (before === undefined) return notFound();
  const { imageFile: _file, ...shown } = before;
  return runAudited(deps, ctx, { action: 'vip.qrDelete', before: shown }, async () => {
    const file = await vip.store.deleteQr(id);
    if (file === undefined) return { answer: notFound(), result: 'refused', after: { missing: id } };
    await vip.files.remove('qr', file);
    return { answer: okReply(), result: 'ok', after: { deleted: id } };
  });
});

// --- 2026-11-19 (VIP perks): Give VIP, the gift box contents and the gift log ------------------------------------------

/** The most days Give VIP gives at once, and the most rows the gift log shows. */
const MAX_GIVE_DAYS = 366;
const GIFT_LOG_ROWS = 100;

const give = withVip(async (body, ctx, deps, vip) => {
  const account = textField(body, 'account', 32);
  if (account === undefined) return invalid('account', 'Type the account name.');
  const level = intField(body, 'level', 1, 4);
  if (level === undefined) return invalid('level', 'The VIP level is 1 to 4.');
  const days = intField(body, 'days', 1, MAX_GIVE_DAYS);
  if (days === undefined) return invalid('days', `The number of days is 1 to ${MAX_GIVE_DAYS}.`);
  const gift = boolField(body, 'gift');
  if (gift === undefined) return invalid('gift');
  return runAudited(deps, ctx, { action: 'vip.give', account, before: { level, days, gift } }, async () => {
    const done = await vip.store.give(account, level, days, gift, ctx.session.user);
    if (done.result === 'ok') return { answer: okReply({ level: done.level, endsAt: done.endsAt }), result: 'ok', after: { level: done.level, endsAt: done.endsAt, gift } };
    if (done.result === 'unknown') return { answer: reply(404, { error: 'not_found', message: 'There is no such account.' }), result: 'refused', after: { unknown: account } };
    return { answer: invalid('level'), result: 'refused', after: { result: done.result } };
  });
});

const giftItems = withVip(async (_body, _ctx, deps, vip) => {
  const names = new Map(deps.catalog.map((item) => [item.id, item.name]));
  return reply(200, { rows: (await vip.store.giftItems()).map((i) => ({ ...i, name: names.get(i.itemId) ?? null })) });
});

const giftItemSave = withVip(async (body, ctx, deps, vip) => {
  const level = intField(body, 'level', 1, 4);
  if (level === undefined) return invalid('level', 'The VIP level is 1 to 4.');
  const slot = intField(body, 'slot', 1, 6);
  if (slot === undefined) return invalid('slot', 'A box holds 6 item stacks: the slot is 1 to 6.');
  const count = intField(body, 'count', 0, 9999);
  if (count === undefined) return invalid('count', 'The count is 1 to 9999 (0 empties the slot).');
  let itemId = 0;
  if (count > 0) {
    const id = intField(body, 'itemId', 1, 2_147_483_647);
    const item = id === undefined ? undefined : deps.catalog.find((i) => i.id === id);
    if (item === undefined) return invalid('itemId', 'Pick an item from the search.');
    if (count > item.packMax) return invalid('count', `${item.name} stacks to ${item.packMax}: one slot holds at most that many.`);
    itemId = item.id;
  }
  const before = (await vip.store.giftItems()).find((i) => i.level === level && i.slot === slot) ?? { level, slot, empty: true };
  const after = { level, slot, itemId, count };
  return runAudited(deps, ctx, { action: 'vip.giftItem', before }, async () => ((await vip.store.saveGiftItem(after))
    ? { answer: okReply(), result: 'ok', after }
    : { answer: invalid('slot'), result: 'refused', after }));
});

const giftLog = withVip(async (_body, _ctx, _deps, vip) => reply(200, { rows: await vip.store.giftLog(GIFT_LOG_ROWS) }));

export const VIP_ACTIONS = {
  'vip.requests': requests,
  'vip.approve': approve,
  'vip.reject': reject,
  'vip.tiers': tiers,
  'vip.tierSave': tierSave,
  'vip.qrs': qrs,
  'vip.qrAdd': qrAdd,
  'vip.qrSave': qrSave,
  'vip.qrDelete': qrDelete,
  'vip.give': give,
  'vip.giftItems': giftItems,
  'vip.giftItemSave': giftItemSave,
  'vip.giftLog': giftLog,
} satisfies Record<string, ActionHandler>;

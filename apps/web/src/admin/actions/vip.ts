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

/** Dollars as the panel sends them (2, 4.5, "10.00") in cents, from $0.01 to $10,000. */
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
  return reply(200, { rows: rows.map((r) => ({ ...r, receipt: `/vip/receipt/${r.id}` })) });
});

const approve = withVip(async (body, ctx, deps, vip) => {
  const id = intField(body, 'id', 1, 2_147_483_647);
  if (id === undefined) return invalid('id');
  const request = await vip.store.request(id);
  if (request === undefined) return notFound();
  if (request.status !== 'P') return reply(409, { error: 'refused', message: 'This request was already approved or rejected.' });
  return runAudited(deps, ctx, {
    action: 'vip.approve', account: request.account,
    before: { id, level: request.level, priceCents: request.priceCents, reference: request.reference, vipLevel: request.vipLevel, vipEndsAt: request.vipNowEndsAt },
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
  const on = boolField(body, 'on');
  if (on === undefined) return invalid('on');
  const before = (await vip.store.tiers()).find((t) => t.level === level);
  if (before === undefined) return notFound();
  return runAudited(deps, ctx, { action: 'vip.tierSave', before }, async () => ((await vip.store.saveTier({ level, name, priceCents: cents, on }))
    ? { answer: okReply(), result: 'ok', after: { level, name, priceCents: cents, on } }
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
} satisfies Record<string, ActionHandler>;

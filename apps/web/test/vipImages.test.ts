import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES, readImageField, sniffImage } from '../src/vip/images';
import { isVipFileName, VipFiles } from '../src/vip/vipFiles';
import { parseWebConfig } from '../src/config';
import { testConfig } from './support/adminDeps';
import { PNG_BASE64 } from './support/vipPictures';

const png = Buffer.from(PNG_BASE64, 'base64');

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

it('tells PNG, JPEG and WebP by their first bytes, and nothing else', () => {
  expect(sniffImage(png)).toBe('png');
  expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]))).toBe('jpg');
  expect(sniffImage(Buffer.from('RIFF\x10\0\0\0WEBPVP8 ', 'latin1'))).toBe('webp');
  // a page, an SVG, a GIF, a PNG signature without its header chunk: no
  for (const text of ['<html><script>alert(1)</script>', '<svg xmlns="http://www.w3.org/2000/svg"/>', 'GIF89a\x01\0\x01\0']) {
    expect(sniffImage(Buffer.from(text, 'latin1'))).toBeUndefined();
  }
  expect(sniffImage(png.subarray(0, 12))).toBeUndefined();
});

it('reads a base64 picture, with or without a data: start, and refuses anything else', () => {
  expect(readImageField(PNG_BASE64)).toMatchObject({ type: 'png' });
  expect(readImageField(`data:image/png;base64,${PNG_BASE64}`)).toMatchObject({ type: 'png' });
  // the type a name or a browser gives does not count: the content does
  expect(readImageField(`data:image/png;base64,${Buffer.from('<html>hello</html>!').toString('base64')}`)).toEqual({ problem: 'not_image' });
  expect(readImageField('not base64 at all!')).toEqual({ problem: 'not_image' });
  expect(readImageField('')).toEqual({ problem: 'missing' });
  expect(readImageField(42)).toEqual({ problem: 'missing' });
  const big = Buffer.alloc(MAX_IMAGE_BYTES + 3);
  png.copy(big);
  expect(readImageField(big.toString('base64'))).toEqual({ problem: 'too_big' });
  const fits = Buffer.alloc(MAX_IMAGE_BYTES);
  png.copy(fits);
  expect(readImageField(fits.toString('base64'))).toMatchObject({ type: 'png' });
});

it('keeps pictures under random names in receipts\\ and qr\\, and reads or deletes only names of that shape', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'vip-files-'));
  dirs.push(dir);
  const files = new VipFiles(path.join(dir, 'uploads'));
  const name = await files.save('receipts', png, 'png');
  expect(isVipFileName(name)).toBe(true);
  expect(readdirSync(path.join(dir, 'uploads', 'receipts'))).toEqual([name]);
  expect(readdirSync(path.join(dir, 'uploads', 'qr'))).toEqual([]);
  expect(await files.read('receipts', name)).toEqual({ bytes: png, mime: 'image/png' });
  expect(await files.read('qr', name)).toBeUndefined();
  writeFileSync(path.join(dir, 'secret.txt'), 'web.config.json');
  for (const bad of ['../secret.txt', '..\\secret.txt', `${name}/../../secret.txt`, 'secret.txt', `${name.slice(0, -4)}.html`]) {
    expect(await files.read('receipts', bad)).toBeUndefined();
  }
  await files.remove('receipts', name);
  expect(readdirSync(path.join(dir, 'uploads', 'receipts'))).toEqual([]);
});

it('takes a vip section, and a bad one only turns Support / VIP off', () => {
  const base = { ...testConfig, admin: undefined };
  const json = (vip: unknown) => ({
    listen: base.listen, siteOrigin: base.siteOrigin, trustedProxies: base.trustedProxies, sql: base.sql, ticketSecret: base.ticketSecret,
    servers: base.servers, vip,
  });
  expect(parseWebConfig(json({ uploadsDir: 'C:\\flyff-web\\vip-uploads' })).vip).toEqual({ uploadsDir: 'C:\\flyff-web\\vip-uploads', maxPendingPerAccount: 3, deleteRejectedAfterDays: 30 });
  expect(parseWebConfig(json({ uploadsDir: 'x', maxPendingPerAccount: 5 })).vip?.maxPendingPerAccount).toBe(5);
  expect(parseWebConfig(json({ uploadsDir: 'x', deleteRejectedAfterDays: 0 })).vip?.deleteRejectedAfterDays).toBe(0);
  expect(parseWebConfig(json({ uploadsDir: 'x', deleteRejectedAfterDays: -1 })).vip).toBeUndefined();
  expect(parseWebConfig(json(undefined))).toMatchObject({ vip: undefined, vipProblem: undefined });
  expect(parseWebConfig(json({ uploadsDir: '' }))).toMatchObject({ vip: undefined, vipProblem: 'vip.uploadsDir must be a non-empty string' });
  expect(parseWebConfig(json({ uploadsDir: 'x', maxPending: 3 })).vipProblem).toBe('vip.maxPending is not a setting');
});

it('starts Support / VIP with a good section, and only warns (off) with a bad one or a folder it cannot make', async () => {
  const { startVip } = await import('../src/vip/startVip');
  const { MemoryVipStore, siteView } = await import('./support/memoryVipStore');
  const dir = mkdtempSync(path.join(os.tmpdir(), 'vip-start-'));
  dirs.push(dir);
  const lines: string[] = [];
  const log = { info: (line: string) => lines.push(line), warn: (line: string) => lines.push(line) };
  const store = new MemoryVipStore();
  const stores = { site: () => siteView(store), admin: () => store };
  const on = startVip({ ...testConfig, vip: { uploadsDir: path.join(dir, 'up'), maxPendingPerAccount: 3, deleteRejectedAfterDays: 30 }, vipProblem: undefined }, log, Date.now, stores);
  expect(on.routes).toBeDefined();
  expect(on.admin?.store).toBe(store);
  expect(readdirSync(path.join(dir, 'up')).sort()).toEqual(['qr', 'receipts']);
  expect(startVip({ ...testConfig, vip: undefined, vipProblem: 'vip.uploadsDir must be a non-empty string' }, log, Date.now, stores).routes).toBeUndefined();
  writeFileSync(path.join(dir, 'file'), 'x');
  expect(startVip({ ...testConfig, vip: { uploadsDir: path.join(dir, 'file', 'up'), maxPendingPerAccount: 3, deleteRejectedAfterDays: 30 }, vipProblem: undefined }, log, Date.now, stores).routes).toBeUndefined();
  expect(lines[0]).toMatch(/^vip: on, pictures in /);
  expect(lines[1]).toBe('vip: off: vip.uploadsDir must be a non-empty string');
  expect(lines[2]).toMatch(/^vip: off: cannot make /);
  await on.close();
});

it('deletes the receipt pictures of requests rejected over the set days ago, and keeps the others', async () => {
  const { forgetOldReceipts } = await import('../src/vip/startVip');
  const { MemoryVipStore } = await import('./support/memoryVipStore');
  const dir = mkdtempSync(path.join(os.tmpdir(), 'vip-forget-'));
  dirs.push(dir);
  let now = 1_763_000_000_000;
  const store = new MemoryVipStore([], () => now);
  const files = new VipFiles(dir);
  const lines: string[] = [];
  const log = { info: (line: string) => lines.push(line), warn: (line: string) => lines.push(line) };
  const add = async (reference: string) => {
    const receiptFile = await files.save('receipts', png, 'png');
    const added = await store.addRequest({ account: 'tester1', level: 1, currency: 'USD', reference, referenceKey: reference, receiptFile, address: '203.0.113.9', maxPending: 9 });
    if (!('id' in added)) throw new Error('not added');
    return { id: added.id, receiptFile };
  };
  const old = await add('OLD1');
  const kept = await add('KEPT1');
  const approved = await add('PAID1');
  await store.reject(old.id, 'admin', 'no payment');
  await store.approve(approved.id, 'admin');
  now += 10 * 86_400_000;
  await store.reject(kept.id, 'admin', 'no payment');
  now += 25 * 86_400_000;
  const vip = { uploadsDir: dir, maxPendingPerAccount: 3, deleteRejectedAfterDays: 30 };

  // rejected 35 days ago: gone; rejected 25 days ago and approved: kept
  expect(await forgetOldReceipts(vip, store, files, log)).toBe(1);
  expect(readdirSync(path.join(dir, 'receipts')).sort()).toEqual([kept.receiptFile, approved.receiptFile].sort());
  expect((await store.request(old.id))?.receiptFile).toBeNull();
  expect((await store.mine('tester1')).requests.find((r) => r.id === old.id)).toMatchObject({ status: 'R', hasReceipt: false });
  expect(lines).toEqual(['vip: deleted 1 receipt picture(s) of requests rejected over 30 days ago']);
  // a second sweep finds nothing; 0 days keeps them all
  expect(await forgetOldReceipts(vip, store, files, log)).toBe(0);
  now += 10 * 86_400_000;
  expect(await forgetOldReceipts({ ...vip, deleteRejectedAfterDays: 0 }, store, files, log)).toBe(0);
  expect(readdirSync(path.join(dir, 'receipts'))).toHaveLength(2);
  // a database that fails: one warning, nothing thrown
  const broken = Object.assign(Object.create(store) as typeof store, { forgetReceipts: async () => { throw new Error('down\nnow'); } });
  expect(await forgetOldReceipts(vip, broken, files, log)).toBe(0);
  expect(lines.at(-1)).toBe('vip: old receipts not deleted: down now');
});

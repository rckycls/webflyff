import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { SEND_ACTIONS } from '../src/admin/actions/sends';
import { loadItemCatalog, searchItems } from '../src/admin/itemCatalog';
import { MemoryAdminStore, memoryCharacter } from './support/memoryAdminStore';
import { testContext, testDeps } from './support/adminDeps';

const FIXTURE = fileURLToPath(new URL('./fixtures/assets', import.meta.url));
const catalog = loadItemCatalog(FIXTURE, () => {});

function setUp(gold = 1000) {
  let deps: ReturnType<typeof testDeps>;
  const store = new MemoryAdminStore({
    characters: [memoryCharacter('0000001', 'Hero', 'tester1', { gold }), memoryCharacter('0000002', 'Busy', 'tester1', { online: true })],
  }, () => deps.now());
  deps = testDeps({ store, catalog });
  return { deps, store, ctx: testContext(deps) };
}

const act = (name: keyof typeof SEND_ACTIONS, body: Record<string, unknown>, s: ReturnType<typeof setUp>) =>
  SEND_ACTIONS[name](body, s.ctx, s.deps);

it('loads the item list from the converted data, without nameless items', () => {
  expect(catalog.map((i) => i.id)).toEqual([21, 500, 2001, 5000]);
  expect(catalog.find((i) => i.id === 500)).toEqual({ id: 500, name: 'Vagrant Cap', packMax: 1, upgradable: true });
  expect(catalog.find((i) => i.id === 2001)!.upgradable).toBe(false);
  const warnings: string[] = [];
  expect(loadItemCatalog('C:/no/such/folder', (w) => warnings.push(w))).toEqual([]);
  expect(warnings).toHaveLength(1);
});

it('searches by id first, then by name in any case', () => {
  expect(searchItems(catalog, '500').map((i) => i.id)[0]).toBe(500);
  expect(searchItems(catalog, 'cap').map((i) => i.name)).toEqual(['Vagrant Cap', 'Captain Hat Scroll']);
  expect(searchItems(catalog, '')).toEqual([]);
});

it('sends an item within its stack and upgrade limits, marked as the panel\'s', async () => {
  const s = setUp();
  expect((await act('sends.item', { idPlayer: '0000001', itemId: 2001, count: 10000, upgrade: 0 }, s)).body.field).toBe('count');
  expect((await act('sends.item', { idPlayer: '0000001', itemId: 2001, count: 5, upgrade: 3 }, s)).body.field).toBe('upgrade');
  expect((await act('sends.item', { idPlayer: '0000001', itemId: 500, count: 1, upgrade: 11 }, s)).body.field).toBe('upgrade');
  expect((await act('sends.item', { idPlayer: '0000001', itemId: 999, count: 1, upgrade: 0 }, s)).body.field).toBe('itemId');
  const sent = await act('sends.item', { idPlayer: '0000001', itemId: 500, count: 1, upgrade: 7 }, s);
  expect(sent.status).toBe(200);
  const row = s.store.log.at(-1)!;
  expect(row).toMatchObject({ action: 'sends.item', characterName: 'Hero', result: 'ok' });
  expect(s.store.sends[0]).toMatchObject({ item: '500', count: 1, upgrade: 7, billingNo: `ADMIN${row.id}`, byPanel: true });
});

it('keeps a character\'s penya, with pending sends, within 2,000,000,000', async () => {
  const s = setUp(1_999_999_000);
  await s.store.sendItem('0000001', 'penya', 500, 0, 'ADMIN0');
  expect(await act('sends.penya', { idPlayer: '0000001', amount: 600 }, s)).toMatchObject({ status: 400, body: { field: 'amount' } });
  expect((await act('sends.penya', { idPlayer: '0000001', amount: 500 }, s)).status).toBe(200);
  expect(s.store.sends.at(-1)).toMatchObject({ item: 'penya', count: 500, upgrade: 0 });
  expect((await act('sends.penya', { idPlayer: '0000001', amount: 0 }, s)).body.field).toBe('amount');
});

it('sends while the servers run, to an online character too', async () => {
  const s = setUp();
  expect((await act('sends.item', { idPlayer: '0000002', itemId: 21, count: 1, upgrade: 0 }, s)).status).toBe(200);
});

it('cancels only the panel\'s own sends, and not while the character is in the game', async () => {
  const s = setUp();
  const game = await s.store.sendItem('0000001', '2001', 3, 0, 'GUILD');
  const panel = await s.store.sendItem('0000001', '2001', 3, 0, 'ADMIN9');
  const busy = await s.store.sendItem('0000002', '2001', 3, 0, 'ADMIN10');
  expect(await act('sends.cancel', { idPlayer: '0000001', no: game }, s)).toMatchObject({ status: 409, body: { error: 'refused' } });
  expect(await act('sends.cancel', { idPlayer: '0000002', no: busy }, s)).toMatchObject({ status: 409, body: { error: 'refused' } });
  expect((await act('sends.cancel', { idPlayer: '0000001', no: panel }, s)).status).toBe(200);
  expect(s.store.sends.map((x) => x.no)).toEqual([game, busy]);
  expect((await act('sends.cancel', { idPlayer: '0000001', no: 12345 }, s)).status).toBe(404);
  const list = await act('sends.list', { idPlayer: '0000001' }, s);
  expect(list.body.rows).toMatchObject([{ no: game, byPanel: false }]);
});

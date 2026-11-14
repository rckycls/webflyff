import { expect, it } from 'vitest';
import { CHARACTER_ACTIONS } from '../src/admin/actions/characters';
import { dayText, MemoryAdminStore, memoryAccount, memoryCharacter } from './support/memoryAdminStore';
import { allPorts, testContext, testDeps } from './support/adminDeps';

/** Database and World stopped: character edits open. */
function stopped(): Set<number> {
  const open = allPorts();
  for (const port of [7000, 24000, 7200, 3101]) open.delete(port);
  return open;
}

function setUp(serversRunning: boolean) {
  let deps: ReturnType<typeof testDeps>;
  const store = new MemoryAdminStore({
    accounts: [memoryAccount('tester1')],
    characters: [
      memoryCharacter('0000001', 'Hero', 'tester1', { slot: 0 }),
      memoryCharacter('0000002', 'Guildy', 'tester1', { slot: 1, inGuild: true }),
      memoryCharacter('0000003', 'Gone', 'tester1', { slot: 2, deleted: true }),
      memoryCharacter('0000004', 'Taker', 'tester1', { slot: 2 }),
    ],
  }, () => deps.now());
  deps = testDeps({ store, openPorts: serversRunning ? allPorts() : stopped() });
  store.characters[2]!.deletedAt = `${dayText(deps.now(), -1)}1200`;
  return { deps, store, ctx: testContext(deps) };
}

const act = (name: keyof typeof CHARACTER_ACTIONS, body: Record<string, unknown>, s: ReturnType<typeof setUp>) =>
  CHARACTER_ACTIONS[name](body, s.ctx, s.deps);

it('refuses edits while the servers run, and logs the refusal', async () => {
  const s = setUp(true);
  const reply = await act('characters.rename', { idPlayer: '0000001', name: 'NewHero' }, s);
  expect(reply).toMatchObject({ status: 423, body: { error: 'locked', message: 'Database up, World up' } });
  expect(s.store.calls).not.toContain('renameCharacter');
  expect(s.store.log.at(-1)).toMatchObject({ action: 'characters.rename', characterName: 'Hero', account: 'tester1', result: 'refused' });
});

it('renames with the game\'s name rules while the servers are stopped', async () => {
  const s = setUp(false);
  expect(await act('characters.rename', { idPlayer: '0000001', name: '1abc' }, s))
    .toMatchObject({ status: 400, body: { field: 'name', message: 'The name cannot start with a number.' } });
  expect(await act('characters.rename', { idPlayer: '0000001', name: 'guildy' }, s)).toMatchObject({ status: 409, body: { error: 'taken' } });
  expect((await act('characters.rename', { idPlayer: '0000001', name: ' NewHero ' }, s)).status).toBe(200);
  expect(s.store.characters[0]!.name).toBe('NewHero');
  expect(s.store.log.at(-1)).toMatchObject({ result: 'ok', before: '{"name":"Hero"}', after: '{"name":"NewHero"}' });
});

it('sets penya from 0 to 2,000,000,000', async () => {
  const s = setUp(false);
  expect((await act('characters.gold', { idPlayer: '0000001', gold: 2_000_000_001 }, s)).body.field).toBe('gold');
  expect((await act('characters.gold', { idPlayer: '0000001', gold: -1 }, s)).body.field).toBe('gold');
  expect((await act('characters.gold', { idPlayer: '0000001', gold: 2_000_000_000 }, s)).status).toBe(200);
  expect(s.store.characters[0]!.gold).toBe(2_000_000_000);
});

it('moves a character to the game\'s Flarine spot', async () => {
  const s = setUp(false);
  s.store.characters[0]!.worldId = 202;
  expect((await act('characters.move', { idPlayer: '0000001' }, s)).status).toBe(200);
  expect(s.store.characters[0]).toMatchObject({ worldId: 1, x: 6971.984, y: 100, z: 3336.884 });
});

it('deletes the game\'s way, refusing a guild member', async () => {
  const s = setUp(false);
  expect(await act('characters.delete', { idPlayer: '0000002' }, s)).toMatchObject({ status: 409, body: { error: 'refused' } });
  expect((await act('characters.delete', { idPlayer: '0000001' }, s)).status).toBe(200);
  expect(s.store.characters[0]!.deleted).toBe(true);
});

it('undoes a delete only while its slot is free', async () => {
  const s = setUp(false);
  expect(await act('characters.undelete', { idPlayer: '0000003' }, s)).toMatchObject({ status: 409, body: { error: 'refused' } });
  s.store.characters[3]!.deleted = true;
  s.store.characters[3]!.deletedAt = `${dayText(s.deps.now(), -30)}1200`;
  expect((await act('characters.undelete', { idPlayer: '0000003' }, s)).status).toBe(200);
  expect(s.store.characters[2]!.deleted).toBe(false);
  expect((await act('characters.undelete', { idPlayer: '0000004' }, s)).body.message).toMatch(/7 days/);
});

it('answers 404 for an unknown character, and 400 for a bad id', async () => {
  const s = setUp(false);
  expect((await act('characters.get', { idPlayer: '0009999' }, s)).status).toBe(404);
  expect((await act('characters.rename', { idPlayer: '0009999', name: 'Okname' }, s)).status).toBe(404);
  expect((await act('characters.rename', { idPlayer: "1' OR 1=1", name: 'Okname' }, s)).body.field).toBe('idPlayer');
  expect(s.store.log.filter((r) => r.result === 'ok')).toHaveLength(0);
});

it('finds characters by name prefix or account, and shows one with its pending sends', async () => {
  const s = setUp(true);
  const found = await act('characters.search', { name: 'he' }, s);
  expect((found.body.rows as { name: string }[]).map((c) => c.name)).toEqual(['Hero']);
  expect(((await act('characters.search', { account: 'TESTER1' }, s)).body.rows as unknown[]).length).toBe(4);
  expect((await act('characters.search', {}, s)).status).toBe(400);
  await s.store.sendItem('0000001', '500', 1, 0, 'ADMIN1');
  const one = await act('characters.get', { idPlayer: '0000001' }, s);
  expect(one.body).toMatchObject({ character: { name: 'Hero', gold: 1000 }, pending: [{ item: '500', byPanel: true }] });
});

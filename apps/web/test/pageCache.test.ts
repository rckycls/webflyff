import { expect, it } from 'vitest';
import type { AccountRow, CharacterRow } from '../src/admin/adminStore';
import { PageCache } from '../src/admin/pageCache';

const account = (name: string): AccountRow => ({ account: name, email: null, authority: 'F', blockTime: null, created: '' });
const character = (idPlayer: string, owner: string): CharacterRow => ({
  idPlayer, name: `C${idPlayer}`, account: owner, level: 1, job: 0, slot: 0, deleted: false, online: false, worldId: 1, authority: 'F',
});

it('keeps a page 30 seconds, by its filter without case', () => {
  let now = 1_000;
  const cache = new PageCache(() => now);
  const kept = cache.set('accounts', { account: 'Tes' }, 1, { rows: [account('tester1')], total: 1 });
  expect(kept.loadedAt).toBe(new Date(1_000).toISOString());
  expect(cache.get('accounts', { account: 'tes', email: undefined }, 1)).toBe(kept);
  expect(cache.get('accounts', { account: 'tes' }, 2)).toBeUndefined();
  expect(cache.get('characters', { account: 'tes' }, 1)).toBeUndefined();
  now += 30_001;
  expect(cache.get('accounts', { account: 'tes' }, 1)).toBeUndefined();
});

it('drops only what an edit changed', () => {
  const cache = new PageCache(() => 0);
  cache.set('accounts', {}, 1, { rows: [account('Alpha'), account('beta')], total: 3 });
  cache.set('accounts', {}, 2, { rows: [account('gamma')], total: 3 });
  cache.set('accounts', { email: 'x@example.com' }, 1, { rows: [], total: 0 });
  cache.set('accounts', { characterName: 'he' }, 1, { rows: [account('gamma')], total: 1 });
  cache.set('characters', {}, 1, { rows: [character('0000001', 'Alpha'), character('0000002', 'gamma')], total: 3 });
  cache.set('characters', {}, 2, { rows: [character('0000003', 'beta')], total: 3 });

  cache.drop({ accounts: { names: ['BETA'] } });
  expect(cache.get('accounts', {}, 1)).toBeUndefined();
  expect(cache.get('accounts', {}, 2)).toBeDefined();
  expect(cache.size).toBe(5);

  cache.drop({ accounts: { byEmail: true } });
  expect(cache.get('accounts', { email: 'x@example.com' }, 1)).toBeUndefined();
  expect(cache.get('accounts', { characterName: 'he' }, 1)).toBeDefined();

  cache.drop({ characters: { accounts: ['alpha'] } });
  expect(cache.get('characters', {}, 1)).toBeUndefined();
  expect(cache.get('characters', {}, 2)).toBeDefined();
  cache.drop({ characters: { ids: ['0000003'] } });
  expect(cache.get('characters', {}, 2)).toBeUndefined();

  cache.drop({ accounts: { byCharacterName: true } });
  expect(cache.get('accounts', { characterName: 'he' }, 1)).toBeUndefined();
  expect(cache.get('accounts', {}, 2)).toBeDefined();
  cache.clear('accounts');
  expect(cache.size).toBe(0);
});

it('keeps at most 300 pages, dropping the oldest', () => {
  const cache = new PageCache(() => 0);
  for (let page = 1; page <= 301; page++) cache.set('accounts', {}, page, { rows: [], total: 0 });
  expect(cache.size).toBe(300);
  expect(cache.get('accounts', {}, 1)).toBeUndefined();
  expect(cache.get('accounts', {}, 301)).toBeDefined();
});

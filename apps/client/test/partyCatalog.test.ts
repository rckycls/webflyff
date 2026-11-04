// The party catalog's loader (Piece 7 M4): optional, as the quests' is.

import { describe, expect, it } from 'vitest';
import { loadParty } from '../src/world/party/partyCatalog';

const PARTY = { skills: [], exp: [{ exp: 0, point: 0 }], invalidNames: [], letters: 'A' };

describe('loadParty', () => {
  it('gives null and says nothing without the catalog; the catalog with it; null and the error when it fails', async () => {
    const errors: Error[] = [];
    const report = (error: Error) => errors.push(error);
    expect(await loadParty({ url: () => null, json: async () => PARTY as never }, report)).toBeNull();
    expect(await loadParty({ url: () => 'data/party.json', json: async () => PARTY as never }, report)).toEqual(PARTY);
    expect(await loadParty({ url: () => 'data/party.json', json: async () => { throw new Error('404'); } }, report)).toBeNull();
    expect(errors.map((e) => e.message)).toEqual(['404']);
  });
});

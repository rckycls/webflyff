import { describe, expect, it } from 'vitest';
import { LoadingPictures, loadingPicture } from '../src/world/loading/loadingPicture';
import { loadFraction, serverShare } from '../src/world/loading/loadProgress';
import type { LoadParts } from '../src/world/loading/loadProgress';

describe('loadingPicture (CDPClient::OnReplace, DPClient.cpp:2274-2302)', () => {
  it('gives the Guild Siege worlds, the instance dungeons and the guild houses their own pictures', () => {
    for (const id of [202, 241, 242, 243, 244]) expect(loadingPicture(id)).toBe('MapLoading_GuildWar.tga');
    expect(loadingPicture(121)).toBe('MapLoading_Ominous.tga');
    expect(loadingPicture(122)).toBe('MapLoading_Ominous_1.tga');
    expect(loadingPicture(123)).toBe('MapLoading_DreadfulCave.tga');
    for (const id of [212, 213, 214]) expect(loadingPicture(id)).toBe('MapLoading_Guildhouse.tga');
  });

  it('picks one of MapLoading2 to 4 for every other world (xRandom( 0, 3 ))', () => {
    expect(loadingPicture(1, () => 0)).toBe('MapLoading2.tga');
    expect(loadingPicture(1, () => 0.5)).toBe('MapLoading3.tga');
    expect(loadingPicture(1, () => 0.999)).toBe('MapLoading4.tga');
    expect(loadingPicture(209, () => 0)).toBe('MapLoading2.tga'); // a room is not a guild house
  });
});

describe('LoadingPictures', () => {
  it('shows the picture it picked ahead, and picks a new one after', () => {
    const rolls = [0, 0.5, 0.999];
    const pictures = new LoadingPictures(() => rolls.shift() ?? 0);
    expect(pictures.peek(1)).toBe('MapLoading2.tga');
    expect(pictures.peek(1)).toBe('MapLoading2.tga');
    expect(pictures.take(1)).toBe('MapLoading2.tga');
    expect(pictures.take(1)).toBe('MapLoading3.tga');
  });

  it('keeps the random pick for later when a world has its own picture', () => {
    const pictures = new LoadingPictures(() => 0.5);
    expect(pictures.peek(1)).toBe('MapLoading3.tga');
    expect(pictures.take(202)).toBe('MapLoading_GuildWar.tga');
    expect(pictures.take(1)).toBe('MapLoading3.tga');
  });
});

const NOTHING: LoadParts = { server: 0, files: false, map: null, models: null, windows: false, drawn: false };
const ALL_BUT_DRAWN: LoadParts = {
  server: 1, files: true, map: { done: 9, total: 9 }, models: { done: 3, total: 3 }, windows: true, drawn: false,
};

describe('loadFraction', () => {
  it('is 0 before anything is in, 0.99 at most until the world is drawn, and 1 once it is', () => {
    expect(loadFraction(NOTHING)).toBe(0);
    expect(loadFraction(ALL_BUT_DRAWN)).toBe(0.99);
    expect(loadFraction({ ...NOTHING, drawn: true })).toBe(1);
  });

  it('weighs server 20, game files 10, map 45, models 20, window pictures 5', () => {
    expect(loadFraction({ ...NOTHING, server: 1 })).toBeCloseTo(0.2);
    expect(loadFraction({ ...NOTHING, files: true })).toBeCloseTo(0.1);
    expect(loadFraction({ ...NOTHING, windows: true })).toBeCloseTo(0.05);
    // the manifest is a tenth of the map, the tiles the rest
    expect(loadFraction({ ...NOTHING, map: { done: 0, total: 0 } })).toBeCloseTo(0.045);
    expect(loadFraction({ ...NOTHING, map: { done: 4, total: 9 } })).toBeCloseTo(0.45 * (0.1 + 0.9 * 4 / 9));
    // no views yet: nothing; views with nothing to load: all of it
    expect(loadFraction({ ...NOTHING, models: { done: 0, total: 0 } })).toBeCloseTo(0.2);
    expect(loadFraction({ ...NOTHING, models: { done: 1, total: 4 } })).toBeCloseTo(0.05);
  });
});

describe('serverShare (WorldSession phases)', () => {
  it('grows with the entry: opening, pausing, PRE_JOIN, JOIN, playing; a REPLACE is half way', () => {
    expect(['opening', 'pausing', 'preJoin', 'join', 'playing'].map(serverShare)).toEqual([0, 0.15, 0.35, 0.65, 1]);
    expect(serverShare('transition')).toBe(0.5);
    expect(serverShare('over')).toBe(0);
  });
});

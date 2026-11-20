// 2026-11-17 (view-equip-options): the Option window's other game options (options/gameOptions.ts).

import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_OPTIONS, combatMusicOf, gameOptionCommand, loadGameOptions, saveGameOptions } from '../src/world/options/gameOptions';

const memory = (): Pick<Storage, 'getItem' | 'setItem'> & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
};

describe('the game options (HwOption.cpp)', () => {
  it('start as CHwOption::Init sets them: trade, party and the auto-attack on; translucency and battle music off', () => {
    expect(DEFAULT_GAME_OPTIONS).toEqual({
      trade: true, party: true, autoAttack: true, translucent: false, battleMusic: false, cameraLock: true, zoomLimit: true,
      invertCameraUp: false, invertCameraTurn: false,
    });
    expect(loadGameOptions(null)).toEqual(DEFAULT_GAME_OPTIONS);
  });

  it('2026-11-20 (phone-camera-invert): the camera inverts are kept per browser; options kept before them read as off', () => {
    const storage = memory();
    saveGameOptions(storage, { ...DEFAULT_GAME_OPTIONS, invertCameraUp: true });
    expect(JSON.parse(storage.data.get('flyffweb.gameOptions')!)).toMatchObject({ invertCameraUp: true, invertCameraTurn: false });
    expect(loadGameOptions(storage)).toEqual({ ...DEFAULT_GAME_OPTIONS, invertCameraUp: true });
    // a browser that kept its options before this change
    storage.setItem('flyffweb.gameOptions', '{"trade":false,"party":true,"autoAttack":true,"translucent":false,"battleMusic":false}');
    expect(loadGameOptions(storage)).toEqual({ ...DEFAULT_GAME_OPTIONS, trade: false });
    storage.setItem('flyffweb.gameOptions', '{"invertCameraTurn":true,"invertCameraUp":"yes"}');
    expect(loadGameOptions(storage)).toEqual({ ...DEFAULT_GAME_OPTIONS, invertCameraTurn: true });
  });

  it('are kept and read back; a broken or partial value falls back per option', () => {
    const storage = memory();
    saveGameOptions(storage, { ...DEFAULT_GAME_OPTIONS, trade: false, battleMusic: true });
    expect(loadGameOptions(storage)).toEqual({ ...DEFAULT_GAME_OPTIONS, trade: false, battleMusic: true });
    storage.setItem('flyffweb.gameOptions', '{"party":false,"autoAttack":"no"}');
    expect(loadGameOptions(storage)).toEqual({ ...DEFAULT_GAME_OPTIONS, party: false });
    storage.setItem('flyffweb.gameOptions', 'not json');
    expect(loadGameOptions(storage)).toEqual(DEFAULT_GAME_OPTIONS);
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(loadGameOptions(throwing)).toEqual(DEFAULT_GAME_OPTIONS);
    expect(() => saveGameOptions(throwing, DEFAULT_GAME_OPTIONS)).not.toThrow();
  });

  it('/ta /tr /ga /gr set trade and party (FuncTextCmd.cpp:3764-3811)', () => {
    expect(gameOptionCommand('tradeagree')).toEqual({ option: 'trade', on: true, tid: 'TID_GAME_TRADEAGREE' });
    expect(gameOptionCommand('traderefuse')).toEqual({ option: 'trade', on: false, tid: 'TID_GAME_TRADEREFUSE' });
    expect(gameOptionCommand('stageagree')).toEqual({ option: 'party', on: true, tid: 'TID_GAME_STAGEAGREE' });
    expect(gameOptionCommand('stagerefuse')).toEqual({ option: 'party', on: false, tid: 'TID_GAME_STAGEREFUSE' });
    expect(gameOptionCommand('whisperagree')).toBeNull();
  });

  it('the battle track of PlayCombatMusic (MoverMove.cpp:31-61): by x, Saint Morning\'s rect, none indoors, in 202 or the dungeons', () => {
    expect(combatMusicOf(false, 1, false, 6968, 3328)).toBeNull();
    expect(combatMusicOf(true, 1, false, 4000, 3000)).toBe(51); // BGM_BA_DARKON
    expect(combatMusicOf(true, 1, false, 5000, 3000)).toBe(16); // BGM_BA_CRISIS
    expect(combatMusicOf(true, 1, false, 6968, 3328)).toBe(15); // BGM_BA_FLARIS
    expect(combatMusicOf(true, 1, false, 7600, 2000)).toBe(50); // Saint Morning's rect
    expect(combatMusicOf(true, 1, false, 9000, 5000)).toBe(50); // past 8138
    expect(combatMusicOf(true, 1, true, 6968, 3328)).toBeNull();
    expect(combatMusicOf(true, 202, false, 6968, 3328)).toBeNull();
    expect(combatMusicOf(true, 220, false, 6968, 3328)).toBeNull();
  });
});

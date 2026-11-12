import { describe, expect, it } from 'vitest';
import type { CharacterSummary } from '@flyffweb/protocol';
import { Sex } from '../src/lobby/appearance';
import {
  DELETE_PASSWORD_REFUSED, NAME_NOT_ALLOWED, VAGRANT_START_EQUIPMENT, nameNotAllowed, openingLook, pinDigits, stepChoice,
  validateDeletePassword,
} from '../src/lobby/createRules';
import {
  LobbyMti, MotionClock, createMotion, getUpMotion, nextSelectMotion, openingSelectMotion, ticksIn,
} from '../src/lobby/lobbyMotion';
import { Block, characterTip, isBlocked, selectButtons, settleSelection, stepSelection } from '../src/lobby/selectRules';

const character = (slot: number, change: Partial<CharacterSummary> = {}): CharacterSummary => ({
  slot, blocked: Block.USABLE, worldId: 1, index: 11, name: `Char${slot}`, position: [0, 0, 0], playerId: 500 + slot,
  partyId: 0, guildId: 0, warId: 0, skinSet: 0, hairMesh: 0, hairColor: 0, headMesh: 0, sex: Sex.MALE, job: 0, level: 15,
  jobLevel: 0, str: 15, sta: 16, dex: 17, int: 18, mode: 0, equipment: [], ...change,
});

describe('the Select Character window (CWndSelectChar)', () => {
  it('keeps the selection between visits, and moves a blocked one to the first usable character', () => {
    expect(settleSelection(2, [character(0), character(2)])).toBe(2);
    expect(settleSelection(1, [character(0)])).toBe(1); // an empty slot stays selected
    expect(settleSelection(0, [character(0, { blocked: Block.BLOCKED }), character(1, { blocked: Block.BLOCKED }), character(2)])).toBe(2);
    // no usable character: the selection stays
    expect(settleSelection(0, [character(0, { blocked: Block.BLOCKED })])).toBe(0);
    expect(settleSelection(7, [])).toBe(0);
  });

  it('wraps Left and Right round the three slots', () => {
    expect(stepSelection(0, -1)).toBe(2);
    expect(stepSelection(2, 1)).toBe(0);
    expect(stepSelection(1, 1)).toBe(2);
  });

  it('enables Delete and Accept on a character, Create on an empty slot', () => {
    expect(selectButtons(character(0))).toEqual({ create: false, delete: true, accept: true });
    expect(selectButtons(undefined)).toEqual({ create: true, delete: false, accept: false });
  });

  it('reads the block flag as Neuz does: 0 is blocked', () => {
    expect(isBlocked(character(0, { blocked: 0 }))).toBe(true);
    expect(isBlocked(character(0, { blocked: 1 }))).toBe(false);
  });

  it('writes the tooltip as PutToolTip_Character does', () => {
    expect(characterTip(character(0, { name: 'Webby', sex: Sex.FEMALE, level: 60 }), 'Assist').map((l) => l.text)).toEqual([
      'Webby', 'SEX: Female', 'Level : 60', 'Strength : 15', 'Stamina : 16', 'Dexterity : 17', 'Intelligence : 18', 'Job : Assist',
    ]);
    expect(characterTip(character(0), '')[0]).toEqual({ text: 'Char0', color: '#0000ff', bold: true });
    // master and hero jobs mark the level
    expect(characterTip(character(0, { job: 16, level: 70 }), 'Knight')[2]!.text).toBe('Level : 70-M');
    expect(characterTip(character(0, { job: 31, level: 125 }), 'Elementor')[2]!.text).toBe('Level : 125-H');
    // a blocked character: the name in red, then "Connet Cut" as Neuz spells it
    const blocked = characterTip(character(0, { blocked: 0 }), '');
    expect(blocked.slice(0, 2)).toEqual([
      { text: 'Char0', color: '#ff0000', bold: true }, { text: 'Connet Cut', color: '#ff0000', bold: true },
    ]);
  });
});

describe('the New Character window (CWndCreateChar)', () => {
  it('opens on a woman with a random hair style and face, 0 to 4', () => {
    expect(openingLook(() => 0)).toEqual({ sex: Sex.FEMALE, hairMesh: 0, headMesh: 0 });
    expect(openingLook(() => 0.999999)).toEqual({ sex: Sex.FEMALE, hairMesh: 4, headMesh: 4 });
    const draws = [0.25, 0.65];
    expect(openingLook(() => draws.shift()!)).toEqual({ sex: Sex.FEMALE, hairMesh: 1, headMesh: 3 });
  });

  it('wraps the arrows', () => {
    expect(stepChoice(0, -1, 5)).toBe(4);
    expect(stepChoice(4, 1, 5)).toBe(0);
    expect(stepChoice(2, 1, 5)).toBe(3);
  });

  it('dresses the preview in the Vagrant start equipment of jobItem.inc', () => {
    expect(VAGRANT_START_EQUIPMENT[Sex.MALE]).toEqual([502, 506, 510, 21]);
    expect(VAGRANT_START_EQUIPMENT[Sex.FEMALE]).toEqual([504, 508, 512, 21]);
  });

  it('refuses a name holding a banned word, or a letter outside Letter_ENG.inc', () => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    expect(nameNotAllowed('Webby', ['gm', 'flyff'], letters)).toBeUndefined();
    expect(nameNotAllowed('TheGMx', ['gm'], letters)).toBe(NAME_NOT_ALLOWED);
    expect(nameNotAllowed('  myFLYFFhero ', ['flyff'], letters)).toBe(NAME_NOT_ALLOWED);
    expect(nameNotAllowed('Webby', [], 'Web')).toBe(NAME_NOT_ALLOWED);
    // no letters loaded: every letter is allowed (`if( !ptr->size() )`)
    expect(nameNotAllowed('Webby', [], '')).toBeUndefined();
  });

  it('keeps digits only in a Bank PIN edit, 4 at most', () => {
    expect(pinDigits('12a3-45')).toBe('1234');
    expect(pinDigits('')).toBe('');
  });

  it('plays MTI_STAND for a man and MTI_STAND2 for a woman', () => {
    expect(createMotion(Sex.MALE)).toBe(LobbyMti.STAND);
    expect(createMotion(Sex.FEMALE)).toBe(LobbyMti.STAND2);
  });
});

describe('the Delete Character window (CWndDeleteChar, LANG_ENG)', () => {
  it('takes any password of 1 to 63 characters', () => {
    expect(validateDeletePassword('a')).toBeUndefined();
    expect(validateDeletePassword('my pass 1234')).toBeUndefined();
    expect(validateDeletePassword('x'.repeat(63))).toBeUndefined();
    expect(validateDeletePassword('')).toBe(DELETE_PASSWORD_REFUSED);
    expect(validateDeletePassword('x'.repeat(64))).toBe(DELETE_PASSWORD_REFUSED);
    // the packets carry ASCII only
    expect(validateDeletePassword('pässwort')).toBe(DELETE_PASSWORD_REFUSED);
    expect(DELETE_PASSWORD_REFUSED).toBe('Please Re-enter SSN.');
  });
});

describe('the lobby characters\' motions (CWndSelectChar::Process)', () => {
  it('opens with the selected character standing and the others sitting, looping', () => {
    expect(openingSelectMotion(true)).toEqual({ id: LobbyMti.STAND, loop: true, ended: false });
    expect(openingSelectMotion(false)).toEqual({ id: LobbyMti.SITSTAND, loop: true, ended: false });
    expect(getUpMotion()).toEqual({ id: LobbyMti.GETUP, loop: false, ended: false });
  });

  it('stands a selected character once it has got up', () => {
    expect(nextSelectMotion(true, { id: LobbyMti.GETUP, loop: false, ended: false })).toBeNull();
    expect(nextSelectMotion(true, { id: LobbyMti.GETUP, loop: false, ended: true })).toEqual({ id: LobbyMti.STAND, loop: true });
    expect(nextSelectMotion(true, { id: LobbyMti.STAND, loop: true, ended: false })).toBeNull();
  });

  it('sits the others down: once, then the sitting loop', () => {
    expect(nextSelectMotion(false, { id: LobbyMti.STAND, loop: true, ended: false })).toEqual({ id: LobbyMti.SIT, loop: false });
    expect(nextSelectMotion(false, { id: LobbyMti.SIT, loop: false, ended: false })).toBeNull();
    expect(nextSelectMotion(false, { id: LobbyMti.SIT, loop: false, ended: true })).toEqual({ id: LobbyMti.SITSTAND, loop: true });
    expect(nextSelectMotion(false, { id: LobbyMti.SITSTAND, loop: true, ended: false })).toBeNull();
    // one that was getting up when it lost the selection: straight to the loop when its motion had ended, else sits
    expect(nextSelectMotion(false, { id: LobbyMti.GETUP, loop: false, ended: true })).toEqual({ id: LobbyMti.SITSTAND, loop: true });
    expect(nextSelectMotion(false, { id: LobbyMti.GETUP, loop: false, ended: false })).toEqual({ id: LobbyMti.SIT, loop: false });
  });

  it('moves a motion on by its per-tick step, holding a played-once one at its end', () => {
    const once = new MotionClock(4, 1, false);
    once.tick();
    once.tick();
    expect(once.frame).toBe(2);
    expect(once.ended).toBe(false);
    once.tick();
    expect(once.frame).toBe(3);
    expect(once.ended).toBe(true);
    once.tick();
    expect(once.frame).toBe(3);

    const loop = new MotionClock(4, 1.5, true);
    for (let i = 0; i < 3; i++) loop.tick();
    expect(loop.frame).toBeCloseTo(0.5); // 4.5 wraps to 0.5
    expect(loop.ended).toBe(false);
  });

  it('ticks 60 times a second, never more than 6 at once', () => {
    expect(ticksIn(1000 / 60, 0).ticks).toBe(1);
    expect(ticksIn(10, 0)).toEqual({ ticks: 0, carry: 10 });
    expect(ticksIn(10, 10).ticks).toBe(1);
    expect(ticksIn(5000, 0)).toEqual({ ticks: 6, carry: 0 });
  });
});

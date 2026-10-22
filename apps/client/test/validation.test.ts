import { describe, expect, it } from 'vitest';
import type { NewCharacter } from '@flyffweb/protocol';
import { HAIR_MESH_COUNT, HEAD_MESH_COUNT, JOB_VAGRANT, Sex, hairColorFor } from '../src/lobby/appearance';
import { isCharacterSlot, isValidAppearance, validateBankPin, validateCharacterName } from '../src/lobby/validation';

describe('validateCharacterName', () => {
  it('accepts letters and digits, 4 to 16 of them, not starting with a digit', () => {
    expect(validateCharacterName('Webby')).toBeUndefined();
    expect(validateCharacterName('abcd')).toBeUndefined();
    expect(validateCharacterName('a'.repeat(16))).toBeUndefined();
    expect(validateCharacterName('a123')).toBeUndefined();
  });

  it('judges the trimmed name', () => {
    expect(validateCharacterName('  Webby ')).toBeUndefined();
    expect(validateCharacterName('')).toBe('Enter name.');
    expect(validateCharacterName('   ')).toBe('Enter name.');
  });

  it('refuses a length outside 4 to 16', () => {
    const message = 'Character Name must be 4 to 16 characters long.';
    expect(validateCharacterName('abc')).toBe(message);
    expect(validateCharacterName('a'.repeat(17))).toBe(message);
    expect(validateCharacterName(' abc ')).toBe(message);
  });

  it('refuses a first digit', () => {
    expect(validateCharacterName('1abc')).toBe('The name cannot start with a number.');
  });

  it('refuses spaces, special characters and letters outside A-Z', () => {
    const message = 'You cannot use special characters or spaces in a name.';
    expect(validateCharacterName('we by')).toBe(message);
    expect(validateCharacterName('wébé')).toBe(message);
    expect(validateCharacterName('web_y')).toBe(message);
    expect(validateCharacterName('web٠y')).toBe(message); // an Arabic-Indic digit is not 0-9
  });

  it('checks the length before the first digit, and the first digit before the characters', () => {
    expect(validateCharacterName('1' + 'a'.repeat(16))).toBe('Character Name must be 4 to 16 characters long.');
    expect(validateCharacterName('1a b')).toBe('The name cannot start with a number.');
  });
});

describe('validateBankPin', () => {
  it('accepts 4 digits that are not 0000, confirmed', () => {
    expect(validateBankPin('1234', '1234')).toBeUndefined();
    expect(validateBankPin('0001', '0001')).toBeUndefined();
  });

  it('checks in order: empty, 4 digits, 0000, empty confirm, mismatch', () => {
    expect(validateBankPin('', '')).toBe('Enter the Bank PIN to continue.');
    expect(validateBankPin('12a4', '12a4')).toBe('The Bank PIN should be a 4 digit number.');
    expect(validateBankPin('123', '123')).toBe('The Bank PIN should be a 4 digit number.');
    expect(validateBankPin('12345', '12345')).toBe('The Bank PIN should be a 4 digit number.');
    expect(validateBankPin('1234\n', '1234\n')).toBe('The Bank PIN should be a 4 digit number.');
    expect(validateBankPin('0000', '')).toBe('Invalid Bank PIN.');
    expect(validateBankPin('1234', '')).toBe('Confirm Bank PIN.');
    expect(validateBankPin('1234', '1235')).toBe('Bank PINs do not match.');
  });
});

describe('hairColorFor', () => {
  it('builds an opaque colour from the male and female tables of MoverEquip.cpp', () => {
    expect(hairColorFor(Sex.MALE, 0)).toBe(0xff906365);
    expect(hairColorFor(Sex.FEMALE, 4)).toBe(0xffd58264);
    expect(hairColorFor(Sex.MALE, 4)).toBe(0xff647b75);
    expect(hairColorFor(Sex.FEMALE, 0)).toBe(0xfffafa5a);
  });

  it('is an unsigned number for every choice', () => {
    for (const sex of [Sex.MALE, Sex.FEMALE]) {
      for (let mesh = 0; mesh < HAIR_MESH_COUNT; mesh++) {
        const colour = hairColorFor(sex, mesh);
        expect(colour).toBeGreaterThan(0xff000000);
        expect(colour).toBeLessThanOrEqual(0xffffffff);
      }
    }
  });

  it('refuses a choice the create screen does not offer', () => {
    expect(() => hairColorFor(2, 0)).toThrow(RangeError);
    expect(() => hairColorFor(0, HAIR_MESH_COUNT)).toThrow(RangeError);
    expect(() => hairColorFor(0, -1)).toThrow(RangeError);
    expect(() => hairColorFor(0, 1.5)).toThrow(RangeError);
  });

  it('has the create screen\'s counts', () => {
    expect([HAIR_MESH_COUNT, HEAD_MESH_COUNT, JOB_VAGRANT]).toEqual([5, 5, 0]);
  });
});

describe('what fits a new character', () => {
  const ok: NewCharacter = {
    slot: 0, name: 'Webby', face: 0, costume: 0, skinSet: 0, hairMesh: 0, hairColor: 0xff906365, sex: 0, job: 0, headMesh: 0, bankPin: 1234,
  };

  it('accepts slots 0 to 2 only', () => {
    expect([0, 1, 2].every(isCharacterSlot)).toBe(true);
    for (const slot of [-1, 3, 1.5, NaN, Infinity]) expect(isCharacterSlot(slot), `slot ${slot}`).toBe(false);
  });

  it('accepts the choices of the create screen', () => {
    expect(isValidAppearance(ok)).toBe(true);
    expect(isValidAppearance({ ...ok, sex: 1, hairMesh: HAIR_MESH_COUNT - 1, headMesh: HEAD_MESH_COUNT - 1, hairColor: 0xffffffff })).toBe(true);
  });

  it('refuses a field outside its wire size or its choices', () => {
    const bad: Partial<NewCharacter>[] = [
      { face: 256 }, { face: -1 }, { costume: 256 }, { skinSet: 1.5 }, { hairMesh: HAIR_MESH_COUNT }, { headMesh: HEAD_MESH_COUNT },
      { sex: 2 }, { job: 1 }, { hairColor: -1 }, { hairColor: 0x1_0000_0000 }, { hairColor: NaN },
    ];
    for (const change of bad) expect(isValidAppearance({ ...ok, ...change }), JSON.stringify(change)).toBe(false);
  });
});

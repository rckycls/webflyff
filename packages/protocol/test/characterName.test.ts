import { expect, it } from 'vitest';
import { validateCharacterName } from '../src';

it('asks for a name when there is none', () => {
  expect(validateCharacterName('')).toBe('Enter name.');
  expect(validateCharacterName('   ')).toBe('Enter name.');
});
it('wants 4 to 16 characters', () => {
  expect(validateCharacterName('abc')).toBe('Character Name must be 4 to 16 characters long.');
  expect(validateCharacterName('a'.repeat(17))).toBe('Character Name must be 4 to 16 characters long.');
});
it('refuses a leading digit', () => {
  expect(validateCharacterName('1abc')).toBe('The name cannot start with a number.');
});
it('refuses spaces and symbols', () => {
  expect(validateCharacterName('ab cd')).toBe('You cannot use special characters or spaces in a name.');
  expect(validateCharacterName('abc!')).toBe('You cannot use special characters or spaces in a name.');
});
it('takes a good name, judged trimmed', () => {
  expect(validateCharacterName(' Hero1 ')).toBeUndefined();
});

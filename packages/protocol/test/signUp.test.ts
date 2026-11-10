import { describe, expect, it } from 'vitest';
import { checkSignUp, DEFAULT_RESERVED_NAMES, normalizeAccount } from '../src';

describe('checkSignUp', () => {
  const ok = { account: 'Hero_01', password: 'abc12345', confirm: 'abc12345', email: '' };
  it('accepts a good form and normalizes the name', () => {
    expect(checkSignUp(ok)).toBeUndefined();
    expect(normalizeAccount('  Hero_01 ')).toBe('hero_01');
  });
  it.each([
    ['', 'Enter an account name.'], ['   ', 'Enter an account name.'],
    ['abc', 'The account name must be 4 to 32 characters long.'],
    ['a'.repeat(33), 'The account name must be 4 to 32 characters long.'],
    ["bob'x", 'Use only letters, numbers, - and _ in the account name.'], ['bo b1', 'Use only letters, numbers, - and _ in the account name.'],
    ['héros', 'Use only letters, numbers, - and _ in the account name.'], ['admin', 'That account name is reserved.'],
    ['GMbob', 'That account name is reserved.'], ['administrator2', 'That account name is reserved.'],
  ])('refuses the name %j', (account, message) => {
    expect(checkSignUp({ ...ok, account })).toEqual({ field: 'account', message });
  });
  it('takes 4 and 32 characters', () => {
    expect(checkSignUp({ ...ok, account: 'abcd' })).toBeUndefined();
    expect(checkSignUp({ ...ok, account: 'a'.repeat(32) })).toBeUndefined();
  });
  it.each([
    ['abc1234', 'The password must be 8 to 31 characters long.'], ['a1'.repeat(16), 'The password must be 8 to 31 characters long.'],
    ['abcdefgh', 'The password needs at least one letter and one number.'], ['12345678', 'The password needs at least one letter and one number.'],
    ['abc1234é', 'Use only letters, numbers, spaces and common symbols in the password.'], ['HERO_01x', undefined],
  ])('password %j', (password, message) => {
    const problem = checkSignUp({ ...ok, password, confirm: password });
    expect(problem?.message).toBe(message);
  });
  it('refuses a password equal to the name in any case', () => {
    expect(checkSignUp({ account: 'hero1234', password: 'HERO1234', confirm: 'HERO1234', email: '' }))
      .toEqual({ field: 'password', message: 'The password cannot be the account name.' });
  });
  it('takes 31 characters and refuses 32', () => {
    expect(checkSignUp({ ...ok, password: 'a1'.repeat(15) + 'b', confirm: 'a1'.repeat(15) + 'b' })).toBeUndefined();
    expect(checkSignUp({ ...ok, password: 'a1'.repeat(16), confirm: 'a1'.repeat(16) })?.field).toBe('password');
  });
  it('refuses a mismatched confirmation, and skips the check without one', () => {
    expect(checkSignUp({ ...ok, confirm: 'other123' })).toEqual({ field: 'confirm', message: 'The passwords do not match.' });
    expect(checkSignUp({ account: ok.account, password: ok.password, email: '' })).toBeUndefined();
  });
  it.each(['a@b', 'no at.com', `${'a'.repeat(95)}@b.com`])('refuses the email %j', (email) => {
    expect(checkSignUp({ ...ok, email })).toEqual({ field: 'email', message: 'Enter a valid email address, or leave it empty.' });
  });
  it('takes a plain email', () => {
    expect(checkSignUp({ ...ok, email: 'hero@example.com' })).toBeUndefined();
  });
  it('uses the reserved names it is given', () => {
    const reserved = { exact: ['hero_01'], prefixes: ['zz'] };
    expect(checkSignUp(ok, reserved)).toEqual({ field: 'account', message: 'That account name is reserved.' });
    expect(checkSignUp({ ...ok, account: 'zzhero' }, reserved)?.message).toBe('That account name is reserved.');
    expect(checkSignUp({ ...ok, account: 'admin' }, reserved)).toBeUndefined();
    expect(DEFAULT_RESERVED_NAMES.exact).toContain('gamemaster');
  });
});

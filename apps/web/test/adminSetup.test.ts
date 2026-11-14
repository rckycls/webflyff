import { expect, it } from 'vitest';
import { buildCredentials, checkSetupPassword } from '../scripts/adminSetupRules';
import { parseCredentials } from '../src/admin/credentials';
import { verifyAdminPassword } from '../src/admin/password';
import { newTotpSecret } from '../src/admin/totp';

it('builds a login file the service can read, with a hash of the password', () => {
  const secret = newTotpSecret();
  const credentials = buildCredentials('Poreotix', 'a long password!', secret);
  expect(parseCredentials(credentials)).toEqual(credentials);
  expect(credentials.totpSecret).toBe(secret);
  expect(credentials.passwordHash).not.toContain('a long password!');
  expect(verifyAdminPassword('a long password!', credentials.passwordHash)).toBe(true);
});

it('wants a panel password of 12 characters or more', () => {
  expect(checkSetupPassword('short')).toMatch(/12/);
  expect(checkSetupPassword('elevenchars')).toMatch(/12/);
  expect(checkSetupPassword('twelve chars')).toBeUndefined();
});

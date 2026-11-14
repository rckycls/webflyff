import { randomBytes } from 'node:crypto';
import { expect, it } from 'vitest';
import { parseCredentials } from '../src/admin/credentials';
import { hashAdminPassword, verifyAdminPassword } from '../src/admin/password';
import { base32Decode, base32Encode, matchTotp, newTotpSecret, otpauthUrl, totpCode, totpStep } from '../src/admin/totp';

const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

it('base32-encodes the RFC 6238 secret', () => {
  expect(RFC_SECRET).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
});

it('gives the RFC 6238 SHA-1 codes', () => {
  const vectors: [number, string][] = [
    [59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'], [1234567890, '89005924'], [2000000000, '69279037'],
  ];
  for (const [t, code] of vectors) expect(totpCode(RFC_SECRET, totpStep(t * 1000), 8)).toBe(code);
  expect(totpCode(RFC_SECRET, totpStep(59_000))).toBe('287082');
});

it('accepts the step before and after, and nothing further', () => {
  const now = 1_700_000_000_000;
  const step = totpStep(now);
  expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, step), now)).toBe(step);
  expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 1), now)).toBe(step - 1);
  expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, step + 1), now)).toBe(step + 1);
  expect(matchTotp(RFC_SECRET, totpCode(RFC_SECRET, step - 2), now)).toBeUndefined();
  expect(matchTotp(RFC_SECRET, '12345', now)).toBeUndefined();
  expect(matchTotp(RFC_SECRET, '12345a', now)).toBeUndefined();
  expect(matchTotp(RFC_SECRET, '', now)).toBeUndefined();
});

it('round-trips base32, ignoring spaces and case', () => {
  for (let n = 0; n <= 40; n++) {
    const bytes = randomBytes(n);
    expect(base32Decode(base32Encode(bytes)).equals(bytes)).toBe(true);
  }
  expect(base32Decode('gezd gnbv gy3t qojq gezd gnbv gy3t qojq').toString()).toBe('12345678901234567890');
  expect(() => base32Decode('GEZ1')).toThrow();
});

it('makes a 160-bit secret and an otpauth link', () => {
  const secret = newTotpSecret();
  expect(base32Decode(secret)).toHaveLength(20);
  expect(newTotpSecret()).not.toBe(secret);
  expect(otpauthUrl('ABC', 'Poreotix')).toBe('otpauth://totp/osflyff%20admin:Poreotix?secret=ABC&issuer=osflyff%20admin');
});

it('checks a password against its scrypt hash', () => {
  const stored = hashAdminPassword('a long password!');
  expect(stored).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  expect(verifyAdminPassword('a long password!', stored)).toBe(true);
  expect(verifyAdminPassword('a long password?', stored)).toBe(false);
  expect(verifyAdminPassword('a long password!', 'garbage')).toBe(false);
  expect(verifyAdminPassword('a long password!', 'scrypt$1$8$1$AAAA$AAAA')).toBe(false);
  expect(hashAdminPassword('same')).not.toBe(hashAdminPassword('same'));
});

it('reads the login file and names a missing key', () => {
  const good = { user: 'Poreotix', passwordHash: hashAdminPassword('x'), totpSecret: RFC_SECRET };
  expect(parseCredentials(good)).toEqual(good);
  expect(() => parseCredentials({ user: 'Poreotix', passwordHash: good.passwordHash })).toThrow(/totpSecret/);
  expect(() => parseCredentials({ ...good, user: '' })).toThrow(/user/);
  expect(() => parseCredentials({ ...good, user: 'a b\n' })).toThrow(/user/);
  expect(() => parseCredentials({ ...good, totpSecret: 'not base32!' })).toThrow(/totpSecret/);
});

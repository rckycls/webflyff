import { expect, it } from 'vitest';
import { DEFAULT_PREREG_MAX_ACCOUNTS, parsePreregEnv } from '../src';

it('reads PREREG_MAX_ACCOUNTS_PER_IP: 3 when missing or empty, a whole number from 0 to 1000 as written', () => {
  expect(DEFAULT_PREREG_MAX_ACCOUNTS).toBe(3);
  expect(parsePreregEnv('PREREG_ONLY=true')).toMatchObject({ maxAccounts: 3, warnings: [] });
  expect(parsePreregEnv('PREREG_MAX_ACCOUNTS_PER_IP=')).toMatchObject({ maxAccounts: 3, warnings: [] });
  expect(parsePreregEnv('PREREG_MAX_ACCOUNTS_PER_IP= 5 # a family')).toMatchObject({ maxAccounts: 5, warnings: [] });
  expect(parsePreregEnv('prereg_max_accounts_per_ip=0').maxAccounts).toBe(0);
  expect(parsePreregEnv('PREREG_MAX_ACCOUNTS_PER_IP=1000').maxAccounts).toBe(1000);
});

it('uses 3, with a warning, for a cap that is not a whole number from 0 to 1000', () => {
  for (const bad of ['three', '-1', '2.5', '1001', '99999']) {
    expect(parsePreregEnv(`PREREG_MAX_ACCOUNTS_PER_IP=${bad}`), bad).toMatchObject({
      maxAccounts: 3, warnings: [`PREREG_MAX_ACCOUNTS_PER_IP=${bad} is not a whole number from 0 to 1000: 3 is used`],
    });
  }
});

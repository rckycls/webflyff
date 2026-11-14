// `npm run admin:setup -- --file C:\flyff-web\admin-login.json` (admin panel spec §5.2): makes the owner's panel login.
// It asks for the name and the password (twice, not shown), makes a new authenticator key, shows it, and writes the
// file only once a code from the authenticator app matches. Running it again sets a new password and a new key: the
// old app entry stops working. The web service reads the file at start: restart it afterwards.
//
// Exit codes: 0 written, 1 refused (passwords differ, too short, no matching code), 2 bad command line.

import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { parseArgs } from 'node:util';
import { matchTotp, newTotpSecret, otpauthUrl } from '../src/admin/totp';
import { buildCredentials, checkSetupPassword } from './adminSetupRules';

const USAGE = 'Usage: npm run admin:setup -- --file <path to admin-login.json, for example C:\\flyff-web\\admin-login.json>';

let file: string | undefined;
try {
  file = parseArgs({ options: { file: { type: 'string' } } }).values.file;
} catch (error) {
  console.error(`${(error as Error).message}\n${USAGE}`);
  process.exit(2);
}
if (file === undefined || file === '') {
  console.error(USAGE);
  process.exit(2);
}

// The password is typed into a muted output, so it is not shown.
let muted = false;
const output = new Writable({
  write(chunk, encoding, done) {
    if (!muted) process.stdout.write(chunk, encoding);
    done();
  },
});
const rl = createInterface({ input: process.stdin, output, terminal: process.stdin.isTTY === true });
// Lines are read through one iterator, so answers typed (or piped) ahead of their question wait for it.
const lines = rl[Symbol.asyncIterator]();
async function ask(question: string, hidden = false): Promise<string> {
  process.stdout.write(question);
  muted = hidden;
  const next = await lines.next();
  muted = false;
  if (hidden) process.stdout.write('\n');
  if (next.done === true) refuse('\nNo answer. Nothing was written.');
  return next.value;
}

function refuse(message: string): never {
  console.error(message);
  rl.close();
  process.exit(1);
}

const user = (await ask('Panel name (for example your account name): ')).trim();
if (!/^[\x21-\x7e]{1,32}$/.test(user)) refuse('The name must be 1 to 32 characters, with no spaces.');
const password = await ask('Panel password (not shown): ', true);
const tooShort = checkSetupPassword(password);
if (tooShort !== undefined) refuse(tooShort);
if ((await ask('The same password again: ', true)) !== password) refuse('The passwords are not the same. Nothing was written.');

const secret = newTotpSecret();
console.log('');
console.log('Add this key to your authenticator app (Google Authenticator, Microsoft Authenticator, ...),');
console.log('as a time-based key typed by hand:');
console.log('');
console.log(`    ${secret.match(/.{1,4}/g)!.join(' ')}`);
console.log('');
console.log(`Or open this link on the phone: ${otpauthUrl(secret, user)}`);
console.log('');

let matched = false;
for (let tries = 0; tries < 3 && !matched; tries++) {
  const code = (await ask('The 6-digit code the app shows now: ')).trim();
  matched = matchTotp(secret, code, Date.now()) !== undefined;
  if (!matched) console.log('That code does not match. Check the key and the phone\'s clock.');
}
if (!matched) refuse('No matching code. Nothing was written: run it again.');

writeFileSync(file, `${JSON.stringify(buildCredentials(user, password, secret), null, 2)}\n`);
rl.close();
console.log(`Written: ${file}`);
console.log('Now restart the site service so it reads it: nssm restart flyffweb-site');

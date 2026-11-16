// npm run prereg:list -- <signups.jsonl> <out.csv>: the VIP list for the pre-registration reward
// (docs/2026-11-15-prereg-login.md). On the rented server: C:\FlyFF\deploy\run.bat Prereg-List.

import { readFileSync, writeFileSync } from 'node:fs';
import { preregCsv } from '../src/preregList';
import { readSignUps } from '../src/signUpBook';

const [input, output] = process.argv.slice(2);
if (input === undefined || output === undefined) {
  console.error('Usage: npm run prereg:list -- <signups.jsonl> <out.csv>');
  process.exit(2);
}
let text: string;
try {
  text = readFileSync(input, 'utf8');
} catch (error) {
  console.error(`prereg:list: cannot read ${input}: ${(error as Error).message}`);
  process.exit(1);
}
const { csv, accounts, vip } = preregCsv(readSignUps(text));
writeFileSync(output, csv, 'utf8');
console.log(`prereg:list: ${accounts} account(s) made during pre-registration, ${vip} marked vip=yes, written to ${output}`);

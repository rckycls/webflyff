// Authenticator codes for the browser check. The panel takes a code once (each 30-second step only once), so the
// last step used is kept in a file shared by the test runs, and a new login waits until a fresh step is allowed.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { totpCode, totpStep } from '../src/admin/totp';
import { DEMO_PASSWORD, DEMO_SECRET, DEMO_USER } from '../scripts/adminDemoLogin';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../node_modules/.cache/admin-e2e');
const LAST = path.join(DIR, 'last-step.json');
export const STATE = path.join(DIR, 'state.json');

function lastStep(): number {
  try {
    return Number(JSON.parse(readFileSync(LAST, 'utf8')).step) || -1;
  } catch {
    return -1;
  }
}

/** A code for a step not used before (the server takes now's step, the one before and the one after). */
export async function freshCode(): Promise<string> {
  let step = Math.max(totpStep(Date.now()) - 1, lastStep() + 1);
  while (step > totpStep(Date.now()) + 1) await new Promise((resolve) => setTimeout(resolve, 1000));
  mkdirSync(DIR, { recursive: true });
  writeFileSync(LAST, JSON.stringify({ step }));
  return totpCode(DEMO_SECRET, step);
}

/** Resets the step file at the start of a run (the demo server is new each run). */
export function forgetSteps(): void {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(LAST, JSON.stringify({ step: -1 }));
}

export { DEMO_PASSWORD, DEMO_USER };

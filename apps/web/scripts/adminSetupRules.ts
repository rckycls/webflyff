// The pieces of `npm run admin:setup` that need no keyboard (adminSetup.ts asks the questions).

import type { AdminCredentials } from '../src/admin/credentials';
import { hashAdminPassword } from '../src/admin/password';

export const MIN_PANEL_PASSWORD = 12;

/** A message when the panel password is too short, else `undefined`. */
export function checkSetupPassword(password: string): string | undefined {
  if (password.length < MIN_PANEL_PASSWORD) return `The panel password must be at least ${MIN_PANEL_PASSWORD} characters long.`;
  return undefined;
}

export function buildCredentials(user: string, password: string, totpSecret: string): AdminCredentials {
  return { user, passwordHash: hashAdminPassword(password), totpSecret };
}

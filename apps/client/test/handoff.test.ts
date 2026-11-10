import { expect, it } from 'vitest';
import { putSignUpAccount, SIGN_UP_ACCOUNT_KEY, takeSignUpAccount } from '../src/site/handoff';

/** A Storage kept in a Map. */
class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>();
  get length(): number { return this.items.size; }
  clear(): void { this.items.clear(); }
  getItem(key: string): string | null { return this.items.get(key) ?? null; }
  key(index: number): string | null { return [...this.items.keys()][index] ?? null; }
  removeItem(key: string): void { this.items.delete(key); }
  setItem(key: string, value: string): void { this.items.set(key, value); }
}

const throwingStorage = {
  getItem() { throw new DOMException('denied', 'SecurityError'); },
  setItem() { throw new DOMException('denied', 'SecurityError'); },
  removeItem() { throw new DOMException('denied', 'SecurityError'); },
} as unknown as Storage;

it('takes the account once', () => {
  const s = new MemoryStorage();
  putSignUpAccount(s, 'hero_01');
  expect(s.getItem(SIGN_UP_ACCOUNT_KEY)).toBe('hero_01');
  expect(SIGN_UP_ACCOUNT_KEY).toBe('flyffweb.signUpAccount');
  expect(takeSignUpAccount(s)).toBe('hero_01');
  expect(takeSignUpAccount(s)).toBe('');
});
it('survives a storage that throws, or none', () => {
  expect(() => putSignUpAccount(throwingStorage, 'hero_01')).not.toThrow();
  expect(takeSignUpAccount(throwingStorage)).toBe('');
  expect(() => putSignUpAccount(null, 'hero_01')).not.toThrow();
  expect(takeSignUpAccount(null)).toBe('');
});

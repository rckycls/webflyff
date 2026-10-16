import { expect } from 'vitest';
import { FormatError } from '../../src/index';

/** Runs `fn`, which must throw a FormatError, and returns it. */
export function thrown(fn: () => unknown): FormatError {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(FormatError);
    return e as FormatError;
  }
  throw new Error('expected a FormatError, but nothing was thrown');
}

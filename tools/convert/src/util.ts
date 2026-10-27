/**
 * Whether `name` passes the `--only <glob>` filter. `undefined` passes everything. Otherwise the glob must match the
 * whole base name without its extension (`Part_mVag01Upper.o3d` is compared as `Part_mVag01Upper`; a world folder
 * name has none), ignoring case. `*` stands for any run of characters; every other character is literal. A comma
 * separates several globs (`effects,ui,data`): the name passes when any of them matches, each as a whole name.
 */
export function matchesOnly(name: string, only: string | undefined): boolean {
  if (only === undefined) return true;
  const base = name.slice(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1);
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  return only.split(',').some((glob) => {
    const pattern = glob
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*');
    return new RegExp(`^${pattern}$`, 'is').test(stem);
  });
}

/** `1 skill`, `2 skills`: a count and its noun, for the sentences of a report. */
export const plural = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** At most five names, then "and N more": the names a warning lists. */
export function listed(names: Iterable<string>): string {
  const all = [...names];
  return all.slice(0, 5).join(', ') + (all.length > 5 ? ` and ${all.length - 5} more` : '');
}

/**
 * Calls `fn` once per item with at most `jobs` calls in flight. Catch a failure inside `fn` and report it there:
 * if `fn` does reject, no new item is started, the calls already running finish, and the first rejection is
 * rethrown (a bug, not a failed file).
 */
export async function runLimited<T>(items: T[], jobs: number, fn: (item: T) => Promise<void>): Promise<void> {
  if (!Number.isInteger(jobs) || jobs < 1) {
    throw new RangeError(`jobs must be a positive integer, got ${jobs}`);
  }
  let next = 0;
  let failure: { error: unknown } | undefined;
  const worker = async (): Promise<void> => {
    while (failure === undefined && next < items.length) {
      const item = items[next++]!;
      try {
        await fn(item);
      } catch (error) {
        failure ??= { error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(jobs, items.length) }, worker));
  if (failure !== undefined) throw failure.error;
}

/** A problem the person running the converter can fix (wrong folder, bad option): reported without a stack trace. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}

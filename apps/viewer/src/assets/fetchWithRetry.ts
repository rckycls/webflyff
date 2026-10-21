// Every download the viewer makes goes through here (global constraints: a failed download is retried 3 times with
// backoff, 500, 1000 and 2000 ms, and then reported, never left to leave a blank screen).

export interface FetchRetryOptions {
  /** Retries after the first attempt. Default 3, so 4 attempts in all. */
  retries?: number;
  /** Delay before the first retry; it doubles for each one after. Default 500 ms (500, 1000, 2000). */
  baseDelayMs?: number;
  /** For tests. Default: the global `fetch`. */
  fetchFn?: typeof fetch;
  /** For tests. Default: a timer. */
  sleep?: (ms: number) => Promise<void>;
  /** Passed to `fetch` as its second argument. */
  init?: RequestInit;
}

/** A download that failed on every attempt. */
export class AssetLoadError extends Error {
  override readonly name = 'AssetLoadError';

  constructor(
    readonly url: string,
    readonly attempts: number,
    cause?: unknown,
  ) {
    super(`could not load ${url} after ${attempts} attempts: ${reasonOf(cause)}`, { cause });
  }
}

function reasonOf(failure: unknown): string {
  if (failure instanceof Error) return failure.message;
  return failure === undefined ? 'unknown error' : String(failure);
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * `fetch`, retried. A rejected fetch and any non-2xx status count as a failed attempt (a 404 is retried like the
 * rest: the viewer only asks for files its index lists, so a missing one is a server problem that may pass).
 * Resolves with the first response whose status is ok; throws `AssetLoadError` after the last failure.
 */
export async function fetchWithRetry(url: string, opts: FetchRetryOptions = {}): Promise<Response> {
  const { retries = 3, baseDelayMs = 500, fetchFn = fetch, sleep = defaultSleep, init } = opts;

  let failure: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(baseDelayMs * 2 ** (attempt - 1));
    try {
      const response = init === undefined ? await fetchFn(url) : await fetchFn(url, init);
      if (response.ok) return response;
      failure = new Error(`HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`);
      void response.body?.cancel().catch(() => {});
    } catch (error) {
      failure = error;
    }
  }
  throw new AssetLoadError(url, retries + 1, failure);
}

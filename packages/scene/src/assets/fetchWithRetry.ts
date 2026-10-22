// Every download the viewer makes goes through here (global constraints: a failed download is retried 3 times with
// backoff, 500, 1000 and 2000 ms, and then reported, never left to leave a blank screen). A download that hangs counts
// as failed too: each attempt has a time limit, so a stalled request ends up retried and reported like any other.

export interface FetchRetryOptions {
  /** Retries after the first attempt. Default 3, so 4 attempts in all. */
  retries?: number;
  /** Delay before the first retry; it doubles for each one after. Default 500 ms (500, 1000, 2000). */
  baseDelayMs?: number;
  /** The time one attempt may take, request and body together, before it counts as failed. Default 20 s. */
  timeoutMs?: number;
  /** For tests. Default: a timer. */
  sleep?: (ms: number) => Promise<void>;
  /** For tests: the signal that ends an attempt after `ms`. Default: `AbortSignal.timeout`. */
  timeoutSignal?: (ms: number) => AbortSignal;
  /** For tests. Default: the global `fetch`. */
  fetchFn?: typeof fetch;
  /**
   * Passed to `fetch` as its second argument, with the attempt's signal in place of `init.signal`. When the caller's
   * own `init.signal` aborts, the download stops at once with its reason and is not retried.
   */
  init?: RequestInit;
}

/** A download that failed on every attempt. */
export class AssetLoadError extends Error {
  override readonly name = 'AssetLoadError';

  constructor(
    /** What could not be had: a url, or a name such as "the Basis transcoder". */
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

/** One attempt's time limit by default. Long enough for a big tile on a slow phone line, short enough to retry. */
export const ATTEMPT_TIMEOUT_MS = 20_000;

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const defaultTimeoutSignal = (ms: number): AbortSignal => AbortSignal.timeout(ms);

/**
 * A signal that aborts when any of `signals` does, and `release` to stop listening to them. Not `AbortSignal.any`:
 * Safari has it only from 17.4, and the viewer runs on iOS 16.
 */
function eitherSignal(signals: readonly AbortSignal[]): { signal: AbortSignal; release(): void } {
  const controller = new AbortController();
  const listening: [AbortSignal, () => void][] = [];
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    const onAbort = (): void => controller.abort(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    listening.push([signal, onAbort]);
  }
  return {
    signal: controller.signal,
    release: () => {
      for (const [signal, onAbort] of listening) signal.removeEventListener('abort', onAbort);
    },
  };
}

/**
 * `work`, or a rejection with the signal's reason as soon as `signal` aborts, whichever comes first. So an attempt
 * ends on time even when what it waits for does not listen to the signal (a `read`, KTX2Loader's own download).
 */
function untilAborted<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(signal.reason);
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
    void work.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/**
 * Runs `attempt` until it resolves, at most `retries + 1` times, sleeping 500, 1000, 2000 ms between attempts. Each
 * attempt gets a signal that aborts after `timeoutMs` (or when `callerSignal` does) and fails when it fires, whether or
 * not `attempt` listens to it. Throws `AssetLoadError` naming `what` after the last failure, or the caller's reason,
 * without retrying, when `callerSignal` aborts.
 */
export async function withRetries<T>(
  what: string,
  attempt: (signal: AbortSignal) => Promise<T>,
  opts: FetchRetryOptions = {},
  callerSignal: AbortSignal | null = null,
): Promise<T> {
  const {
    retries = 3,
    baseDelayMs = 500,
    timeoutMs = ATTEMPT_TIMEOUT_MS,
    sleep = defaultSleep,
    timeoutSignal = defaultTimeoutSignal,
  } = opts;

  let failure: unknown;
  for (let i = 0; i <= retries; i++) {
    if (i > 0) await sleep(baseDelayMs * 2 ** (i - 1));
    if (callerSignal?.aborted) throw callerSignal.reason;
    const timeout = timeoutSignal(timeoutMs);
    const { signal, release } = eitherSignal(callerSignal === null ? [timeout] : [timeout, callerSignal]);
    try {
      return await untilAborted(attempt(signal), signal);
    } catch (error) {
      if (callerSignal?.aborted) throw callerSignal.reason;
      failure = timeout.aborted ? new Error(`no answer within ${timeoutMs / 1000} s`) : error;
    } finally {
      release();
    }
  }
  throw new AssetLoadError(what, retries + 1, failure);
}

/**
 * A download, retried as a whole: the request AND `read` of its body are one attempt. A connection that drops while
 * the body is coming (common on phones) rejects `read`, and that is retried like a failed request, with the same
 * backoff; so is an attempt that takes longer than `timeoutMs`. A rejected fetch, any non-2xx status, a rejected
 * `read` and a timeout count as a failed attempt (a 404 is retried like the rest: the viewer only asks for files its
 * index lists, so a missing one is a server problem that may pass). Resolves with what `read` returns for the first
 * attempt that works; throws `AssetLoadError` after the last failure.
 */
export function fetchRead<T>(
  url: string,
  read: (response: Response) => Promise<T>,
  opts: FetchRetryOptions = {},
): Promise<T> {
  const { fetchFn = fetch, init } = opts;
  return withRetries(
    url,
    async (signal) => {
      // the attempt's signal also aborts the body: a stalled read rejects with it
      const response = await fetchFn(url, { ...init, signal });
      if (response.ok) return await read(response);
      void response.body?.cancel().catch(() => {});
      throw new Error(`HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`);
    },
    opts,
    init?.signal ?? null,
  );
}

/**
 * `fetch`, retried, resolving with the response once its status is ok. The body is the caller's to read, and a failure
 * there is not retried: use `fetchRead` for anything whose body is read.
 */
export function fetchWithRetry(url: string, opts: FetchRetryOptions = {}): Promise<Response> {
  return fetchRead(url, async (response) => response, opts);
}

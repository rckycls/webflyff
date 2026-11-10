// The home page's server status (website spec §3.2): `GET /api/status` (the web service, apps/web) now and every 60 s
// while the page is visible, and at once when it becomes visible again.

/** The web service's answer (apps/web/src/status.ts has the same type: the client and the service share no package for it). */
export interface StatusAnswer { online: boolean; players: number | null; checkedAt: string }

export const STATUS_EVERY_MS = 60_000;

/** What the box says for an answer, for a service that could not be reached, and before the first answer. */
export function statusText(answer: StatusAnswer | 'unreachable' | 'checking'): string {
  if (answer === 'checking') return 'Checking…';
  if (answer === 'unreachable') return 'Status unavailable';
  if (!answer.online) return 'Offline';
  if (answer.players === null) return 'Online';
  return `Online · ${answer.players} ${answer.players === 1 ? 'player' : 'players'}`;
}

function isStatusAnswer(value: unknown): value is StatusAnswer {
  if (typeof value !== 'object' || value === null) return false;
  const { online, players, checkedAt } = value as Record<string, unknown>;
  return typeof online === 'boolean' && typeof checkedAt === 'string'
    && (players === null || (typeof players === 'number' && Number.isInteger(players) && players >= 0));
}

async function askStatus(fetchFn: typeof fetch): Promise<StatusAnswer | 'unreachable'> {
  try {
    const response = await fetchFn('/api/status', { cache: 'no-store' });
    if (!response.ok) return 'unreachable';
    const body: unknown = await response.json();
    return isStatusAnswer(body) ? body : 'unreachable';
  } catch {
    return 'unreachable';
  }
}

/** Keeps `el`'s text on the status while `doc` is visible; returns the function that stops it. */
export function watchStatus(el: HTMLElement, fetchFn: typeof fetch, doc: Document): () => void {
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopped = false;
  el.textContent = statusText('checking');
  const ask = async () => {
    const answer = await askStatus(fetchFn);
    if (!stopped) el.textContent = statusText(answer);
  };
  const follow = () => {
    clearInterval(timer);
    timer = undefined;
    if (stopped || doc.visibilityState !== 'visible') return;
    void ask();
    timer = setInterval(() => void ask(), STATUS_EVERY_MS);
  };
  doc.addEventListener('visibilitychange', follow);
  follow();
  return () => {
    stopped = true;
    clearInterval(timer);
    doc.removeEventListener('visibilitychange', follow);
  };
}

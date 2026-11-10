import { afterEach, expect, it, vi } from 'vitest';
import { statusText, watchStatus } from '../src/site/statusBox';

it.each([
  ['checking', 'Checking…'], ['unreachable', 'Status unavailable'],
  [{ online: true, players: 12, checkedAt: '' }, 'Online · 12 players'], [{ online: true, players: 1, checkedAt: '' }, 'Online · 1 player'],
  [{ online: true, players: 0, checkedAt: '' }, 'Online · 0 players'],
  [{ online: true, players: null, checkedAt: '' }, 'Online'], [{ online: false, players: 0, checkedAt: '' }, 'Offline'],
])('says %j as %s', (answer, text) => expect(statusText(answer as never)).toBe(text));

/** A document whose visibility the test sets. */
class FakeDocument extends EventTarget {
  visibilityState: DocumentVisibilityState = 'visible';
  show(state: DocumentVisibilityState): void {
    this.visibilityState = state;
    this.dispatchEvent(new Event('visibilitychange'));
  }
}

const answering = (body: unknown, ok = true) => vi.fn(async (_url: string) => ({ ok, json: async () => body }) as Response);

afterEach(() => { vi.useRealTimers(); });

it('asks every 60 s while visible, not while hidden, and at once on return', async () => {
  vi.useFakeTimers();
  const doc = new FakeDocument();
  const el = { textContent: '', dataset: {} } as unknown as HTMLElement;
  const fetchFn = answering({ online: true, players: 2, checkedAt: 'x' });
  const stop = watchStatus(el, fetchFn as unknown as typeof fetch, doc as unknown as Document);
  expect(el.textContent).toBe('Checking…');
  expect(el.dataset.state).toBe('checking');
  await vi.advanceTimersByTimeAsync(0);
  expect(fetchFn).toHaveBeenCalledTimes(1);
  expect(fetchFn.mock.calls[0]![0]).toBe('/api/status');
  expect(el.textContent).toBe('Online · 2 players');
  expect(el.dataset.state).toBe('online');
  await vi.advanceTimersByTimeAsync(60_000);
  expect(fetchFn).toHaveBeenCalledTimes(2);
  doc.show('hidden');
  await vi.advanceTimersByTimeAsync(180_000);
  expect(fetchFn).toHaveBeenCalledTimes(2);
  doc.show('visible');
  await vi.advanceTimersByTimeAsync(0);
  expect(fetchFn).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(fetchFn).toHaveBeenCalledTimes(4);
  stop();
  doc.show('hidden');
  doc.show('visible');
  await vi.advanceTimersByTimeAsync(120_000);
  expect(fetchFn).toHaveBeenCalledTimes(4);
});

it('marks an offline game', async () => {
  const el = { textContent: '', dataset: {} } as unknown as HTMLElement;
  watchStatus(el, answering({ online: false, players: 0, checkedAt: 'x' }) as unknown as typeof fetch, new FakeDocument() as unknown as Document);
  await vi.waitFor(() => expect(el.textContent).toBe('Offline'));
  expect(el.dataset.state).toBe('offline');
});

it('waits for the page to be visible before the first ask', async () => {
  vi.useFakeTimers();
  const doc = new FakeDocument();
  doc.visibilityState = 'hidden';
  const fetchFn = answering({ online: false, players: 0, checkedAt: 'x' });
  watchStatus({ textContent: '', dataset: {} } as unknown as HTMLElement, fetchFn as unknown as typeof fetch, doc as unknown as Document);
  await vi.advanceTimersByTimeAsync(120_000);
  expect(fetchFn).not.toHaveBeenCalled();
  doc.show('visible');
  await vi.advanceTimersByTimeAsync(0);
  expect(fetchFn).toHaveBeenCalledTimes(1);
});

it.each([
  ['an HTTP error', answering({}, false)],
  ['a network failure', vi.fn(async () => { throw new TypeError('offline'); })],
  ['an answer of the wrong shape', answering({ online: 'yes' })],
])('says Status unavailable for %s', async (_name, fetchFn) => {
  const el = { textContent: '', dataset: {} } as unknown as HTMLElement;
  watchStatus(el, fetchFn as unknown as typeof fetch, new FakeDocument() as unknown as Document);
  await vi.waitFor(() => expect(el.textContent).toBe('Status unavailable'));
  expect(el.dataset.state).toBe('unknown');
});

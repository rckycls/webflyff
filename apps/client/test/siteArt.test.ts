import { expect, it, vi } from 'vitest';
import { lobbyPicture } from '../src/site/siteArt';

const index = (body: unknown, ok = true) => vi.fn(async (_url: string) => ({ ok, json: async () => body }) as Response);

it("finds the login screen's picture in the asset index", async () => {
  const fetchFn = index({ version: 1, files: { 'ui/screen.png': 'ui/screen.d91ebd285f.png' } });
  await expect(lobbyPicture(fetchFn as unknown as typeof fetch)).resolves.toBe('/assets/ui/screen.d91ebd285f.png');
  expect(fetchFn.mock.calls[0]![0]).toBe('/assets/index.json');
});
it.each([
  ['a missing picture', index({ version: 1, files: {} })],
  ['another index version', index({ version: 2, files: { 'ui/screen.png': 'x.png' } })],
  ['an HTTP error', index({}, false)],
  ['a network failure', vi.fn(async () => { throw new TypeError('offline'); })],
])('gives null for %s', async (_name, fetchFn) => {
  await expect(lobbyPicture(fetchFn as unknown as typeof fetch)).resolves.toBeNull();
});

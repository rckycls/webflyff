import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

// config.ts reads the page's address when it is loaded, so each case stubs `location` and the setting first, then imports it afresh.
async function gatewayUrlFor(setting: string | undefined, page: { protocol: string; host: string; hostname: string }): Promise<string> {
  vi.resetModules();
  vi.stubGlobal('location', page);
  vi.stubEnv('VITE_GATEWAY_URL', setting);
  return (await import('../src/config')).clientConfig.gatewayUrl;
}

describe('clientConfig.gatewayUrl', () => {
  it('is the machine that served the page, on port 8090, when VITE_GATEWAY_URL is not set', async () => {
    expect(await gatewayUrlFor(undefined, { protocol: 'http:', host: '192.168.100.161:5174', hostname: '192.168.100.161' })).toBe('ws://192.168.100.161:8090');
  });

  it('is VITE_GATEWAY_URL when it has a value', async () => {
    expect(await gatewayUrlFor('ws://192.168.100.141:8090', { protocol: 'http:', host: 'localhost:5174', hostname: 'localhost' })).toBe('ws://192.168.100.141:8090');
  });

  it('is the page\'s own address, with its port, when VITE_GATEWAY_URL is empty (the dev server forwards /connect/)', async () => {
    expect(await gatewayUrlFor('', { protocol: 'http:', host: '192.168.100.161:5174', hostname: '192.168.100.161' })).toBe('ws://192.168.100.161:5174');
    expect(await gatewayUrlFor('', { protocol: 'http:', host: 'localhost:5174', hostname: 'localhost' })).toBe('ws://localhost:5174');
  });

  it('is wss:// when the page is https (a hosted site serving the page and /connect/ from one host)', async () => {
    expect(await gatewayUrlFor('', { protocol: 'https:', host: 'play.example.com', hostname: 'play.example.com' })).toBe('wss://play.example.com');
  });
});

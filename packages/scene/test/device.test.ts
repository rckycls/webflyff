import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEVICE_STORAGE_KEY, deviceLabel, storeDeviceLabel } from '../src/overlay/device';

function stubStorage(initial: Record<string, string> = {}): Map<string, string> {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
  return store;
}

afterEach(() => vi.unstubAllGlobals());

describe('deviceLabel', () => {
  it('uses the label the tester stored', () => {
    stubStorage({ [DEVICE_STORAGE_KEY]: 'iPad Air 4' });
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPad)' });

    expect(deviceLabel()).toBe('iPad Air 4');
  });

  it('is flyffweb.device in localStorage', () => {
    expect(DEVICE_STORAGE_KEY).toBe('flyffweb.device');
  });

  it('falls back to the user agent without a stored label', () => {
    stubStorage();
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (iPad)' });

    expect(deviceLabel()).toBe('Mozilla/5.0 (iPad)');
  });

  it('falls back to the user agent when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
    vi.stubGlobal('navigator', { userAgent: 'PrivateWindow/1' });

    expect(deviceLabel()).toBe('PrivateWindow/1');
  });

  it('ignores a blank stored label', () => {
    stubStorage({ [DEVICE_STORAGE_KEY]: '   ' });
    vi.stubGlobal('navigator', { userAgent: 'UA' });

    expect(deviceLabel()).toBe('UA');
  });

  it('says unknown when there is neither a label nor a navigator', () => {
    vi.stubGlobal('localStorage', undefined);
    vi.stubGlobal('navigator', undefined);

    expect(deviceLabel()).toBe('unknown');
  });
});

describe('storeDeviceLabel', () => {
  it('stores the trimmed label', () => {
    const store = stubStorage();
    storeDeviceLabel('  Galaxy Tab S8 ');

    expect(store.get(DEVICE_STORAGE_KEY)).toBe('Galaxy Tab S8');
  });

  it('does not throw when storage is unavailable', () => {
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
    });

    expect(() => storeDeviceLabel('x')).not.toThrow();
  });
});

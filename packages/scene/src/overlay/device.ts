// Which device a measurement came from. Phones and tablets do not say much in their user agent, so the tester can type
// a name once; it is kept in localStorage under `flyffweb.device`. Storage can be absent or throw (private windows,
// blocked site data), so every access is wrapped and the label falls back to the user agent.

export const DEVICE_STORAGE_KEY = 'flyffweb.device';

/** The name the tester gave this device, otherwise `navigator.userAgent`. */
export function deviceLabel(): string {
  try {
    const stored = localStorage.getItem(DEVICE_STORAGE_KEY)?.trim();
    if (stored) return stored;
  } catch {
    // no storage: use the user agent
  }
  return typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent;
}

/** Keeps `label` as this device's name. A storage that refuses is ignored: the name just does not stick. */
export function storeDeviceLabel(label: string): void {
  try {
    localStorage.setItem(DEVICE_STORAGE_KEY, label.trim());
  } catch {
    // no storage: nothing to do
  }
}

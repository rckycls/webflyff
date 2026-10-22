import { ProtocolError } from './errors';

/** Lowercase hex, two digits per byte, no separators. */
export function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

/** Inverse of `bytesToHex`; accepts either case, rejects separators and a dangling digit. */
export function hexToBytes(hex: string): Uint8Array {
  if (!/^(?:[0-9a-fA-F]{2})*$/.test(hex)) {
    throw new ProtocolError('hex text must be pairs of hex digits with no separators');
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

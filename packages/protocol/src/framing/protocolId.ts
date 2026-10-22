import { ArReader } from '../ar/ArReader';
import { ArWriter } from '../ar/ArWriter';

/**
 * The first body a server sends on every connection (`CClientSock::SendProtocolId`): a zero `u32`, then the
 * protocol ID the client must mix into every checksum it sends. Any other body, whatever its length, is not it,
 * so the answer is `undefined` instead of an error: the caller decides what an unexpected first body means.
 */
export function readProtocolId(body: Uint8Array): number | undefined {
  if (body.byteLength !== 8) return undefined;
  const reader = new ArReader(body);
  return reader.u32() === 0 ? reader.u32() : undefined;
}

/** The 8-byte body `readProtocolId` recognises; here for tests and for a fake server. */
export function encodeProtocolIdBody(protocolId: number): Uint8Array {
  return new ArWriter().u32(0).u32(protocolId).toBytes();
}

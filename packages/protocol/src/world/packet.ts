import { ArWriter } from '../ar/ArWriter';
import { DPID_UNKNOWN } from '../constants';

/**
 * The start of a packet the client sends to the cache server, `BEFORESENDSOLE( ar, type, DPID_UNKNOWN )`
 * (`Source/_Network/Net/Include/dpmng.h`), like the login packets: the sender ID `DPID_UNKNOWN` first, then the type,
 * then the fields.
 */
export function clientPacket(type: number): ArWriter {
  return new ArWriter().u32(DPID_UNKNOWN).u32(type);
}

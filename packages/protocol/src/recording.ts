import { ProtocolError } from './errors';

/** One body that crossed a recorded connection, in the order it arrived. */
export interface RecordedPacket {
  /** The server's port (23000 certifier, 28000 login), so a fixture says which server a packet belongs to. */
  port: number;
  /** 1, 2, ... in the order the recorder accepted connections. */
  connection: number;
  /** `c2s` is client to server, `s2c` is server to client. */
  direction: 'c2s' | 's2c';
  /** The body without its frame header, as lowercase hex (`bytesToHex`). */
  hex: string;
}

/** A recorded session and the throwaway account it was made with. */
export interface Recording {
  account: string;
  password: string;
  bankPin: string;
  packets: RecordedPacket[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(source: Record<string, unknown>, key: string, where: string): string {
  const value = source[key];
  if (typeof value !== 'string') throw new ProtocolError(`${where}.${key} must be a string`);
  return value;
}

function wholeNumber(source: Record<string, unknown>, key: string, where: string, min: number, max: number): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new ProtocolError(`${where}.${key} must be a whole number from ${min} to ${max}`);
  }
  return value;
}

function parsePacket(value: unknown, index: number): RecordedPacket {
  const where = `recording.packets[${index}]`;
  if (!isRecord(value)) throw new ProtocolError(`${where} must be an object`);
  const port = wholeNumber(value, 'port', where, 1, 65535);
  const connection = wholeNumber(value, 'connection', where, 1, Number.MAX_SAFE_INTEGER);
  const direction = value.direction;
  if (direction !== 'c2s' && direction !== 's2c') {
    throw new ProtocolError(`${where}.direction must be "c2s" or "s2c"`);
  }
  const hex = text(value, 'hex', where);
  if (!/^(?:[0-9a-fA-F]{2})*$/.test(hex)) {
    throw new ProtocolError(`${where}.hex must be pairs of hex digits with no separators`);
  }
  return { port, connection, direction, hex };
}

/**
 * Checks that parsed JSON has the shape of a `Recording` and returns it, keeping only the known fields. Throws
 * a `ProtocolError` naming the first wrong field, so a damaged or hand-edited fixture fails loudly in the test
 * that loads it instead of replaying garbage.
 */
export function parseRecording(json: unknown): Recording {
  if (!isRecord(json)) throw new ProtocolError('recording must be an object');
  const account = text(json, 'account', 'recording');
  const password = text(json, 'password', 'recording');
  const bankPin = text(json, 'bankPin', 'recording');
  const packets = json.packets;
  if (!Array.isArray(packets)) throw new ProtocolError('recording.packets must be an array');
  return { account, password, bankPin, packets: packets.map(parsePacket) };
}

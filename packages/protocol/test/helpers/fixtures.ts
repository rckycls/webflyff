import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DPID_UNKNOWN, hexToBytes, parseRecording, readProtocolId } from '../../src';
import type { RecordedPacket, Recording } from '../../src';

// This file is packages/protocol/test/helpers/fixtures.ts, so the fixtures folder is one level up.
const RECORDING_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/neuz-login.json');

/**
 * True when the owner's recorded Neuz login exists. Tests that need it use `describe.skipIf(!hasRecording())`,
 * so the rest of a test file still runs (and the recorded block shows as skipped) while the recording is missing.
 */
export function hasRecording(): boolean {
  return existsSync(RECORDING_PATH);
}

/** Reads and checks `test/fixtures/neuz-login.json`. Call it inside a test or `beforeAll`, never at module load. */
export function loadRecording(): Recording {
  return parseRecording(JSON.parse(readFileSync(RECORDING_PATH, 'utf8')));
}

/** The recorded packets of one port and direction, in order, without the protocol-ID body each connection starts with. */
export function packetsFor(rec: Recording, port: number, direction: 'c2s' | 's2c'): RecordedPacket[] {
  return rec.packets.filter(
    (p) => p.port === port && p.direction === direction && readProtocolId(hexToBytes(p.hex)) === undefined,
  );
}

/**
 * The packet type of a body: the `u32` at offset 4 when the `u32` at offset 0 is `DPID_UNKNOWN` (the login
 * server's prefix), else the `u32` at offset 0.
 */
export function typeOf(body: Uint8Array): number {
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const first = view.getUint32(0, true);
  return first === DPID_UNKNOWN ? view.getUint32(4, true) : first;
}

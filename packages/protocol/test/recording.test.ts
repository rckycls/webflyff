import { describe, expect, it } from 'vitest';
import { ProtocolError, parseRecording } from '../src';

const good = () => ({
  account: 'acc', password: 'pw', bankPin: '1234',
  packets: [
    { port: 23000, connection: 1, direction: 's2c', hex: '0000000034120000' },
    { port: 23000, connection: 1, direction: 'c2s', hex: 'fc000000' },
    { port: 28000, connection: 2, direction: 's2c', hex: '' },
  ],
});

describe('parseRecording', () => {
  it('returns a recording read back from JSON text', () => {
    expect(parseRecording(JSON.parse(JSON.stringify(good())))).toEqual(good());
  });

  it('keeps only the known fields', () => {
    const rec = parseRecording({ ...good(), note: 'x', packets: [{ ...good().packets[0], extra: 1 }] });
    expect(rec).toEqual({ ...good(), packets: [good().packets[0]] });
  });

  const bad: [string, (r: any) => unknown, string][] = [
    ['not an object', () => [], 'recording must be an object'],
    ['null', () => null, 'recording must be an object'],
    ['account missing', (r) => { delete r.account; return r; }, 'recording.account must be a string'],
    ['password not a string', (r) => ({ ...r, password: 5 }), 'recording.password must be a string'],
    ['bankPin missing', (r) => { delete r.bankPin; return r; }, 'recording.bankPin must be a string'],
    ['packets not an array', (r) => ({ ...r, packets: {} }), 'recording.packets must be an array'],
    ['packet not an object', (r) => ({ ...r, packets: [3] }), 'recording.packets[0] must be an object'],
    ['port zero', (r) => { r.packets[1].port = 0; return r; }, 'recording.packets[1].port'],
    ['port a fraction', (r) => { r.packets[1].port = 23000.5; return r; }, 'recording.packets[1].port'],
    ['port above 65535', (r) => { r.packets[2].port = 65536; return r; }, 'recording.packets[2].port'],
    ['connection zero', (r) => { r.packets[0].connection = 0; return r; }, 'recording.packets[0].connection'],
    ['connection a string', (r) => { r.packets[0].connection = '1'; return r; }, 'recording.packets[0].connection'],
    ['bad direction', (r) => { r.packets[1].direction = 'up'; return r; }, 'recording.packets[1].direction'],
    ['hex with an odd digit', (r) => { r.packets[1].hex = 'fc0'; return r; }, 'recording.packets[1].hex'],
    ['hex with a separator', (r) => { r.packets[1].hex = 'fc 00'; return r; }, 'recording.packets[1].hex'],
    ['hex not a string', (r) => { r.packets[1].hex = 12; return r; }, 'recording.packets[1].hex'],
  ];
  it.each(bad)('rejects %s', (_name, damage, message) => {
    const run = () => parseRecording(damage(good()));
    expect(run).toThrow(ProtocolError);
    expect(run).toThrow(message);
  });
});

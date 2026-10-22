import { describe, expect, it } from 'vitest';
import { normalizeIPv4, resolveClientAddress } from '../src/clientAddress';

describe('normalizeIPv4', () => {
  it('unwraps an IPv4-mapped IPv6 address and refuses any other IPv6 address', () => {
    expect(normalizeIPv4('::ffff:10.0.0.5')).toBe('10.0.0.5');
    expect(normalizeIPv4('::FFFF:10.0.0.5')).toBe('10.0.0.5');
    expect(normalizeIPv4('::1')).toBeUndefined();
    expect(normalizeIPv4('fe80::1')).toBeUndefined();
    expect(normalizeIPv4('::ffff:a00:5')).toBeUndefined(); // the hex form of a mapped address is not dotted
  });

  it('accepts a dotted IPv4 address as it is', () => {
    expect(normalizeIPv4('192.168.1.2')).toBe('192.168.1.2');
    expect(normalizeIPv4('0.0.0.0')).toBe('0.0.0.0');
    expect(normalizeIPv4('255.255.255.255')).toBe('255.255.255.255');
  });

  it('refuses anything else, because the address goes into a packet and into a log line', () => {
    for (const bad of [
      undefined, '', 'localhost', '1.2.3', '1.2.3.4.5', '256.1.1.1', '1.2.3.-4', '1.2.3.4 ', ' 1.2.3.4', '1.2.3.4,5',
      '0x7f.0.0.1', '01.2.3.4', '1.2.3.04', '1.2.3.4\n', '1.2.3.', '::ffff:', '::ffff:1.2.3', '::ffff:::ffff:1.2.3.4',
    ]) {
      expect(normalizeIPv4(bad), String(bad)).toBeUndefined();
    }
  });
});

describe('resolveClientAddress', () => {
  it('takes the last X-Forwarded-For entry from a trusted proxy', () => {
    expect(resolveClientAddress('127.0.0.1', '1.2.3.4, 10.0.0.9', ['127.0.0.1'])).toBe('10.0.0.9');
    expect(resolveClientAddress('::ffff:127.0.0.1', '10.0.0.9', ['127.0.0.1'])).toBe('10.0.0.9');
    expect(resolveClientAddress('127.0.0.1', ['1.2.3.4', ' 10.0.0.9 '], ['127.0.0.1'])).toBe('10.0.0.9');
    expect(resolveClientAddress('127.0.0.1', '::ffff:10.0.0.9', ['127.0.0.1'])).toBe('10.0.0.9');
  });

  it('ignores X-Forwarded-For from a peer that is not a trusted proxy', () => {
    expect(resolveClientAddress('192.168.1.2', '1.2.3.4, 10.0.0.9', ['127.0.0.1'])).toBe('192.168.1.2');
    expect(resolveClientAddress('::ffff:192.168.1.2', '1.2.3.4', [])).toBe('192.168.1.2');
  });

  it('uses the peer when a trusted proxy sent no header', () => {
    expect(resolveClientAddress('127.0.0.1', undefined, ['127.0.0.1'])).toBe('127.0.0.1');
  });

  it('has no address when the one it would use is not IPv4', () => {
    expect(resolveClientAddress('127.0.0.1', '::1', ['127.0.0.1'])).toBeUndefined();
    expect(resolveClientAddress('127.0.0.1', '10.0.0.9, ::1', ['127.0.0.1'])).toBeUndefined();
    expect(resolveClientAddress('127.0.0.1', '', ['127.0.0.1'])).toBeUndefined();
    expect(resolveClientAddress('::1', undefined, ['127.0.0.1'])).toBeUndefined();
    expect(resolveClientAddress(undefined, '10.0.0.9', ['127.0.0.1'])).toBeUndefined();
  });
});

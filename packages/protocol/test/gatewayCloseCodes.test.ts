import { expect, it } from 'vitest';
import { CloseCode } from '../src';

it('has the close codes of the gateway contract (spec section 4.3)', () => {
  expect(CloseCode).toEqual({
    SERVER_UNREACHABLE: 4001,
    SERVER_CLOSED: 4002,
    NOT_ALLOWED: 4003,
    LIMIT: 4004,
    BAD_SERVER_DATA: 4005,
    FORBIDDEN_PACKET: 4006,
    TOO_MANY_CONNECTIONS: 4007,
  });
});

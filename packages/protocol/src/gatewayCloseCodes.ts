/**
 * The WebSocket close codes the gateway ends a connection with (spec section 4.3). The browser client turns each
 * into a plain message. Codes below 4000 are the WebSocket protocol's own (a normal close, a vanished browser).
 */
export const CloseCode = {
  /** The TCP connection to the server failed or did not complete in time. */
  SERVER_UNREACHABLE: 4001,
  /** The server ended the TCP connection, even in the middle of a frame. */
  SERVER_CLOSED: 4002,
  /** The destination is not in the gateway's route table. */
  NOT_ALLOWED: 4003,
  /** A browser packet was too big, too frequent, or too many arrived before the server's protocol ID. */
  LIMIT: 4004,
  /** The server's bytes were not valid frames, or its first packet was not a protocol ID. */
  BAD_SERVER_DATA: 4005,
  /** The browser sent a packet only the gateway may send, or a text message. */
  FORBIDDEN_PACKET: 4006,
  /** Too many connections from one address. */
  TOO_MANY_CONNECTIONS: 4007,
  /** Too many new connections from one address in the last minute. */
  TOO_MANY_NEW_CONNECTIONS: 4008,
  /** The gateway already has as many open connections as it takes in all. */
  GATEWAY_FULL: 4009,
} as const;

export type CloseCode = (typeof CloseCode)[keyof typeof CloseCode];

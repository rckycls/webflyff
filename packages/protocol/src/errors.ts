/**
 * The only error the protocol code throws: malformed bytes, a value the wire format cannot carry, or text that
 * is not allowed on the wire. `offset` is the byte position of the failure when there is one (the readers
 * always pass it) and is repeated in the message, so a log line alone locates the problem.
 */
export class ProtocolError extends Error {
  constructor(
    message: string,
    readonly offset?: number,
  ) {
    super(offset === undefined ? message : `${message} at offset ${offset}`);
    this.name = 'ProtocolError';
  }
}

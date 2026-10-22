/**
 * One connection to a game server through the gateway. Each `send` and each `onPacket` carries one complete packet
 * body, with no framing: the gateway adds and removes that. The owner sets `onPacket` and `onClose` right after it
 * gets the channel and before any task runs, so nothing is lost.
 */
export interface PacketChannel {
  send(body: Uint8Array): void;
  /** Closes the connection. `onClose` still fires afterwards, with the code the close ended with. */
  close(): void;
  onPacket: (body: Uint8Array) => void;
  /** Called once when the connection has ended, with the WebSocket close code (the gateway's own are 4001-4009). */
  onClose: (code: number) => void;
}

/**
 * Opens a channel to `<address>:<port>` of a game server. It resolves once the gateway has accepted the connection
 * and rejects only when the gateway itself cannot be reached, which the lobby reports as close code 1006. A server
 * the gateway cannot reach shows up later, as an `onClose` with 4001.
 */
export type OpenChannel = (target: string) => Promise<PacketChannel>;

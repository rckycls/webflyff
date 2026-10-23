import type { OpenChannel, PacketChannel } from '../../src/net/PacketChannel';
import { waitForConnectGap } from './connectGap';
import { openNodeChannel } from './nodeChannel';

/**
 * One player's connections to the in-process gateway, all of them (the certifier's and the login server's for the lobby,
 * the cache server's for the world). Each opens `CONNECT_GAP_MS` after the previous connection of anyone in this
 * process, and `closed` waits until every one of them has really closed.
 */
export class Link {
  /** One per connection opened; settles when that connection has really closed. */
  private readonly ended: Promise<void>[] = [];
  private readonly raw: OpenChannel;

  /** `forwardedFor` plays another address of the player (the gateway believes it only from a peer in its `trustedProxies`). */
  constructor(gatewayPort: number, origin: string, forwardedFor?: string) {
    this.raw = openNodeChannel(`ws://127.0.0.1:${gatewayPort}`, { origin, forwardedFor });
  }

  readonly open: OpenChannel = async (target) => {
    await waitForConnectGap();
    try {
      return this.watch(await this.raw(target));
    } catch (error) {
      // The flow reports only "cannot reach the gateway"; the reason is here.
      console.error(`live test: could not open ${target} through the gateway: ${(error as Error).message}`);
      throw error;
    }
  };

  /** Resolves once every connection opened so far has closed (or after 5 s, when the gateway's own close at the end of the run cuts whatever is left). */
  async closed(): Promise<void> {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 5000);
      void Promise.all(this.ended).then(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  /** The same channel, remembering when it closes. */
  private watch(channel: PacketChannel): PacketChannel {
    let closed!: () => void;
    this.ended.push(new Promise<void>((resolve) => { closed = resolve; }));
    const watched: PacketChannel = {
      send: (body) => channel.send(body),
      close: () => channel.close(),
      onPacket: () => {},
      onClose: () => {},
    };
    channel.onPacket = (body) => watched.onPacket(body);
    channel.onClose = (code) => {
      closed();
      watched.onClose(code);
    };
    return watched;
  }
}

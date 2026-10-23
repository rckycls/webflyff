import { ArReader, ArWriter, PacketType } from '@flyffweb/protocol';
import type { Vec3 } from '@flyffweb/protocol';
import { encodeBundle, writeWorldReadInfo } from './world';
import type { ScriptMessage } from './world';

/** What the pretend servers put in the JOIN bundle. */
export interface WorldScriptOptions {
  /** The own character's object ID: the bundle header's player object ID and the object of WORLD_READINFO. */
  playerObjectId: number;
  worldId: number;
  /** Where WORLD_READINFO puts the player. */
  pos: Vec3;
  /** The own character's ADD_OBJ (`writeAddSelf`). */
  self: ScriptMessage;
  /** The ADD_OBJs of the movers in view (`writeAddMonster`, `writeAddNpc`, `writeAddPlayer`). */
  others: ScriptMessage[];
  /** Whether the bundles carry the table of contents of the world-snapshot-index patch. Default true. */
  index?: boolean;
}

export interface WorldScript {
  /**
   * The answers to one packet the browser sent: `body` as it arrived, `DPID_UNKNOWN` first, then the type. The login
   * server answers PRE_JOIN with PRE_JOIN; the cache server answers JOIN with the JOIN bundle; anything else (KEEP_ALIVE
   * answers, PING, the player's moves) gets no answer.
   */
  answer(role: 'login' | 'cache', body: Uint8Array): Uint8Array[];
  /** A SNAPSHOT bundle of `messages`, to push to the browser afterwards. */
  later(messages: ScriptMessage[]): Uint8Array;
}

/**
 * The pretend login and cache servers of a world entry (spec §3.1), for the e2e and unit tests: what the real ones send
 * when a character enters the world, played from a script and without a world server behind them.
 *
 * - PRE_JOIN is answered with a PRE_JOIN of no fields, as `CDPCoreClient::OnPreJoin` has the login server do once the
 *   core server lets the character in (`g_dpLoginSrvr.SendHdr( PACKETTYPE_PRE_JOIN, ... )`,
 *   `LOGINSERVER/DPCoreClient.cpp:103`).
 * - JOIN is answered with the bundle `CUser::Open` makes the first (`WORLDSERVER/User.cpp:308-349`): typed JOIN, the
 *   player's object ID in its header, WORLD_READINFO, the own ADD_OBJ; then, unlike the real server, which adds them in
 *   the snapshots that follow, the ADD_OBJs of the movers in view. The environment, game timer, task bar and the rest
 *   of `CUser::Open`'s messages are left out: the browser reads none of them.
 */
export function createWorldScript(o: WorldScriptOptions): WorldScript {
  const index = o.index ?? true;
  return {
    answer(role, body) {
      // The browser's bodies start with DPID_UNKNOWN (BEFORESENDSOLE), then the type.
      const r = new ArReader(body);
      r.u32();
      const type = r.u32();
      if (role === 'login' && type === PacketType.PRE_JOIN) return [new ArWriter().u32(PacketType.PRE_JOIN).toBytes()];
      if (role === 'cache' && type === PacketType.JOIN) {
        const messages = [writeWorldReadInfo(o.playerObjectId, o.worldId, o.pos), o.self, ...o.others];
        return [encodeBundle(PacketType.JOIN, o.playerObjectId, messages, { index })];
      }
      return [];
    },
    later(messages) {
      return encodeBundle(PacketType.SNAPSHOT, o.playerObjectId, messages, { index });
    },
  };
}

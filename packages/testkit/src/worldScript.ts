import { ArReader, ArWriter, PacketType } from '@flyffweb/protocol';
import type { Vec3 } from '@flyffweb/protocol';
import { encodeBundle, writeEnvironmentSetting, writeGameTimer, writeWorldReadInfo } from './world';
import type { ScriptMessage } from './world';

/** `SEASON_NONE` (`Resource/define.h:270`). */
const SEASON_NONE = 0;

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
 * - JOIN is answered with the bundle `CUser::Open` makes the first (`WORLDSERVER/User.cpp:308-349`), in its order:
 *   typed JOIN, the player's object ID in its header, the environment setting (the season, `SEASON_NONE`),
 *   WORLD_READINFO, the own ADD_OBJ, then the game timer, which stands for the rest of `CUser::Open`'s messages (the
 *   task bar, the environment, friends, guilds and so on) that the browser has no reader for. Then, unlike the real
 *   server, which adds them in the snapshots that follow, the ADD_OBJs of the movers in view.
 * - Without the table of contents (`index: false`, the old World.exe) the browser reads that bundle up to the own
 *   ADD_OBJ, whose reader skips the rest of its message, and with it the rest of the bundle: the movers in view of a
 *   script without a table are never seen. Send them with `later` instead, as the real server does.
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
        const own = o.playerObjectId;
        const messages = [
          writeEnvironmentSetting(own, SEASON_NONE), writeWorldReadInfo(own, o.worldId, o.pos), o.self, writeGameTimer(own, 0),
          ...o.others,
        ];
        return [encodeBundle(PacketType.JOIN, own, messages, { index })];
      }
      return [];
    },
    later(messages) {
      return encodeBundle(PacketType.SNAPSHOT, o.playerObjectId, messages, { index });
    },
  };
}

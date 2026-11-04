import {
  ArReader, CloseCode, MessageType, NULL_ID, PacketType, ProtocolError, WORLD_READERS, decodeLoginMessage, decodeWorldPacket,
  encodeAddAppletTaskBar, encodeAddItemTaskBar, encodeDestPos, encodeRemoveAppletTaskBar, encodeDoUseSkillPoint, encodeEndSkillQueue, encodeGetDestObj, encodeJoin,
  encodeMeleeAttack, encodeModifyStatus, encodePing, encodePlayerBehavior, encodePlayerCorr, encodePlayerMoved,
  encodePlayerSetDestObj, encodePreJoin, encodeRemoveItemTaskBar, encodeRevivalToLodestar, encodeSetTarget,
  encodeSkillTaskBar, encodeUseSkill, encodeWorldKeepAlive, readBundle,
  encodeUseItem, encodeEquipItem, encodeMoveItem, encodeDropItem, encodeRevival, encodeChat,
  encodeNpcDialog, encodeNpcDialogOpen, encodeOpenShop, encodeCloseShop, encodeBuyItem, encodeSellItem, encodeTeleporter,
  encodeNpcBuff, encodeQuestCheck, encodeEnchant, encodePiercing, encodeRandomScroll, encodeDoUseItemTarget,
  encodeUltimateEnchantWeapon, encodeQuerySetPlayerName, encodeSummonParty, encodeSummonPartyConfirm, encodeSummonFriend,
  encodeSummonFriendConfirm, encodeSummonFriendCancel, encodeDoUseItemInput, encodeChangeAttribute, encodeItemTransy,
  encodeCreateMonster, encodeRemoveQuest, encodeReturnScroll, encodeStateModeCancel,
} from '@flyffweb/protocol';
import { encodeMagicAttack, encodeRangeAttack, encodeSfxClear, encodeSfxHit, encodeSfxId } from '@flyffweb/protocol';
import {
  encodeAddPartyMember, encodeBlock, encodeChangeTroup, encodePartyChangeLeader, encodePartyExpMode, encodePartyItemMode,
  encodePartyMemberCancel, encodePartyMemberRequest, encodePartySkillUse, encodeQueryPlayerData, encodeRemovePartyMember,
  encodeMeleeAttack2, encodePlayerAngle, encodePlayerBehavior2, encodePlayerCorr2, encodePlayerMoved2,
} from '@flyffweb/protocol';
import type { PartyRequestSide } from '@flyffweb/protocol';
import type { BundleMessage, BundleResult, MoveReport, Shortcut, SkillSlot, Vec3, WorldMessage } from '@flyffweb/protocol';
import type { AngleReport, FlightReport } from '@flyffweb/protocol';
import { UNEXPECTED_PROBLEM, closeText, errorText } from '../lobby/errorText';
import { GATEWAY_UNREACHABLE, PING_INTERVAL_MS, TIMEOUT_TEXT, systemClock } from '../lobby/LoginFlow';
import type { FlowClock, WorldEntry } from '../lobby/LoginFlow';
import type { OpenChannel, PacketChannel } from '../net/PacketChannel';

/**
 * What the world screen is told. After `ended`, both connections are closed and nothing more comes. `messages` of the
 * first event are the JOIN bundle's, the WORLD_READINFO and the own ADD_OBJ among them.
 */
export type WorldEvent =
  | { type: 'entered'; worldId: number; pos: Vec3; playerObjectId: number; messages: BundleMessage<WorldMessage>[] }
  | { type: 'transition'; worldId: number; pos: Vec3 }
  | { type: 'messages'; messages: BundleMessage<WorldMessage>[] }
  | { type: 'ended'; message: string };

/**
 * What the bundles looked like, for the overlay. `indexed` counts the bundles that had a valid table of contents, `skipped`
 * the messages of a type nothing reads (in a bundle without a table, the one that ended it too), `mismatched` the messages
 * whose reader did not end where the table says (and the own ADD_OBJs whose inventory could not be read, which are kept),
 * `unknownPackets` the top-level packets of a type this does not know, and `droppedEvents` the drawing events of the
 * messages that the world dropped untaken (`WorldChanges.dropped`: a hidden tab draws nothing for a long time).
 */
export interface SessionStats {
  bundles: number;
  indexed: number;
  skipped: number;
  mismatched: number;
  unknownPackets: number;
  droppedEvents: number;
}

/** Neuz waits a second between connecting to the cache server and PRE_JOIN (`g_Neuz.m_timerConnect.Set( SEC( 1 ) )`, `_Interface/WndTitle.cpp:2123`). */
const CACHE_PAUSE_MS = 1000;
/** PRE_JOIN gets 15 s (`CWndSelectChar::Connected`, `_Interface/WndTitle.cpp:1980`, `m_dwTimeOutDis`). */
const PRE_JOIN_TIMEOUT_MS = 15000;
/** JOIN gets 25 s from its sending (`CDPLoginClient::OnPreJoin`, `Neuz/DPLoginClient.cpp:222`). */
const JOIN_TIMEOUT_MS = 25000;

const LOST_TEXT = 'The connection to the game was lost.';
// The world server closes both sessions when it finds the character already in the world (`CDPSrvr::OnAddUser`) and says nothing why.
// Exported for the live world test, which tries again when a session ends with it.
export const JOIN_CLOSED_TEXT =
  'The game closed the connection. If this character was still in the game from an earlier session, wait a moment and try again.';
const MAX_TRANSITION_MESSAGES = 4096;
const BAD_DATA_TEXT = closeText(CloseCode.BAD_SERVER_DATA);

/**
 * The gateway's close codes that name their cause; they keep the lobby's text. The others (the server ending the
 * connection, 4002, and a dropped network, 1000 and 1006) are the step's own message.
 */
const GATEWAY_CAUSES: ReadonlySet<number> = new Set([
  CloseCode.SERVER_UNREACHABLE, CloseCode.NOT_ALLOWED, CloseCode.LIMIT, 1009, CloseCode.BAD_SERVER_DATA, CloseCode.FORBIDDEN_PACKET,
  CloseCode.TOO_MANY_CONNECTIONS, CloseCode.TOO_MANY_NEW_CONNECTIONS, CloseCode.GATEWAY_FULL,
]);

/**
 * Where the session is: `opening` (the cache channel is not open yet), `pausing` (the 1 s pause), `preJoin` and `join` (that
 * packet is sent, its answer awaited), `playing`, and `over` (ended or left: nothing is emitted or sent from here on).
 */
type Phase = 'opening' | 'pausing' | 'preJoin' | 'join' | 'playing' | 'transition' | 'over';

const hex = (n: number, width: number): string => `0x${n.toString(16).padStart(width, '0')}`;

/** The world and position of the first WORLD_READINFO of a bundle. */
function worldReadInfo(messages: BundleMessage<WorldMessage>[]): { worldId: number; pos: Vec3 } | undefined {
  for (const m of messages) if (m.value.type === 'worldReadInfo') return m.value;
  return undefined;
}

/** The position in a top-level REPLACE (type, world, position); `decodeWorldPacket` keeps only its world. */
function replacePosition(body: Uint8Array): Vec3 {
  const r = new ArReader(body);
  r.u32();
  r.u32();
  return r.vec3();
}

/**
 * The player's side of entering the world and playing in it, as a state machine over two channels: the login-server
 * connection the lobby hands over (PRE_JOIN, PING) and the cache-server connection it opens (JOIN, the bundles,
 * KEEP_ALIVE, the player's moves). Built like `LoginFlow`: channels from the injected `OpenChannel`, a clock to inject,
 * no DOM. The world screen listens to `emit` and drives `sendMoved` and the rest.
 *
 * Every ending closes both connections first and then emits one `ended` event with the text to show; `leave` closes them
 * too, without an event. Afterwards nothing is emitted or sent. The session does not throw out of a channel callback: a
 * packet it cannot read ends it with the bad-data text.
 */
export class WorldSession {
  sendTeleporter(key: string, index: number): void { this.playingCache()?.send(encodeTeleporter(key, index)); }
  /** 2026-11-05: the upgrade cursor's packets (world/upgrade.ts in the protocol): each two inventory object ids. */
  sendUpgrade(packet: 'enchant' | 'ultimateEnchantWeapon' | 'piercing' | 'randomScroll' | 'doUseItemTarget', first: number, second: number): void {
    const encode = { enchant: encodeEnchant, ultimateEnchantWeapon: encodeUltimateEnchantWeapon, piercing: encodePiercing,
      randomScroll: encodeRandomScroll, doUseItemTarget: encodeDoUseItemTarget }[packet];
    this.playingCache()?.send(encode(first, second));
  }
  /** 2026-11-05: the item windows' packets (world/itemWindows.ts in the protocol). */
  sendQuerySetPlayerName(objectId: number, name: string): void { this.playingCache()?.send(encodeQuerySetPlayerName(objectId, name)); }
  sendSummonParty(objectId: number): void { this.playingCache()?.send(encodeSummonParty(objectId)); }
  sendSummonPartyConfirm(leaderId: number, data: number): void { this.playingCache()?.send(encodeSummonPartyConfirm(leaderId, data)); }
  sendSummonFriend(data: number, name: string): void { this.playingCache()?.send(encodeSummonFriend(data, name)); }
  sendSummonFriendAnswer(yes: boolean, summonerId: number, data: number): void {
    this.playingCache()?.send(yes ? encodeSummonFriendConfirm(summonerId, data) : encodeSummonFriendCancel(summonerId, data));
  }
  sendDoUseItemInput(objectId: number, input: string): void { this.playingCache()?.send(encodeDoUseItemInput(objectId, input)); }
  sendChangeAttribute(targetId: number, scrollId: number, element: number): void {
    this.playingCache()?.send(encodeChangeAttribute(targetId, scrollId, element));
  }
  sendItemTransy(targetId: number, scrollId: number, newItemId: number): void {
    this.playingCache()?.send(encodeItemTransy(targetId, scrollId, newItemId));
  }
  sendCreateMonster(objectId: number, pos: Vec3): void { this.playingCache()?.send(encodeCreateMonster(objectId, pos)); }
  /** 2026-11-05: Buff Pang's Get Buffed! (`SendNPCBuff( m_szCharacterKey )`), the key as the NPC's ADD_OBJ gave it. */
  sendNpcBuff(key: string): void { this.playingCache()?.send(encodeNpcBuff(key)); }
  sendNpcDialogOpen(id: number): void { this.playingCache()?.send(encodeNpcDialogOpen(id)); }
  sendNpcDialog(id: number, key: string, param: number, quest: number, playerId: number): void {
    this.playingCache()?.send(encodeNpcDialog(id, key, param, quest, playerId));
  }
  sendRemoveQuest(questId: number): void { this.playingCache()?.send(encodeRemoveQuest(questId)); }
  sendQuestCheck(questId: number, check: boolean): void { this.playingCache()?.send(encodeQuestCheck(questId, check)); }
  sendOpenShop(id: number): void { this.playingCache()?.send(encodeOpenShop(id)); }
  sendCloseShop(): void { this.playingCache()?.send(encodeCloseShop()); }
  sendBuyItem(tab: number, id: number, count: number, itemId: number): void { this.playingCache()?.send(encodeBuyItem(tab, id, count, itemId)); }
  sendSellItem(id: number, count: number): void { this.playingCache()?.send(encodeSellItem(id, count)); }
  sendChat(channel: import('@flyffweb/protocol').ChatChannel, text: string, target = ''): void {
    this.playingCache()?.send(encodeChat(channel, text, target));
  }
  /**
   * DOUSEITEM: `part` and `flightSpeed` are the prop's `dwParts` and `fFlightSpeed` for a ride (Piece 7 M5); `targetId`
   * the focused mover (2026-11-05), NULL_ID with none.
   */
  sendUseItem(objectId: number, part = -1, flightSpeed = -1, targetId: number = NULL_ID): void {
    this.playingCache()?.send(encodeUseItem(objectId, part, flightSpeed, targetId));
  }
  /** Piece 7 M3: the item cast's cancel (`SendStateModeCancel`). */
  sendStateModeCancel(): void { this.playingCache()?.send(encodeStateModeCancel()); }
  /** Piece 7 M3: the Scroll of Return's village (0-2) or the way back (-1) (`SendReturnScroll`). */
  sendReturnScroll(select: number): void { this.playingCache()?.send(encodeReturnScroll(select)); }
  sendEquipItem(objectId: number, part = -1, flightSpeed = -1): void {
    this.playingCache()?.send(encodeEquipItem(objectId, part, flightSpeed));
  }
  sendMoveItem(source: number, destination: number): void { this.playingCache()?.send(encodeMoveItem(source, destination)); }
  sendDropItem(objectId: number, count: number, pos: Vec3): void { this.playingCache()?.send(encodeDropItem(objectId, count, pos)); }
  sendRevival(): void { this.playingCache()?.send(encodeRevival()); }
  // Piece 7 M4: the party packets ([R §2]), with the own player id Neuz writes first (`g_pPlayer->m_idPlayer`)
  sendPartyMemberRequest(targetId: number): void { this.playingCache()?.send(encodePartyMemberRequest(this.ownPlayerId(), targetId)); }
  sendPartyMemberCancel(leaderId: number, memberId: number, mode: number): void {
    this.playingCache()?.send(encodePartyMemberCancel(leaderId, memberId, mode));
  }
  sendAddPartyMember(leader: PartyRequestSide, member: PartyRequestSide): void { this.playingCache()?.send(encodeAddPartyMember(leader, member)); }
  sendRemovePartyMember(leaveId: number): void { this.playingCache()?.send(encodeRemovePartyMember(this.ownPlayerId(), leaveId)); }
  sendChangeTroup(name: string): void { this.playingCache()?.send(encodeChangeTroup(this.ownPlayerId(), name)); }
  sendPartyChangeLeader(newLeaderId: number): void { this.playingCache()?.send(encodePartyChangeLeader(this.ownPlayerId(), newLeaderId)); }
  sendPartyItemMode(mode: number): void { this.playingCache()?.send(encodePartyItemMode(this.ownPlayerId(), mode)); }
  sendPartyExpMode(mode: number): void { this.playingCache()?.send(encodePartyExpMode(this.ownPlayerId(), mode)); }
  sendPartySkillUse(skill: number): void { this.playingCache()?.send(encodePartySkillUse(this.ownPlayerId(), skill)); }
  /** BLOCK 7 (`DPClient.cpp:4572`): an invite came while the invite box was open. */
  sendBlock(inviterName: string): void { this.playingCache()?.send(encodeBlock(7, this.entry.character.name, inviterName)); }
  sendQueryPlayerData(playerId: number): void { this.playingCache()?.send(encodeQueryPlayerData(playerId)); }
  private ownPlayerId(): number { return this.entry.character.playerId; }
  readonly stats: SessionStats = { bundles: 0, indexed: 0, skipped: 0, mismatched: 0, unknownPackets: 0, droppedEvents: 0 };
  private phase: Phase = 'opening';
  private started = false;
  private cache: PacketChannel | undefined;
  /** JOIN, made by `start` with PRE_JOIN so that a name the wire cannot carry fails before anything is opened. */
  private joinPacket: Uint8Array | undefined;
  /** The world the player is in, or the destination being entered. */
  private worldId: number;
  private destination: { pos: Vec3; messages: BundleMessage<WorldMessage>[] } | undefined;
  /** The timer of the step in flight: the pause, or the wait for the PRE_JOIN or JOIN answer. */
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pingTimer: ReturnType<typeof setTimeout> | undefined;
  /** What was logged already, so that a type is named once per session. */
  private readonly warned = new Set<string>();

  /**
   * Takes over the login-server connection at once: `onPacket` and `onClose` are set here, since the lobby's flow
   * ignores that channel after the hand-over, and the 10 s PING goes on from the lobby's.
   */
  constructor(
    private readonly open: OpenChannel,
    private readonly entry: WorldEntry,
    private readonly emit: (event: WorldEvent) => void,
    private readonly clock: FlowClock = systemClock,
  ) {
    this.worldId = entry.character.worldId;
    entry.login.onPacket = (body) => {
      if (!this.over) this.guarded(() => this.onLoginPacket(body));
    };
    entry.login.onClose = (code) => {
      if (!this.over) this.end(this.closedText(code));
    };
    this.startPing();
  }

  /**
   * Steps 2-5 of entering: opens the cache connection, waits a second, sends PRE_JOIN on the login connection, and JOIN
   * on the cache connection once PRE_JOIN is answered. Resolves when the cache connection is open and the pause has begun;
   * the rest arrives as events (`entered`, `ended`). PRE_JOIN gets 15 s and JOIN 25 s, each from its sending. The browser
   * does not send the cache server's address packet: the gateway does. Does nothing after `leave` or an ending, or a second time.
   */
  async start(): Promise<void> {
    if (this.started || this.over) return;
    this.started = true;
    const { account, character, passwordHash, authKey, channelId, messenger } = this.entry;
    let preJoin: Uint8Array;
    try {
      preJoin = encodePreJoin(account, character.playerId, character.name);
      this.joinPacket = encodeJoin({
        worldId: character.worldId, playerId: character.playerId, authKey, partyId: character.partyId, guildId: character.guildId,
        warId: character.warId, channelId, slot: character.slot, name: character.name, account, passwordHash, messenger,
      });
    } catch (error) {
      if (!(error instanceof ProtocolError)) throw error;
      // A character name outside printable ASCII: the same packet would fail again, but the player has nothing else to try.
      this.end(UNEXPECTED_PROBLEM);
      return;
    }
    let cache: PacketChannel;
    try {
      cache = await this.open(this.entry.cacheTarget);
    } catch {
      this.end(closeText(GATEWAY_UNREACHABLE));
      return;
    }
    if (this.over) {
      cache.close();
      return;
    }
    this.cache = cache;
    cache.onPacket = (body) => {
      if (!this.over) this.guarded(() => this.onCachePacket(body));
    };
    cache.onClose = (code) => {
      // The server closing the connection after JOIN is how the world server turns away a character that is still in the world.
      if (!this.over) this.end(this.closedText(code, this.phase === 'join'));
    };
    this.phase = 'pausing';
    this.timer = this.clock.setTimeout(() => {
      this.timer = undefined;
      this.phase = 'preJoin';
      this.entry.login.send(preJoin);
      this.startTimer(PRE_JOIN_TIMEOUT_MS);
    }, CACHE_PAUSE_MS);
  }

  /** PLAYERMOVED (`CDPClient::SendPlayerMoved`). Sent only while playing. */
  sendMoved(m: MoveReport): void {
    this.playingCache()?.send(encodePlayerMoved(m));
  }

  /** PLAYERBEHAVIOR (`CDPClient::SendPlayerBehavior`). Sent only while playing. */
  sendBehavior(m: MoveReport): void {
    this.playingCache()?.send(encodePlayerBehavior(m));
  }

  /**
   * PLAYERCORR (`CDPClient::SendPlayerCorr`): where a walk met something or began to fall, the own character's state then
   * (`SimMover.corrReport`). Sent only while playing.
   */
  sendCorr(m: MoveReport): void {
    this.playingCache()?.send(encodePlayerCorr(m));
  }

  /** Piece 7 M5: PLAYERMOVED2 (`CDPClient::SendPlayerMoved2`), the flier's predicted report and `nFrame`. */
  sendMoved2(r: FlightReport, frames: number): void {
    this.playingCache()?.send(encodePlayerMoved2(r, frames));
  }

  /** Piece 7 M5: PLAYERBEHAVIOR2 (`CDPClient::SendPlayerBehavior2`). */
  sendBehavior2(r: FlightReport): void {
    this.playingCache()?.send(encodePlayerBehavior2(r));
  }

  /** Piece 7 M5: PLAYERCORR2 (`CDPClient::SendPlayerCorr2`), with Neuz's turn angle in the pitch's slot. */
  sendCorr2(r: FlightReport): void {
    this.playingCache()?.send(encodePlayerCorr2(r));
  }

  /** Piece 7 M5: PLAYERANGLE (`CDPClient::FlushPlayerAngle`). */
  sendAngle(r: AngleReport): void {
    this.playingCache()?.send(encodePlayerAngle(r));
  }

  /** Piece 7 M5: MELEE_ATTACK2 (`CDPClient::SendMeleeAttack2`), the air attack. */
  sendMeleeAttack2(message: number, targetId: number): void {
    this.playingCache()?.send(encodeMeleeAttack2(message, targetId));
  }

  /** The client's SNAPSHOT with one DESTPOS (`CDPClient::SendSnapshot`): a click-to-move. Sent only while playing. */
  sendDestPos(pos: Vec3, forward: boolean): void {
    this.playingCache()?.send(encodeDestPos(pos, forward));
  }

  /**
   * SETTARGET (`CDPClient::SendSetTarget`, `Neuz/DPClient.cpp:9886`): `clear` 1 releases the target, 2 focuses it
   * (`NULL_ID` with 2 clears the focus). Sent only while playing.
   */
  sendSetTarget(targetId: number, clear: 1 | 2): void {
    this.playingCache()?.send(encodeSetTarget(targetId, clear));
  }

  /**
   * PLAYERSETDESTOBJ (`CDPClient::SendPlayerDestObj`, `Neuz/DPClient.cpp:10923`): the object to walk to and the range to
   * stop at (0 for a melee attack). Sent only while playing.
   */
  sendDestObj(targetId: number, range: number): void {
    this.playingCache()?.send(encodePlayerSetDestObj(targetId, range));
  }

  /**
   * MELEE_ATTACK (`CDPClient::SendMeleeAttack`, `Neuz/DPClient.cpp:9819`): the `OBJMSG_ATK*`, the target, and the held
   * item's `fAttackSpeed` as the server compares it. Sent only while playing.
   */
  sendMeleeAttack(message: number, targetId: number, attackSpeed: number): void {
    this.playingCache()?.send(encodeMeleeAttack(message, targetId, attackSpeed));
  }

  /** MAGIC_ATTACK (`CDPClient::SendMagicAttack`, `DPClient.cpp:9841`): the wand's shot. Sent only while playing. */
  sendMagicAttack(targetId: number, power: number, sfxHitId: number): void {
    this.playingCache()?.send(encodeMagicAttack(targetId, power, sfxHitId));
  }

  /** RANGE_ATTACK (`CDPClient::SendRangeAttack`, `DPClient.cpp:9848`): the bow's shot. Sent only while playing. */
  sendRangeAttack(targetId: number, power: number, sfxHitId: number): void {
    this.playingCache()?.send(encodeRangeAttack(targetId, power, sfxHitId));
  }

  /** SFX_ID (`CDPClient::SendSfxID`, `DPClient.cpp:9876`): a missile of the own player's. Sent only while playing. */
  sendSfxId(targetId: number, sfxHitId: number, type: number, skill?: number, maxDmgCnt?: number): void {
    this.playingCache()?.send(encodeSfxId(targetId, sfxHitId, type, skill, maxDmgCnt));
  }

  /** SFX_HIT (`CDPClient::SendSfxHit`, `DPClient.cpp:11230`): a missile landed. Sent only while playing. */
  sendSfxHit(sfxHitId: number, power: number, skill: number, attackerId: number, dmgCnt = 0, dmgAngle = 0, dmgPower = 0): void {
    this.playingCache()?.send(encodeSfxHit(sfxHitId, power, skill, attackerId, dmgCnt, dmgAngle, dmgPower));
  }

  /** SFX_CLEAR (`CDPClient::SendSfxClear`, `DPClient.cpp:11238`): a missile lost. Sent only while playing. */
  sendSfxClear(sfxHitId: number, moverId: number): void {
    this.playingCache()?.send(encodeSfxClear(sfxHitId, moverId));
  }

  /**
   * GETDESTOBJ (`CDPClient::SendGetDestObj`, `Neuz/DPClient.cpp:10941`): the answer to QUERYGETDESTOBJ, with the object
   * ID the query named and the player's own destination. Sent only while playing.
   */
  sendGetDestObj(fromId: number, destId: number): void {
    this.playingCache()?.send(encodeGetDestObj(fromId, destId));
  }

  /** REVIVAL_TO_LODESTAR (`CDPClient::SendHdr`, `Neuz/DPClient.cpp:11253`): revive at the lodestar. Sent only while playing. */
  sendRevivalToLodestar(): void {
    this.playingCache()?.send(encodeRevivalToLodestar());
  }

  /**
   * MODIFY_STATUS (`CDPClient::SendModifyStatus`, `Neuz/DPClient.cpp:16652`): the stat points to add to STR, STA, DEX and
   * INT. Sent only while playing.
   */
  sendModifyStatus(counts: { str: number; sta: number; dex: number; int: number }): void {
    this.playingCache()?.send(encodeModifyStatus(counts));
  }

  // The skill and task-bar packets (milestone 2). Their encoders throw a ProtocolError for a value the server's own bounds
  // would drop without a reply (an index outside m_aJobSkill, a slot outside the bars, more than 5 queue entries): the
  // callers pass only the player's own skill slots and the bars' fixed grid, and never call these from a packet's
  // handling (`guarded`), where a throw would end the session as the server's fault.

  /**
   * USESKILL (`CDPClient::SendUseSkill`, `Neuz/DPClient.cpp:9855`): the index of the skill in `m_aJobSkill` (0-44), the
   * target, `SUT_NORMAL` 0 (a bar slot) or `SUT_QUEUESTART` 1 (the action slot), and the Ctrl key. Sent only while playing.
   */
  sendUseSkill(index: number, targetId: number, useType: 0 | 1, control = false): void {
    this.playingCache()?.send(encodeUseSkill(index, targetId, useType, control));
  }

  /**
   * DOUSESKILLPOINT (`CDPClient::SendDoUseSkillPoint`, `Neuz/DPClient.cpp:9710`): the 45 slots, the player's own skill IDs
   * with the levels the skill window set. Sent only while playing.
   */
  sendDoUseSkillPoint(skills: readonly SkillSlot[]): void {
    this.playingCache()?.send(encodeDoUseSkillPoint(skills));
  }

  /**
   * ADDITEMTASKBAR (`CDPClient::SendAddItemTaskBar`, `Neuz/DPClient.cpp:11014`): `shortcut` into slot `slot` (0-8) of item
   * bar `bar` (0-7). Sent only while playing.
   */
  sendAddItemTaskBar(bar: number, slot: number, shortcut: Shortcut): void {
    this.playingCache()?.send(encodeAddItemTaskBar(bar, slot, shortcut));
  }

  /** ADDAPPLETTASKBAR (`CDPClient::SendAddAppletTaskBar`, `Neuz/DPClient.cpp:11002`): `shortcut` into applet slot `slot`. */
  sendAddAppletTaskBar(slot: number, shortcut: Shortcut): void {
    this.playingCache()?.send(encodeAddAppletTaskBar(slot, shortcut));
  }

  /** REMOVEAPPLETTASKBAR (`CDPClient::SendRemoveAppletTaskBar`, `Neuz/DPClient.cpp:10996`): applet slot `slot` emptied. */
  sendRemoveAppletTaskBar(slot: number): void {
    this.playingCache()?.send(encodeRemoveAppletTaskBar(slot));
  }

  /** REMOVEITEMTASKBAR (`CDPClient::SendRemoveItemTaskBar`, `Neuz/DPClient.cpp:11008`): slot `slot` of item bar `bar` emptied. Sent only while playing. */
  sendRemoveItemTaskBar(bar: number, slot: number): void {
    this.playingCache()?.send(encodeRemoveItemTaskBar(bar, slot));
  }

  /**
   * SKILLTASKBAR (`CDPClient::SendSkillTaskBar`, `Neuz/DPClient.cpp:10972`): the action slot's 5 slots, `queue[i]` slot `i`
   * (null, or left out, for an empty one). Sent only while playing.
   */
  sendSkillTaskBar(queue: ReadonlyArray<Shortcut | null>): void {
    this.playingCache()?.send(encodeSkillTaskBar(queue));
  }

  /** ENDSKILLQUEUE (`CDPClient::SendEndSkillQueue`, `Neuz/DPClient.cpp:15819`): stop the action slot's chain. Sent only while playing. */
  sendEndSkillQueue(): void {
    this.playingCache()?.send(encodeEndSkillQueue());
  }

  /**
   * Counts `count` drawing events the world dropped untaken (`WorldChanges.dropped`), named once in the console as the
   * session names what its bundles lose; the world screen names it on the overlay.
   */
  countDroppedEvents(count: number): void {
    if (count <= 0) return;
    this.stats.droppedEvents += count;
    this.warnOnce('dropped', 'drawing events of the messages were dropped untaken (the page was hidden for a long time)');
  }

  /**
   * The player leaves the world: closes the cache and login connections, as Neuz does after logging out (the world
   * server saves the character when the cache server reports the closed connection). No event follows, and nothing
   * that arrives or runs later does anything.
   */
  leave(): void {
    this.close();
  }

  /** Read through a getter, so that a check after an `await` is not narrowed away from what `leave` did meanwhile. */
  private get over(): boolean {
    return this.phase === 'over';
  }

  private playingCache(): PacketChannel | undefined {
    return this.phase === 'playing' ? this.cache : undefined;
  }

  /** The text for a channel that closed: the gateway's own cause, else the step's message. */
  private closedText(code: number, awaitingJoin = false): string {
    if (GATEWAY_CAUSES.has(code)) return closeText(code);
    return awaitingJoin ? JOIN_CLOSED_TEXT : LOST_TEXT;
  }

  private onLoginPacket(body: Uint8Array): void {
    const message = decodeLoginMessage(body);
    switch (message.type) {
      case 'preJoin':
        // CDPLoginClient::OnPreJoin (Neuz/DPLoginClient.cpp:204): the answer is the cue for JOIN.
        if (this.phase !== 'preJoin' || this.cache === undefined || this.joinPacket === undefined) break;
        this.cache.send(this.joinPacket);
        this.phase = 'join';
        this.startTimer(JOIN_TIMEOUT_MS);
        break;
      case 'error':
        this.end(errorText(message.code));
        break;
      case 'unknown':
        this.warnOnce(`login ${message.packetType}`, `unknown login-server packet ${hex(message.packetType, 8)}`);
        break;
      // Known packets that nothing in the world needs.
      case 'playerList':
      case 'cacheAddr':
      case 'queryTickCount':
      case 'ping':
      case 'oneHourNotify':
      case 'loginNumPad':
      case 'loginProtect':
        break;
    }
  }

  private onCachePacket(body: Uint8Array): void {
    let packet: ReturnType<typeof decodeWorldPacket>;
    try { packet = decodeWorldPacket(body); }
    catch (error) {
      if (error instanceof ProtocolError && body.byteLength >= 4 && new DataView(body.buffer, body.byteOffset, body.byteLength).getUint32(0, true) === 0xff00d4) {
        this.stats.mismatched++; this.warnOnce('whisper', 'Ignored a malformed whisper packet.'); return;
      }
      throw error;
    }
    switch (packet.type) {
      case 'definedText':
      case 'guild':
      case 'system':
      case 'whisper':
        if (this.phase === 'playing') this.notify({ type: 'messages', messages: [{ objectId: NULL_ID, type: packet.type === 'guild' ? 0xffffff39 : packet.type === 'system' ? 0xff00ed : packet.type === 'definedText' ? 0xff00ec : 0xff00d4, value: packet }] });
        break;
      case 'setPlayerName':
        // 2026-11-05: the name change's answer, a packet of its own, handed on as the direct chat packets are
        if (this.phase === 'playing') {
          this.notify({ type: 'messages', messages: [{ objectId: NULL_ID, type: PacketType.QUERYSETPLAYERNAME, value: packet }] });
        }
        break;
      case 'errorParty':
      case 'updatePlayerData':
      case 'playerLogout':
      case 'block': {
        // Piece 7 M4: the core's direct party packets ([R §1.2]), handed on as the direct chat packets are
        const type = packet.type === 'errorParty' ? PacketType.ERRORPARTY : packet.type === 'updatePlayerData'
          ? PacketType.UPDATE_PLAYER_DATA : packet.type === 'playerLogout' ? PacketType.LOGOUT : PacketType.BLOCK;
        if (this.phase === 'playing') this.notify({ type: 'messages', messages: [{ objectId: NULL_ID, type, value: packet }] });
        break;
      }
      case 'keepAlive':
        // CDPClient::OnKeepAlive (Neuz/DPClient.cpp:961): answered at once, from the callback.
        this.cache?.send(encodeWorldKeepAlive());
        break;
      case 'error':
        this.end(errorText(packet.code));
        break;
      case 'replace':
        if (this.phase === 'playing' || this.phase === 'transition') {
          const value = { type: 'replace', worldId: packet.worldId, pos: replacePosition(body) } as const;
          this.dispatchMessages([{ objectId: NULL_ID, type: MessageType.REPLACE, value }], NULL_ID);
        }
        break;
      case 'join':
        // CDPClient::OnJoin (:897) is OnSnapshot for the first bundle. A later bundle typed JOIN (`CAr::ReelIn` after a JOIN over 16 KB) is an ordinary one.
        if (this.phase === 'join' || this.phase === 'playing' || this.phase === 'transition') this.onBundle(body);
        break;
      case 'snapshot':
        if (this.phase === 'playing' || this.phase === 'transition') this.onBundle(body);
        break;
      case 'unknown':
        this.stats.unknownPackets++;
        this.warnOnce(`packet ${packet.packetType}`, `unknown game-server packet ${hex(packet.packetType, 8)}`);
        break;
    }
  }

  /** A JOIN or SNAPSHOT bundle: the first one, while `join` is awaited, enters the world. */
  private onBundle(body: Uint8Array): void {
    const bundle = readBundle(body, WORLD_READERS);
    this.count(bundle);
    const { messages } = bundle;
    // The first bundle names the world and the position (`info`); without that the session cannot start.
    const entering = this.phase === 'join';
    const info = entering ? worldReadInfo(messages) : undefined;
    if (entering) {
      if (info === undefined) {
        console.warn('the JOIN bundle has no WORLD_READINFO');
        this.end(BAD_DATA_TEXT);
        return;
      }
      this.worldId = info.worldId;
    }
    if (info !== undefined) {
      this.stopTimer();
      this.phase = 'playing';
      const split = messages.findIndex(m => m.value.type === 'replace' && m.value.worldId !== this.worldId);
      this.notify({ type: 'entered', worldId: info.worldId, pos: info.pos, playerObjectId: bundle.playerObjectId,
        messages: split < 0 ? messages : messages.slice(0, split) });
      if (split >= 0) this.dispatchMessages(messages.slice(split), bundle.playerObjectId);
    } else {
      this.dispatchMessages(messages, bundle.playerObjectId);
    }
  }

  /** Native AddReplace is flushed before AddAddObj; the own mover may arrive in a later snapshot. */
  private dispatchMessages(messages: BundleMessage<WorldMessage>[], playerObjectId: number): void {
    let batch: BundleMessage<WorldMessage>[] = [];
    const flush = () => {
      if (batch.length === 0 || this.over) return;
      const destination = this.destination;
      if (destination === undefined) this.notify({ type: 'messages', messages: batch });
      else {
        if (destination.messages.length + batch.length > MAX_TRANSITION_MESSAGES) { this.end(BAD_DATA_TEXT); return; }
        destination.messages.push(...batch);
        if (destination.messages.some(m => m.value.type === 'addMover' && m.value.mover.player?.self === true)) {
          this.destination = undefined;
          this.stopTimer();
          this.phase = 'playing';
          this.notify({ type: 'entered', worldId: this.worldId, pos: destination.pos, playerObjectId, messages: destination.messages });
        }
      }
      batch = [];
    };
    for (const message of messages) {
      if (this.over) return;
      const value = message.value;
      if (value.type === 'replace' && value.worldId !== this.worldId) {
        flush();
        if (this.over) return;
        if (value.worldId === 0 || value.worldId === NULL_ID || !value.pos.every(Number.isFinite)) {
          this.end(BAD_DATA_TEXT); return;
        }
        this.worldId = value.worldId;
        this.destination = { pos: value.pos, messages: [] };
        this.phase = 'transition';
        this.startTimer(JOIN_TIMEOUT_MS);
        this.notify({ type: 'transition', worldId: value.worldId, pos: value.pos });
      } else batch.push(message);
    }
    flush();
  }

  /**
   * Counts a bundle and names, once each, the types the reader could not make sense of. An own ADD_OBJ whose inventory
   * could not be read is kept, its numbers being good, and counted as a mismatch all the same (Ruling R1).
   */
  private count(bundle: BundleResult<WorldMessage>): void {
    this.stats.bundles++;
    if (bundle.indexed) this.stats.indexed++;
    this.stats.skipped += bundle.skipped.length;
    this.stats.mismatched += bundle.mismatched.length;
    for (const type of bundle.mismatched) {
      this.warnOnce(`type ${type}`, `message type ${hex(type, 4)} did not end where the bundle's table of contents says; its messages are dropped`);
    }
    for (const { value } of bundle.messages) {
      const error = value.type === 'addMover' ? value.mover.player?.own?.inventoryError ?? null : null;
      if (error === null) continue;
      this.stats.mismatched++;
      this.warnOnce('inventory', `the own character's inventory could not be read (${error}); the rest of its ADD_OBJ is kept`);
    }
    if (bundle.stoppedAt !== null) {
      this.warnOnce(`type ${bundle.stoppedAt}`, `a bundle without a table of contents stopped at message type ${hex(bundle.stoppedAt, 4)}; the rest of it is dropped`);
    }
  }

  private warnOnce(key: string, text: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn(text);
  }

  /**
   * Tells the listener. A listener that throws is its own bug, not the server's: it is logged and the session carries
   * on, so the throw cannot escape the channel callback this runs in, nor be taken for a bad packet.
   */
  private notify(event: WorldEvent): void {
    try {
      this.emit(event);
    } catch (error) {
      console.error(`a world listener threw on a ${event.type} event:`, error);
    }
  }

  /** Runs the handling of one packet; whatever it throws (a body or table the readers reject) ends the session instead of escaping the channel's callback. */
  private guarded(handle: () => void): void {
    try {
      handle();
    } catch (error) {
      // A ProtocolError message holds offsets and lengths, never packet contents.
      console.warn('could not process a server packet:', error instanceof Error ? error.message : String(error));
      this.end(BAD_DATA_TEXT);
    }
  }

  private startTimer(ms: number): void {
    this.stopTimer();
    this.timer = this.clock.setTimeout(() => {
      this.timer = undefined;
      this.end(TIMEOUT_TEXT);
    }, ms);
  }

  private stopTimer(): void {
    if (this.timer !== undefined) this.clock.clearTimeout(this.timer);
    this.timer = undefined;
  }

  /** Sets the next PING to the login server, 10 s from now; each one sets the next (`CDPLoginClient`'s `m_timer`, as in `LoginFlow`). */
  private startPing(): void {
    this.pingTimer = this.clock.setTimeout(() => {
      this.pingTimer = undefined;
      this.entry.login.send(encodePing(this.clock.now()));
      this.startPing();
    }, PING_INTERVAL_MS);
  }

  /** Closes both connections and stops the timers, once; whatever the channels report afterwards is ignored. */
  private close(): void {
    if (this.over) return;
    this.phase = 'over';
    this.destination = undefined;
    this.joinPacket = undefined; // it holds the password hash (Piece 6 M3)
    this.stopTimer();
    if (this.pingTimer !== undefined) this.clock.clearTimeout(this.pingTimer);
    this.pingTimer = undefined;
    this.cache?.close();
    this.entry.login.close();
  }

  /** Ends the session with the text to show. Everything is closed first, so a screen that reacts by starting over finds nothing open. */
  private end(message: string): void {
    if (this.over) return;
    this.close();
    this.notify({ type: 'ended', message });
  }
}

// One bot in the world: the live world test's headless player (apps/client/test/world.live.test.ts, `Player`) made
// reusable. The lobby, the world session, the world and its rules, the own mover's driving, the focus, the attack loop,
// the skill use, item use and the headless views of the movers, as the world screen wires them, without a screen.
// No keys are ever held and nothing is tapped: the roles drive it through `walkTo`, the attack loop and the session.
import type { WorldManifest } from '@flyffweb/formats';
import { NULL_ID } from '@flyffweb/protocol';
import type { AddedMover, BundleMessage, CharacterSummary, WorldMessage } from '@flyffweb/protocol';
import type { CollisionShapes, MoveIntent } from '@flyffweb/scene';
import { DiskAssets, Terrain } from '@flyffweb/client/src/headless/diskAssets';
import { headlessViews } from '@flyffweb/client/src/headless/headlessViews';
import { Link } from '@flyffweb/client/src/headless/link';
import { HeadlessLobby, LOGIN_WAIT_MS, isOpenChannel, newCharacter } from '@flyffweb/client/src/headless/lobby';
import type { WorldEntry } from '@flyffweb/client/src/lobby/LoginFlow';
import { AttackLoop, objRadius } from '@flyffweb/client/src/world/combat/attackLoop';
import type { AttackLoopSession } from '@flyffweb/client/src/world/combat/attackLoop';
import { Focus } from '@flyffweb/client/src/world/combat/focus';
import type { GameData } from '@flyffweb/client/src/world/gameData';
import { ItemUse } from '@flyffweb/client/src/world/items/itemUse';
import { OwnState } from '@flyffweb/client/src/world/OwnState';
import { OwnMover } from '@flyffweb/client/src/world/ownMover';
import type { OwnMoverSession } from '@flyffweb/client/src/world/ownMover';
import type { MoverViews } from '@flyffweb/client/src/world/render/MoverViews';
import type { Ground } from '@flyffweb/client/src/world/sim/collision';
import { SkillUse } from '@flyffweb/client/src/world/skills/skillUse';
import type { SkillUseSession } from '@flyffweb/client/src/world/skills/skillUse';
import { WorldSession } from '@flyffweb/client/src/world/WorldSession';
import type { WorldEvent } from '@flyffweb/client/src/world/WorldSession';
import { WorldState, isLive } from '@flyffweb/client/src/world/WorldState';
import type { Mover, WorldChanges } from '@flyffweb/client/src/world/WorldState';
import type { BotParts } from './hooks';
import type { BotSpec } from './settings';

/** No keys held: the mode stays as it is, as on the world screen with nothing pressed (Ruling 40). */
const STAND: MoveIntent = { forward: 0, turn: 0, run: false };
/** The JOIN must put the bot in within this long. */
const ENTER_WAIT_MS = 40_000;
/** CACHE_ADDR and the clock's answer may come a moment after the character list. */
const HANDOVER_WAIT_MS = 10_000;
const NO_OBJECTS: ReturnType<Ground['objectsNear']> = Object.freeze([]);

const sleep = (ms: number): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** What every bot shares: the converted files, the game data, the worlds' terrain and placed objects, and the gateway. */
export interface Shared {
  assets: DiskAssets;
  data: GameData;
  /** The world's terrain and manifest by its `WI_*` id (made once, kept). */
  world(worldId: number): { manifest: WorldManifest; terrain: Terrain };
  /** The placed objects' collision shapes of the bots' area of the world (loaded once, kept), or undefined while loading. */
  objects(worldId: number): CollisionShapes | undefined;
  /** A new link to the bots' own gateway. */
  link(): Link;
  certifierAddress: string;
}

/** A world session that ended before the bot was in it. */
export class EndedBeforeEntering extends Error {}

/** The account letters: a town bot plays as D; the setup runs as P (GM) and nothing else. */
const LETTER_TOWNBOT = 0x44, LETTER_SETUP = 0x50;

/**
 * Why the bot must not play with the letter its own ADD_OBJ carries (`player.authorization`), or undefined: in the setup
 * only P, otherwise only D. A bot left GM by a setup that was cut off never plays as an administrator.
 */
export function letterRefusal(authorization: number, setup: boolean): string | undefined {
  const letter = String.fromCharCode(authorization);
  if (setup) return authorization === LETTER_SETUP ? undefined : `the setup needs the GM letter P, but the account has the letter ${letter}`;
  return authorization === LETTER_TOWNBOT ? undefined : `the account has the letter ${letter}, not the bot letter D: it does not play (run Install-TownBots again)`;
}

/** The parts of one rules step. */
export interface RulesStepParts {
  world: Pick<WorldState, 'self' | 'movers' | 'step'>;
  ownMover: Pick<OwnMover, 'control' | 'corrected'>;
  attack: Pick<AttackLoop, 'onReleased' | 'step'>;
  skillUse: Pick<SkillUse, 'step'>;
  views: Pick<MoverViews, 'step'>;
  /** What the step played, to the views and the listeners. */
  take(): void;
}

/**
 * One rules step, as `WorldScreen.step` takes it with no key held and nothing tapped: the press let go, then `role`
 * (where the screen steps Auto Play), the skill use's step and the attack loop's (with the clock: a wand's or a bow's
 * shot, `AttackLoop.automaticShot`), the own mover where that is `ControlPlayer`, every mover's step, the PLAYERCORR it
 * may owe, what the step played, and the views' step.
 */
export function rulesStep(p: RulesStepParts, now: number, role?: () => void): void {
  const own = p.world.self();
  p.attack.onReleased();
  role?.();
  if (own !== undefined) {
    const skillBranch = p.skillUse.step(own, (objectId) => p.world.movers.get(objectId));
    if (p.attack.step(skillBranch, now)) p.ownMover.control(own, STAND, null);
  }
  p.world.step();
  p.ownMover.corrected(own);
  p.take();
  p.views.step(p.world.movers);
}

export class BotBody implements BotParts {
  readonly data: GameData;
  playing = false;
  /** The text of the `ended` event, once the session has ended. */
  endedWith: string | undefined;
  /** The character the bot plays, once the list came. */
  character: CharacterSummary | undefined;
  session: WorldSession | undefined;
  private entry: WorldEntry | undefined;
  private world_: WorldState | undefined;
  private own_: OwnState | undefined;
  private worldId_ = 0;
  private ground_: Ground | undefined;
  private ownMover_: OwnMover | undefined;
  private focus_: Focus | undefined;
  private attack_: AttackLoop | undefined;
  private skillUse_: SkillUse | undefined;
  private itemUse_: ItemUse | undefined;
  private views: MoverViews | undefined;
  private lobby: HeadlessLobby | undefined;
  private finishEntering: { resolve: () => void; reject: (error: Error) => void } | undefined;
  /** Entering for the setup (the GM letter P), not to play (the bot letter D). */
  private setupMode = false;

  /** A bundle's message, after the world applied it (refusals, the safety net, the roles). */
  onMessage: ((objectId: number, message: WorldMessage) => void) | undefined;
  /** What a step or a bundle played. */
  onChanges: ((changes: WorldChanges) => void) | undefined;
  /** A USESKILL the server confirmed for the bot itself (its skill id). */
  onOwnSkill: ((skill: number) => void) | undefined;
  /** The session ended (the bot is out of the world). */
  onEnded: ((message: string) => void) | undefined;
  /** The bot is in a world and stepping (the first entry, or after a world change). */
  onEntered: (() => void) | undefined;
  /** The bot is changing worlds: nothing steps until `onEntered`. */
  onTransition: (() => void) | undefined;

  constructor(readonly spec: BotSpec, private readonly shared: Shared, private readonly log: (line: string) => void) {
    this.data = shared.data;
  }

  // ---- BotParts (the Auto Play hooks and the roles read these) ----
  worldId(): number { return this.worldId_; }
  world(): WorldState | undefined { return this.world_; }
  own(): OwnState | undefined { return this.own_; }
  focus(): Focus | undefined { return this.focus_; }
  attack(): AttackLoop | undefined { return this.attack_; }
  ownMover(): OwnMover | undefined { return this.ownMover_; }
  skillUse(): SkillUse | undefined { return this.skillUse_; }
  itemUse(): ItemUse | undefined { return this.itemUse_; }
  ground(): Ground | undefined { return this.ground_; }
  now(): number { return performance.now(); }

  /** The bot's own mover, while it is in the world. */
  self(): Mover | undefined { return this.world_?.self(); }

  /** The server clock's tick for a behaviour report (`WorldScreen`: `this.entry.clock.tick()`). */
  clockTick(): bigint { return this.entry?.clock.tick() ?? 0n; }

  /** A straight walk to `pos`, as a tap on the ground there (`OwnMover.walkTo`). */
  walkTo(pos: [number, number, number]): void {
    const self = this.self();
    if (self !== undefined) this.ownMover_?.walkTo(self, pos, false);
  }

  /**
   * Logs in, picks the first open channel and the first character (made with the bot's name and look when `create` and
   * the account has none), and enters the world. Throws what went wrong, with everything closed.
   */
  async enter(opts: { create?: boolean; setup?: boolean } = {}): Promise<void> {
    this.setupMode = opts.setup === true;
    this.playing = false;
    this.endedWith = undefined;
    this.world_ = undefined;
    this.own_ = undefined;
    const lobby = new HeadlessLobby(this.shared.link(), this.shared.certifierAddress);
    this.lobby = lobby;
    try {
      await lobby.flow.login(this.spec.account, this.spec.password);
      const { servers } = await lobby.expect('serverList', LOGIN_WAIT_MS);
      const channel = servers.find(isOpenChannel);
      if (channel === undefined) throw new Error('the server list has no open channel');
      await lobby.flow.selectChannel(channel);
      let characters = (await lobby.expect('characters')).characters;
      if (characters.length === 0) {
        if (opts.create !== true) throw new Error('the account has no character: run the setup first');
        lobby.flow.createCharacter(newCharacter(0, this.spec.name, this.spec.bankPin, this.spec.look));
        characters = (await lobby.expect('characters')).characters;
        if (!characters.some((c) => c.name.toLowerCase() === this.spec.name.toLowerCase())) throw new Error(`${this.spec.name} is not in the list after it was made (taken?)`);
      }
      const character = [...characters].sort((a, b) => a.slot - b.slot)[0]!;
      this.character = character;
      const entry = await this.handOver(lobby, character.slot);
      await this.start(entry, lobby.link);
    } catch (error) {
      await this.leave();
      throw error;
    }
  }

  /** Leaves the world as the Leave button does, and waits until the connections have closed. */
  async leave(): Promise<void> {
    this.playing = false;
    this.views?.dispose();
    this.views = undefined;
    this.session?.leave();
    this.session = undefined;
    const lobby = this.lobby;
    this.lobby = undefined;
    lobby?.flow.dispose();
    await lobby?.link.closed();
  }

  /** What the screen's frame does before its steps: the radii the attack's arrival needs. */
  frame(): void {
    const world = this.world_, views = this.views, own = world?.self();
    if (!this.playing || world === undefined || views === undefined || own === undefined) return;
    const about = [this.focus_?.targetId, own.dest?.targetId].filter((id): id is number => id !== null && id !== undefined);
    if (about.length === 0) return;
    for (const candidate of views.pickCandidates(undefined)) {
      if (candidate.objectId !== own.objectId && !about.includes(candidate.objectId)) continue;
      const mover = world.movers.get(candidate.objectId);
      if (mover !== undefined) mover.radius = objRadius(candidate.box, mover.added.scale);
    }
  }

  /** One rules step (`rulesStep`), with `role` where the screen steps Auto Play: before the attack loop reads its commands. */
  step(role?: () => void): void {
    const world = this.world_, ownMover = this.ownMover_, attack = this.attack_, skillUse = this.skillUse_, views = this.views;
    if (!this.playing || world === undefined || ownMover === undefined || attack === undefined || skillUse === undefined || views === undefined) return;
    rulesStep({ world, ownMover, attack, skillUse, views, take: () => this.take(world) }, performance.now(), role);
  }

  private async handOver(lobby: HeadlessLobby, slot: number): Promise<WorldEntry> {
    const deadline = Date.now() + HANDOVER_WAIT_MS;
    for (;;) {
      const entry = lobby.flow.handOver(slot);
      if (entry !== undefined) return entry;
      if (Date.now() > deadline) throw new Error('the login server sent the character list but not the cache address or the clock');
      await sleep(50);
    }
  }

  private async start(entry: WorldEntry, link: Link): Promise<void> {
    const entering = new Promise<void>((resolve, reject) => { this.finishEntering = { resolve, reject }; });
    entering.catch(() => {});
    this.entry = entry;
    const session = new WorldSession(link.open, entry, (event) => this.onWorldEvent(event, entry));
    this.session = session;
    const safetyNet = setTimeout(() => this.finishEntering?.reject(new Error(`did not enter within ${ENTER_WAIT_MS / 1000} s`)), ENTER_WAIT_MS);
    try {
      await session.start();
      await entering;
    } finally {
      clearTimeout(safetyNet);
      this.finishEntering = undefined;
    }
  }

  private onWorldEvent(event: WorldEvent, entry: WorldEntry): void {
    try {
      if (event.type === 'ended') {
        const was = this.playing;
        this.endedWith = event.message;
        this.playing = false;
        this.finishEntering?.reject(new EndedBeforeEntering(event.message));
        if (was) this.onEnded?.(event.message);
      } else if (event.type === 'entered') {
        this.begin(event.worldId, event.messages, entry);
        this.finishEntering?.resolve();
        this.onEntered?.();
      } else if (event.type === 'transition') {
        // a world change (a GM's teleport, a revival elsewhere): nothing steps until the new world's `entered`, which
        // makes the world again (`WorldScreen` does the same: `disposeWorld`, then `enter`)
        this.playing = false;
        this.worldId_ = event.worldId;
        this.onTransition?.();
      } else if (event.type === 'messages') {
        this.apply(event.messages);
      }
    } catch (error) {
      this.log(`${this.spec.name}: handling the world's messages failed: ${(error as Error).message}`);
      this.finishEntering?.reject(error as Error);
    }
  }

  /** The JOIN bundle, as `WorldScreen.enter` and the live test's `begin` take it. */
  private begin(worldId: number, messages: BundleMessage<WorldMessage>[], entry: WorldEntry): void {
    const session = this.session!;
    const { terrain } = this.shared.world(worldId);
    this.worldId_ = worldId;
    let added: AddedMover | undefined;
    for (const { value } of messages) {
      if (value.type === 'addMover' && value.mover.player?.self === true) added ??= value.mover;
    }
    // the account's letter, as the server sent it: never play as anything but a town bot (or a GM, for the setup only)
    const refused = added === undefined ? 'its own ADD_OBJ did not come' : letterRefusal(added.player?.authorization ?? 0, this.setupMode);
    if (refused !== undefined) {
      this.log(`${this.spec.name}: ${refused}`);
      session.leave();
      throw new Error(refused);
    }
    this.own_ = new OwnState(this.data, added!, entry.character.equipment);
    const ground: Ground = { ...terrain.ground, objectsNear: (x, z, range) => this.shared.objects(this.worldId_)?.objectsNear(x, z, range) ?? NO_OBJECTS };
    this.ground_ = ground;
    this.world_ = new WorldState(this.data, entry.clock, ground, this.own_);
    this.views?.dispose();
    this.views = headlessViews(this.shared.assets, this.data, entry.character.equipment, () => {});
    const sends: OwnMoverSession = {
      sendMoved: (move) => session.sendMoved(move),
      sendBehavior: (move) => session.sendBehavior(move),
      sendDestPos: (pos, forward) => session.sendDestPos(pos, forward),
      sendCorr: (move) => session.sendCorr(move),
    };
    this.ownMover_ = new OwnMover(sends, entry.clock, { show: () => {} });
    this.apply(messages, true);
    this.startAttack(session, entry, this.world_, ground);
    this.itemUse_ = new ItemUse(() => this.own_, this.data.itemProps, session);
    this.playing = true;
  }

  private startAttack(session: WorldSession, entry: WorldEntry, world: WorldState, ground: Ground): void {
    const focus = new Focus(session, (objectId) => {
      const mover = world.movers.get(objectId);
      return mover === undefined || isLive(mover);
    });
    const sends: AttackLoopSession = {
      sendDestObj: (targetId, range) => session.sendDestObj(targetId, range),
      sendMeleeAttack: (message, targetId, attackSpeed) => session.sendMeleeAttack(message, targetId, attackSpeed),
      sendGetDestObj: (fromId, destId) => session.sendGetDestObj(fromId, destId),
      sendBehavior: (move) => session.sendBehavior(move),
      sendMagicAttack: (targetId, power, id) => session.sendMagicAttack(targetId, power, id),
      sendRangeAttack: (targetId, power, id) => session.sendRangeAttack(targetId, power, id),
    };
    const skillSends: SkillUseSession = {
      sendUseSkill: (index, targetId, useType, control) => session.sendUseSkill(index, targetId, useType, control),
      sendDoUseSkillPoint: (skills) => session.sendDoUseSkillPoint(skills),
      sendEndSkillQueue: () => session.sendEndSkillQueue(),
      sendDestObj: (targetId, range) => sends.sendDestObj(targetId, range),
      sendBehavior: (move) => session.sendBehavior(move),
    };
    const skillUse = new SkillUse(skillSends, focus, () => this.own_, () => performance.now(), this.data, {
      tick: () => entry.clock.tick(), ground: () => ground,
    });
    const attack = new AttackLoop(sends, focus, world, () => this.own_, entry.clock, this.data.movers, skillUse);
    skillUse.attack = attack;
    world.onUseSkill = (casterId, message, started) => {
      skillUse.onUseSkill(casterId, message, started);
      if (started && casterId === world.self()?.objectId) this.onOwnSkill?.(message.skill);
    };
    this.focus_ = focus;
    this.skillUse_ = skillUse;
    this.attack_ = attack;
  }

  /** A bundle's messages, in order, as the live test's `apply` (`WorldScreen.apply`). */
  private apply(messages: BundleMessage<WorldMessage>[], joining = false): void {
    const world = this.world_;
    if (world === undefined) return;
    for (const { objectId, value } of messages) {
      if (value.type === 'replace') {
        const self = world.self();
        if (self !== undefined) world.apply(self.objectId, { type: 'setPos', pos: value.pos });
        this.onMessage?.(objectId, value);
        continue;
      }
      if (value.type === 'queryGetDestObj') {
        this.attack_?.onQueryGetDestObj(value.fromId);
        continue;
      }
      if (world.movers.has(objectId)) {
        if (value.type === 'moverDeath') this.attack_?.onMoverDeath(objectId, value.attackerId);
        else if (value.type === 'delObj') this.attack_?.onRemoved(objectId);
      }
      world.apply(objectId, value, joining);
      this.skillUse_?.onMessage(objectId, value, world.self());
      if (!joining) this.onMessage?.(objectId, value);
    }
    this.take(world);
  }

  private take(world: WorldState): void {
    const changes = world.takeChanges();
    this.views?.sync(changes, world.movers);
    this.onChanges?.(changes);
  }

  /** A mover's name by object id, in view. */
  nameOf(objectId: number): string | undefined {
    const mover = this.world_?.movers.get(objectId);
    return mover === undefined || objectId === NULL_ID ? undefined : mover.name;
  }

  /** A player's name by player id, in view. */
  nameOfPlayer(playerId: number): string | undefined {
    return this.world_?.moverByPlayerId(playerId)?.name;
  }
}

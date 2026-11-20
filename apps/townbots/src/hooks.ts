// Auto Play's hooks without a screen: `WorldScreen.autoPlayHooks` (apps/client/src/world/WorldScreen.ts) over a bot's
// parts, with what only a screen has made inert (the chat line, the sound, the title, the wake lock, the saved
// settings) and two rules of the bots: no looting at all, and no weekly hours (never counted, never limited).
// `AutoPlayFeed` is `WorldScreen.autoPlayChanges` and the message part of `autoPlayMessage` without the whispers and the
// GM talk (bots answer whispers; they do not stop for them), the party, the Pet Filter or the loot texts.
import type { Vec3 } from '@flyffweb/protocol';
import type { WorldMessage } from '@flyffweb/protocol';
import type { AutoPlay, AutoPlayHooks } from '@flyffweb/client/src/world/autoplay/controller';
import type { TargetMover } from '@flyffweb/client/src/world/autoplay/targets';
import { bagIsFull } from '@flyffweb/client/src/world/autoplay/bag';
import { AttackLoop, attackAble } from '@flyffweb/client/src/world/combat/attackLoop';
import type { Focus } from '@flyffweb/client/src/world/combat/focus';
import { sightBlocked } from '@flyffweb/client/src/world/combat/lineOfSight';
import type { GameData } from '@flyffweb/client/src/world/gameData';
import type { ItemUse } from '@flyffweb/client/src/world/items/itemUse';
import type { OwnState } from '@flyffweb/client/src/world/OwnState';
import type { OwnMover } from '@flyffweb/client/src/world/ownMover';
import { Ik3, ObjSta } from '@flyffweb/client/src/world/sim/constants';
import type { Ground } from '@flyffweb/client/src/world/sim/collision';
import type { SkillUse } from '@flyffweb/client/src/world/skills/skillUse';
import { isDie } from '@flyffweb/client/src/world/WorldState';
import type { Mover, WorldChanges, WorldState } from '@flyffweb/client/src/world/WorldState';

/** `TID_GAME_SKILLWAITTIME`, as `WorldScreen.autoPlayMessage` reads it. */
const TID_GAME_SKILLWAITTIME = 964;
const NO_PARTY: ReadonlySet<number> = new Set();

/** What the hooks read of a bot in the world (`BotBody` gives these). */
export interface BotParts {
  data: GameData;
  worldId(): number;
  world(): WorldState | undefined;
  own(): OwnState | undefined;
  focus(): Focus | undefined;
  attack(): AttackLoop | undefined;
  ownMover(): OwnMover | undefined;
  skillUse(): SkillUse | undefined;
  itemUse(): ItemUse | undefined;
  ground(): Ground | undefined;
  /** The page clock the attack loop and the items use (`performance.now`). */
  now(): number;
}

export function headlessHooks(p: BotParts): AutoPlayHooks {
  const skillLevel = (skillIndex: number): { reqMp: number; reqFp: number; cooldown: number } | undefined => {
    const slot = p.own()?.skills[skillIndex];
    if (slot === undefined || slot.level <= 0) return undefined;
    return p.data.skills.get(slot.skill)?.levels[slot.level - 1];
  };
  return {
    now: () => p.world()?.nowMs() ?? 0,
    worldId: () => p.worldId(),
    inDuel: () => false, // bots refuse every duel
    alive: () => { const self = p.world()?.self(); return self !== undefined && !self.act.isDie(); },
    gauges: () => {
      const o = p.own();
      return o ? { hp: o.hp, maxHp: o.maxHp(), mp: o.mp, maxMp: o.maxMp(), fp: o.fp, maxFp: o.maxFp() }
        : { hp: 0, maxHp: 0, mp: 0, maxMp: 0, fp: 0, maxFp: 0 };
    },
    inventory: () => p.own()?.inventory ?? null,
    cooldownLeft: (itemId) => p.itemUse()?.cooldownLeft(itemId) ?? 0,
    useItem: (objectId) => p.itemUse()?.use(objectId, 'bar') ?? false,
    say: () => {},
    save: () => {},
    self: () => p.world()?.self(),
    movers: () => p.world()?.movers.values() ?? [],
    rankOf: (m) => p.data.movers.get((m as Mover).added.index)?.rank ?? 0,
    attackable: (m) => {
      const self = p.world()?.self();
      return self !== undefined && attackAble(m as Mover, p.data.movers, self.act.isFlying());
    },
    isPlayer: (objectId) => p.world()?.movers.get(objectId)?.kind === 'player',
    partyIds: () => NO_PARTY,
    flying: () => p.world()?.self()?.act.isFlying() === true,
    engage: (objectId) => {
      const loop = p.attack();
      if (loop === undefined) return;
      const now = p.now();
      const focus = p.focus();
      if (focus !== undefined && focus.targetId !== null && focus.targetId !== objectId) loop.stop('ground');
      loop.onMoverPressed(objectId, now, false);
      loop.onMoverPressed(objectId, now, true);
    },
    focusId: () => p.focus()?.targetId ?? null,
    walkTo: (pos) => {
      const self = p.world()?.self();
      if (self !== undefined) p.ownMover()?.walkTo(self, pos, false);
    },
    pick: () => false,
    itemThere: () => false,
    bagFull: () => bagIsFull(p.own()?.inventory ?? null, p.own()?.inventorySlots ?? []),
    holdsWand: () => {
      const world = p.world(), self = world?.self();
      const hand = self === undefined || world === undefined ? null : world.handItem(self);
      return hand !== null && p.data.itemProps.get(hand)?.kind3 === Ik3.WAND;
    },
    wandHold: (on) => { if (on) p.attack()?.attackButtonDown(p.now()); else p.attack()?.attackButtonUp(p.now()); },
    alert: () => {},
    flashTitle: () => {},
    actionSlotHasSkills: () => (p.own()?.taskBar?.queue ?? []).some((shortcut) => shortcut.kind !== 0),
    chainBusy: () => {
      const s = p.skillUse();
      return s !== undefined && (s.execute !== 0 || s.pending || s.reserved || s.commanding);
    },
    useActionSlot: () => p.skillUse()?.useActionSlot(),
    useSkill: (skillIndex) => p.skillUse()?.useSlot(skillIndex),
    skillKnown: (skillIndex) => (p.own()?.skills[skillIndex]?.level ?? 0) > 0,
    skillCostOk: (skillIndex) => {
      const own = p.own(), level = skillLevel(skillIndex);
      return own !== undefined && level !== undefined && own.mp >= level.reqMp && own.fp >= level.reqFp;
    },
    skillCooldownMs: (skillIndex) => skillLevel(skillIndex)?.cooldown ?? 0,
    buffs: () => { const world = p.world(); return world?.self()?.buffs.list(world.nowMs()) ?? []; },
    standing: () => { const self = p.world()?.self(); return self === undefined || (self.act.state & ObjSta.MOVE_ALL) === ObjSta.STAND; },
    buffSkillId: (skillIndex) => p.own()?.skills[skillIndex]?.skill,
    keepAwake: () => {},
    disengage: () => {
      p.attack()?.stop('ground');
      p.focus()?.select(null);
      p.world()?.self()?.act.clearDest();
    },
    indexOf: (m) => (m as Mover).added.index,
    lineBlocked: (m) => {
      const self = p.world()?.self();
      return self !== undefined && sightBlocked(p.ground(), self.act.body.pos, m.act.body.pos);
    },
    partner: () => null,
    castOn: (skillIndex, objectId) => {
      const self = p.world()?.self();
      p.focus()?.select(self !== undefined && objectId === self.objectId ? null : objectId);
      p.skillUse()?.useSlot(skillIndex);
    },
    follow: (objectId) => p.attack()?.followTo(objectId),
    resurrectSkill: () => null,
    usageLeftMin: () => null,
    usageTick: () => {},
  };
}

/** Tells Auto Play what the world played: `WorldScreen.autoPlayChanges` and `autoPlayMessage`, for a bot. */
export class AutoPlayFeed {
  private lastExp: { level: number; exp: bigint | number } | null = null;
  private bagRevision = -1;

  constructor(private readonly play: AutoPlay, private readonly p: BotParts) {}

  /** A bundle's message, after the world applied it. */
  onMessage(objectId: number, value: WorldMessage): void {
    const self = this.p.world()?.self();
    if (value.type === 'replace') this.play.onEvent({ kind: 'replace' });
    else if (value.type === 'clearUseSkill' && objectId === self?.objectId) this.play.onEvent({ kind: 'skillRefused', skillIndex: -1 });
    else if (value.type === 'endSkillQueue') this.play.onEvent({ kind: 'chainEnded' });
    else if (value.type === 'definedText' && value.textId === TID_GAME_SKILLWAITTIME) this.play.onEvent({ kind: 'skillRefused', skillIndex: -1 });
  }

  /** A USESKILL the server confirmed for the bot itself. */
  onOwnSkill(skill: number): void {
    const skillIndex = this.p.own()?.skills.findIndex((slot) => slot.skill === skill) ?? -1;
    if (skillIndex >= 0) this.play.onEvent({ kind: 'skillOk', skillIndex });
  }

  /** What a step or a bundle played (`WorldState.takeChanges`). */
  onChanges(changes: WorldChanges): void {
    const world = this.p.world();
    if (world === undefined) return;
    const self = world.self();
    for (const event of changes.combat) {
      if (event.kind === 'hit') {
        this.play.onEvent({ kind: 'hit', attackerId: event.attackerId, victimId: event.victimId });
        if (self !== undefined && event.victimId === self.objectId && event.attackerId !== self.objectId) {
          const attacker = world.movers.get(event.attackerId);
          this.play.onEvent({ kind: 'hitBy', attackerId: event.attackerId, attackerIsPlayer: attacker?.kind === 'player', name: attacker?.name ?? '' });
        }
      } else if (event.kind === 'death' && self !== undefined && event.attackerId === self.objectId) {
        const victim = world.movers.get(event.victimId);
        if (victim !== undefined && victim.kind === 'monster') this.play.onEvent({ kind: 'kill', targetId: event.victimId, pos: [...victim.act.body.pos] as Vec3 });
      } else if (event.kind === 'flight' && event.flying && event.moverId === self?.objectId) this.play.onEvent({ kind: 'flying' });
      else if (event.kind === 'swing' && event.attackerId === self?.objectId) this.play.onEvent({ kind: 'swing', attackerId: event.attackerId, targetId: event.targetId });
    }
    for (const event of changes.own) {
      if (event.kind === 'died' || event.kind === 'revived') this.play.onEvent({ kind: event.kind });
    }
    const own = this.p.own();
    if (own !== undefined) {
      const level = own.level, exp = own.exp;
      if (this.lastExp !== null && this.lastExp.level === level && exp > this.lastExp.exp) {
        this.play.onEvent({ kind: 'exp', gained: Number(exp) - Number(this.lastExp.exp) });
      }
      this.lastExp = { level, exp };
      if (own.inventoryRevision !== this.bagRevision) {
        this.bagRevision = own.inventoryRevision;
        this.play.onEvent({ kind: 'bagChanged' });
      }
    }
  }
}

/** Whether a mover is alive in the bot's view (the focus's `IsLive`). */
export const liveInView = (world: WorldState) => (objectId: number): boolean => {
  const mover = world.movers.get(objectId);
  return mover === undefined || !isDie(mover);
};

export type { TargetMover };

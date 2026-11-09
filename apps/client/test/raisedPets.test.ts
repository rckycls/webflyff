// pets R1: the raised pet in the world. The pet messages come through the testkit's world server writers and the
// protocol's readers (a pretend world's bundles), into the world's movers and the own numbers.

import { describe, expect, it } from 'vitest';
import { BoxGeometry, Mesh, MeshBasicMaterial, Points, Scene, Texture } from 'three';
import { NULL_ID, PacketType, WORLD_READERS, readBundle } from '@flyffweb/protocol';
import type { AddedMover, InventoryItem, PetData, Vec3, WorldMessage } from '@flyffweb/protocol';
import {
  encodeBundle, newVagrantOwn, writeAddPlayer, writeAddSelf, writeDelObj, writePet, writePetCall, writePetFeed,
  writePetLevelup, writePetRelease, writePetSetExp, writePetState, writeSetPetName, writeSetPos,
} from '@flyffweb/testkit';
import type { ScriptMessage } from '@flyffweb/testkit';
import type { WebPets } from '@flyffweb/formats';
import { ServerClock } from '../src/net/serverClock';
import type { GameData } from '../src/world/gameData';
import { npcMenuEntries } from '../src/world/hud/moverMenu';
import { OwnState } from '../src/world/OwnState';
import type { OwnEvent } from '../src/world/OwnState';
import {
  II_PET_EGG, MI_PET_EGG, eggDestination, isClientMade, petItemId, petModelIndex, petMoverId, serverIdOf,
} from '../src/world/pets/raisedPet';
import { PARTICLES_PER_KIND, PetParticles, createPetParticle } from '../src/world/pets/petParticles';
import type { ParticleRandom } from '../src/world/pets/petParticles';
import { lookOf } from '../src/world/render/looks';
import { useTextureSet } from '../src/world/render/moverModels';
import { ParticleLayer } from '../src/world/render/ParticleLayer';
import { pickMover } from '../src/world/render/picking';
import type { PickCandidate } from '../src/world/render/picking';
import { terrainGround } from '../src/world/sim/collision';
import { WorldState } from '../src/world/WorldState';
import type { CombatEvent, Mover, WorldChanges } from '../src/world/WorldState';
import { addedPlayer, webMoverOf } from './helpers/movers';
import { OWN_ID, STARTER_EQUIPMENT, itemProp, ownGameData } from './helpers/ownState';

const f32 = Math.fround;

// ---- the data: the egg and the white tiger (Resource/pet.inc:4, propMover.txt:528-530, defineObj.h:1500-1502, :1633) ----

const AII_EGG = 9;
const BELLI_PEACEFUL = 1;
const MI_TIGER_D = 732;
const MI_TIGER_B = 733;
const MI_TIGER_S = 884;
const II_TIGER = 21039;
const OTHER = 50;
/** The bag slot the own egg is in. */
const EGG_SLOT = 3;

const PETS: WebPets = {
  kinds: [{ kind: 0, dst: 1, steps: [1, 2, 4, 7, 11, 16, 22, 29, 37], itemId: II_TIGER, models: [MI_TIGER_D, MI_TIGER_B, MI_TIGER_S], hatchWeight: 900 }],
  feedEnergy: [[], []], incrementExp: [250, 125, 62, 31], maxEnergy: [180, 300, 420, 600, 1500],
  penalty: [{ exp: f32(0.16), energy: 0 }],
};

const petMover = (index: number, name: string, textureEx?: number) => webMoverOf({
  index, name, ai: AII_EGG, belligerence: BELLI_PEACEFUL, addHp: 2297, speed: 0.1, model: `models/mvr_${name.toLowerCase()}.glb`,
  ...(textureEx !== undefined ? { textureEx } : {}),
});

function petData(withPets = true): GameData {
  return ownGameData({
    movers: new Map([
      [11, webMoverOf({ index: 11, name: 'Male', ai: 1, speed: 0.1 })],
      [MI_PET_EGG, petMover(MI_PET_EGG, 'PetEgg')],
      [MI_TIGER_D, petMover(MI_TIGER_D, 'PetWhiteTiger01')],
      [MI_TIGER_B, petMover(MI_TIGER_B, 'PetWhiteTiger01', 1)],
      [MI_TIGER_S, petMover(MI_TIGER_S, 'PetWhiteTiger01', 2)],
    ]),
    itemProps: new Map([
      ...ownGameData().itemProps,
      [II_PET_EGG, itemProp({ id: II_PET_EGG, name: 'Pet Egg', kind1: 3, kind2: 19, kind3: 120, part: -1 })],
      [II_TIGER, itemProp({ id: II_TIGER, name: 'White Tiger', kind1: 3, kind2: 19, kind3: 120, part: -1 })],
    ]),
    npcs: new Map([['mafl_pet', { key: 'MaFl_Pet', name: '', menus: [49, 50] }]]),
    ...(withPets ? { pets: PETS } : {}),
  });
}

const pet = (over: Partial<PetData> = {}): PetData => ({
  kind: 0, level: 0, exp: 0, energy: 1, life: 1, availLevels: [0, 0, 0, 0, 0, 0], name: '', ...over,
});

// ---- the pretend world -------------------------------------------------------------------------------------------

/** The messages of a bundle the world server would send, read back as the browser reads them. */
function read(messages: ScriptMessage[]): Array<{ objectId: number; value: WorldMessage }> {
  return readBundle(encodeBundle(PacketType.SNAPSHOT, OWN_ID, messages), WORLD_READERS).messages;
}

/** The own ADD_OBJ: a Vagrant with `bagPet` in bag slot 3, which is out (`petSlot`) when `out`. */
function ownAddObj(bagPet: PetData | null, out: boolean): AddedMover {
  const own = newVagrantOwn();
  const inventory: InventoryItem[] = [...own.inventory!];
  if (bagPet !== null) inventory.splice(3, 0, { objectId: EGG_SLOT, itemId: bagPet.level === 0 ? II_PET_EGG : II_TIGER, count: 1, pet: bagPet });
  const added = addedPlayer(OWN_ID, {
    self: true, own: { ...own, inventory, ...(out ? { petSlot: EGG_SLOT } : { petSlot: NULL_ID }) },
    equipmentObjectIds: new Array<number>(31).fill(NULL_ID),
  }, { hitPoint: 230 });
  const [message] = read([writeAddSelf(OWN_ID, added)]);
  if (message?.value.type !== 'addMover') throw new Error('the own ADD_OBJ was not read');
  return message.value.mover;
}

interface Pretend {
  world: WorldState;
  own: OwnState;
  /** A bundle's messages, in order. */
  send(...messages: ScriptMessage[]): void;
  /** `n` rules steps, and the changes they made with what came before. */
  step(n?: number): WorldChanges;
  self(): Mover;
}

function pretendWorld(bagPet: PetData | null = pet(), out = true, data = petData()): Pretend {
  const added = ownAddObj(bagPet, out);
  const own = new OwnState(data, added, STARTER_EQUIPMENT);
  const clock = new ServerClock(() => 0);
  const world = new WorldState(data, clock, terrainGround(() => 0), own);
  world.apply(OWN_ID, { type: 'addMover', mover: added }, true);
  const changes: WorldChanges[] = [];
  return {
    world, own,
    send: (...messages) => { for (const { objectId, value } of read(messages)) world.apply(objectId, value); },
    step: (n = 1) => {
      for (let i = 0; i < n; i++) world.step();
      changes.push(world.takeChanges());
      const all = changes.splice(0);
      return {
        added: all.flatMap((c) => c.added), removed: all.flatMap((c) => c.removed), combat: all.flatMap((c) => c.combat),
        own: all.flatMap((c) => c.own), dropped: 0,
      };
    },
    self: () => world.self()!,
  };
}

const petOf = (world: WorldState, ownerId: number): Mover | undefined => world.movers.get(petMoverId(ownerId));
const petEvents = (own: readonly OwnEvent[]) => own.flatMap((e) => (e.kind === 'pet' ? [e.change] : []));
const kinds = (combat: readonly CombatEvent[]) => combat.map((e) => e.kind).filter((k) => k.startsWith('pet'));

/** Another player's ADD_OBJ with `pet` out. */
function otherWithPet(petOut?: { modelIndex: number; level: number; name: string }): ScriptMessage {
  return writeAddPlayer(OTHER, addedPlayer(OTHER, { name: 'Other', ...(petOut !== undefined ? { pet: petOut } : {}) }, { pos: [120, 0, 100] }));
}

// ---- the rules ---------------------------------------------------------------------------------------------------

describe('the raised pet rules', () => {
  it('gives each owner a negative id the server is told as NULL_ID', () => {
    expect(petMoverId(0)).toBe(-1);
    expect(petMoverId(OTHER)).toBe(-51);
    expect(isClientMade(petMoverId(0xfffffffe))).toBe(true);
    expect(isClientMade(0)).toBe(false);
    expect(serverIdOf(petMoverId(OTHER))).toBe(NULL_ID);
    expect(serverIdOf(OTHER)).toBe(OTHER);
  });

  it('picks the model by level (CPet::GetIndex) and the item (CPet::GetItemId)', () => {
    expect(petModelIndex({ kind: 0, level: 0 }, undefined)).toBe(MI_PET_EGG);
    expect([1, 2, 3, 4, 5].map((level) => petModelIndex({ kind: 0, level }, PETS)))
      .toEqual([MI_TIGER_D, MI_TIGER_D, MI_TIGER_B, MI_TIGER_B, MI_TIGER_S]);
    expect(petModelIndex({ kind: 7, level: 3 }, PETS)).toBe(0); // a kind the table lacks: no pet
    expect(petModelIndex({ kind: 0, level: 3 }, undefined)).toBe(0); // no pets.json
    expect(petItemId({ kind: 0, level: 0 }, undefined)).toBe(II_PET_EGG);
    expect(petItemId({ kind: 0, level: 2 }, PETS)).toBe(II_TIGER);
    expect(petItemId({ kind: 5, level: 2 }, PETS)).toBeNull();
  });

  it('walks to the owner\'s nearer side, 1 m left or right, once more than 1 m away (CAIEgg::MoveProcessIdle)', () => {
    const owner = { pos: [100, 5, 100] as Vec3, angle: 0, angleX: 0 };
    // facing -z (angle 0), the left is x - 1 (angle 270) and the right x + 1 (angle 90), on the land under the owner
    const left = eggDestination(owner, [95, 0, 100], 2)!;
    expect(left[0]).toBeCloseTo(99, 5);
    expect(left[1]).toBe(2);
    expect(left[2]).toBeCloseTo(100, 5);
    expect(eggDestination(owner, [105, 0, 101], 2)![0]).toBeCloseTo(101, 5);
    expect(eggDestination(owner, [100.5, 0, 100.5], 0)).toBeNull(); // within 1 m on x and z
    // a tie goes to the right (`d1 < d2`)
    expect(eggDestination(owner, [100, 0, 90], 0)![0]).toBeCloseTo(101, 5);
  });
});

// ---- the own pet -------------------------------------------------------------------------------------------------

describe('the own raised pet', () => {
  it('comes back after a relog from the own ADD_OBJ\'s pet slot, as MaFl_Pet at the owner, its window told', () => {
    const p = pretendWorld(pet());
    expect(p.own.petSlot).toBe(EGG_SLOT);
    const changes = p.step();
    const egg = petOf(p.world, OWN_ID)!;
    expect(egg.added.index).toBe(MI_PET_EGG);
    expect([egg.kind, egg.name, egg.petOwner, egg.added.npc?.characterKey]).toEqual(['npc', 'PetEgg', OWN_ID, 'MaFl_Pet']);
    expect(egg.act.body.pos).toEqual(p.self().act.body.pos);
    expect(egg.hp).toBeGreaterThan(0);
    expect(changes.added.map((m) => m.objectId)).toContain(petMoverId(OWN_ID));
    expect(petEvents(changes.own)).toEqual([{ kind: 'shown', levelup: 0 }]);
    expect(kinds(changes.combat)).toEqual([]);
    expect(petEvents(p.step(200).own)).toEqual([]); // made once
  });

  it('takes its model\'s scale (ResetScale, Mover.cpp:8931), 1 for a model with none (pets R2)', () => {
    const data = petData();
    const scaled = { ...data, movers: new Map([...data.movers, [MI_PET_EGG, { ...data.movers.get(MI_PET_EGG)!, modelScale: f32(1.1) }]]) };
    const p = pretendWorld(pet(), true, scaled);
    p.step();
    expect(petOf(p.world, OWN_ID)?.added.scale).toBe(f32(1.1));
    const plain = pretendWorld(pet());
    plain.step();
    expect(petOf(plain.world, OWN_ID)?.added.scale).toBe(1);
  });

  it('makes nothing with no pet out, nor a hatched pet without pets.json', () => {
    expect(petOf(pretendWorld(pet(), false).world, OWN_ID)).toBeUndefined();
    const p = pretendWorld(pet({ level: 2 }), true, petData(false));
    p.step();
    expect(petOf(p.world, OWN_ID)).toBeUndefined();
  });

  it('is called out (PET_CALL) and made at the next 64th step, then released with its sound and the window told', () => {
    const p = pretendWorld(pet({ level: 1 }), false);
    p.step(); // the first ProcessPet: none out
    p.send(writePetCall(OWN_ID, EGG_SLOT, MI_TIGER_D, 1, ''));
    expect(p.own.petSlot).toBe(EGG_SLOT);
    p.step(63);
    expect(petOf(p.world, OWN_ID)).toBeUndefined();
    p.step();
    expect(petOf(p.world, OWN_ID)?.added.index).toBe(MI_TIGER_D);
    p.send(writePetRelease(OWN_ID));
    const changes = p.step();
    expect(petOf(p.world, OWN_ID)).toBeUndefined();
    expect(p.own.petSlot).toBeNull();
    expect(kinds(changes.combat)).toEqual(['petReleased']);
    expect(petEvents(changes.own)).toEqual([{ kind: 'released' }]);
    expect(changes.removed).toEqual([petMoverId(OWN_ID)]);
  });

  it('levels up (PET with PF_PET_LEVEL_UP): the item becomes the kind\'s, the mover is made again with the cheer', () => {
    const p = pretendWorld(pet({ level: 0, exp: 50000 }));
    p.step();
    p.send(writePet(OWN_ID, pet({ level: 1, energy: 180, availLevels: [1, 0, 0, 0, 0, 0] }), 1));
    const item = p.own.inventory!.get(EGG_SLOT)!;
    expect([item.itemId, item.pet?.level, item.pet?.energy]).toEqual([II_TIGER, 1, 180]);
    let changes = p.step();
    expect(changes.removed).toContain(petMoverId(OWN_ID));
    expect(petEvents(changes.own)).toEqual([{ kind: 'changed' }]);
    expect(petOf(p.world, OWN_ID)).toBeUndefined();
    changes = p.step(64);
    expect(petOf(p.world, OWN_ID)?.added.index).toBe(MI_TIGER_D);
    expect(kinds(changes.combat)).toEqual(['petLevelUp']);
    expect(petEvents(changes.own)).toEqual([{ kind: 'shown', levelup: 1 }]);
  });

  it('keeps PET_STATE, PET_SET_EXP and PET_FEED, with the boxes of a life gained and a full egg', () => {
    const p = pretendWorld(pet({ level: 0 }));
    p.send(writePetSetExp(OWN_ID, 60000)); // at most 50,000 for an egg
    expect(p.own.petItem()?.pet?.exp).toBe(50000);
    expect(petEvents(p.step().own)).toContainEqual({ kind: 'hatchable' });
    p.send(writePet(OWN_ID, pet({ level: 1, energy: 100, life: 1 }), 0));
    p.send(writePetState(OWN_ID, EGG_SLOT, 3, 999, 10));
    const state = p.own.petItem()!.pet!;
    expect([state.life, state.energy, state.exp]).toEqual([3, 180, 10]); // the energy at most D's 180
    expect(petEvents(p.step().own)).toContainEqual({ kind: 'lifeGained', count: 2 });
    p.send(writePetFeed(OWN_ID, 50));
    expect(p.own.petItem()?.pet?.energy).toBe(50);
  });

  it('is renamed (SET_PET_NAME), and a name taken off gives the mover its prop\'s name again', () => {
    const p = pretendWorld(pet());
    p.step();
    p.send(writeSetPetName(OWN_ID, 'Eggy'));
    expect(petOf(p.world, OWN_ID)?.name).toBe('Eggy');
    expect(p.own.petItem()?.pet?.name).toBe('Eggy');
    expect(petEvents(p.step().own)).toContainEqual({ kind: 'named' });
    p.send(writeSetPetName(OWN_ID, ''));
    expect(petOf(p.world, OWN_ID)?.name).toBe('PetEgg');
  });

  it('follows its owner to the nearer side at the owner\'s speed, and is made again at the owner after a SETPOS', () => {
    const p = pretendWorld(pet());
    p.step();
    const egg = petOf(p.world, OWN_ID)!;
    egg.act.body.pos = [95, 0, 100];
    p.step();
    expect(egg.dest?.pos?.[0]).toBeCloseTo(99, 4);
    const x = egg.act.body.pos[0];
    p.step();
    expect(egg.act.body.pos[0] - x).toBeCloseTo(f32(0.1), 4); // the owner's speed, 0.1 a step
    p.step(60);
    expect(Math.abs(egg.act.body.pos[0] - 99)).toBeLessThan(1);
    p.send(writeSetPos(OWN_ID, [300, 0, 300]));
    expect(petOf(p.world, OWN_ID)).toBeUndefined();
    p.step(64);
    expect(petOf(p.world, OWN_ID)?.act.body.pos).toEqual([300, 0, 300]);
  });

  it('opens the pet\'s status and release entries on MaFl_Pet\'s menu', () => {
    const data = petData();
    expect(npcMenuEntries(data.npcs.get('mafl_pet'), data.texts, true).map((e) => [e.id, e.enabled])).toEqual([[49, true], [50, true]]);
  });
});

// ---- another player's pet ----------------------------------------------------------------------------------------

describe('another player\'s raised pet', () => {
  it('comes with its ADD_OBJ, levels up with a new model and the cheer, sparkles at S, and leaves with its owner', () => {
    const p = pretendWorld(null, false);
    p.send(otherWithPet({ modelIndex: MI_TIGER_B, level: 3, name: 'Tigger' }));
    let changes = p.step();
    const tiger = petOf(p.world, OTHER)!;
    expect([tiger.added.index, tiger.name, tiger.kind, tiger.added.npc?.characterKey]).toEqual([MI_TIGER_B, 'Tigger', 'npc', '']);
    expect(kinds(changes.combat)).toEqual([]);
    p.send(writePetLevelup(OTHER, MI_TIGER_S, 5));
    changes = p.step();
    expect(changes.removed).toContain(petMoverId(OTHER));
    changes = p.step(63);
    expect(petOf(p.world, OTHER)?.added.index).toBe(MI_TIGER_S);
    expect(kinds(changes.combat)).toEqual(['petLevelUp', 'petSparkle']);
    expect(kinds(p.step(64).combat)).toEqual(['petSparkle']); // every 64th step
    p.send(writeDelObj(OTHER));
    expect(petOf(p.world, OTHER)).toBeUndefined();
    expect(p.step().removed).toEqual(expect.arrayContaining([OTHER, petMoverId(OTHER)]));
  });

  it('is called with MAKELONG( index, level ) and released with the sound; PET_LEVELUP of the own one is ignored', () => {
    const p = pretendWorld(null, false);
    p.send(otherWithPet());
    p.step();
    p.send(writePetCall(OTHER, 7, MI_PET_EGG, 0, ''));
    p.step(64);
    expect(petOf(p.world, OTHER)?.added.index).toBe(MI_PET_EGG);
    p.send(writePetRelease(OTHER));
    expect(kinds(p.step().combat)).toEqual(['petReleased']);
    expect(petOf(p.world, OTHER)).toBeUndefined();
    p.step(200);
    expect(petOf(p.world, OTHER)).toBeUndefined();
  });

  it('is never picked; the own one is (World3D.cpp:2703-2707)', () => {
    const box = { min: [-1, 0, -1] as Vec3, max: [1, 2, 1] as Vec3 };
    const world = (x: number) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1]);
    const candidate = (objectId: number, x: number, othersPet?: boolean): PickCandidate =>
      ({ objectId, box, world: world(x), dead: false, isPlayer: false, ...(othersPet ? { othersPet } : {}) });
    const ray = { orig: [0, 1, -10] as Vec3, dir: [0, 0, 1] as Vec3 };
    expect(pickMover(ray.orig, ray.dir, [candidate(-51, 0, true)], 1000)).toBeNull();
    expect(pickMover(ray.orig, ray.dir, [candidate(-10, 0)], 1000)).toBe(-10);
  });

  it('draws with its model\'s texture set (textureEx)', () => {
    const p = pretendWorld(null, false);
    p.send(otherWithPet({ modelIndex: MI_TIGER_S, level: 5, name: '' }));
    p.step();
    const look = lookOf(petOf(p.world, OTHER)!, petData());
    expect([look?.parts, look?.textureEx]).toEqual([['models/mvr_petwhitetiger01.glb'], 2]);
  });
});

// ---- the S sparkle -----------------------------------------------------------------------------------------------

describe('the S pet\'s sparkle (g_ParticleMng)', () => {
  /** A random that gives the middle of each range and kind 13 + 5. */
  const middle: ParticleRandom = { float: (n) => f32(n / 2), int: (n) => Math.floor(n / 2) };

  it('sprays 4 particles 0.03 lower each, which move and fade over 67 steps', () => {
    const particles = new PetParticles();
    createPetParticle(particles, { angle: 0, angleX: 0, y: 10 }, [1, 2, 3], middle);
    expect(particles.liveKinds()).toEqual([18]);
    const list = particles.particles(18);
    const ys: number[] = [];
    for (let j = 0, y = 2; j < 4; j++) ys.unshift((y = f32(y - f32(0.03)))); // newest first
    expect(list.map((q) => q.pos[1])).toEqual(ys);
    expect(list[0]!.groundY).toBe(10.5);
    // the turn is -45 + 180 + 180: along +x; the pitch 0 - 65 + 65 = 0; the speed 0.0075
    expect(list[0]!.vel[0]).toBeCloseTo(-0.0075 * Math.SQRT1_2, 6);
    particles.step();
    expect(list[0]!.fade).toBeCloseTo(0.985, 6);
    particles.step();
    expect(particles.particles(18)[0]!.pos[0]).toBeCloseTo(1 + 2 * list[0]!.vel[0], 6);
    for (let i = 0; i < 64; i++) particles.step();
    expect(particles.count()).toBe(4);
    particles.step();
    expect(particles.count()).toBe(0);
  });

  it('keeps at most 512 of a kind', () => {
    const particles = new PetParticles();
    for (let i = 0; i < PARTICLES_PER_KIND + 10; i++) particles.create(13, [0, 0, 0], [0, 0, 0], 0);
    particles.create(99, [0, 0, 0], [0, 0, 0], 0); // a kind the browser has not
    expect(particles.count()).toBe(PARTICLES_PER_KIND);
  });
});

// ---- the drawing -------------------------------------------------------------------------------------------------

describe('the raised pet\'s drawing', () => {
  it('takes the texture set of each material (LoadTextureEx), and says a set the index lacks', () => {
    const material = (key: string): MeshBasicMaterial => Object.assign(new MeshBasicMaterial(), { userData: { texture: key } });
    const scene = new Scene();
    const body = new Mesh(new BoxGeometry(), material('textures/mvr_petwhitetiger01.dds.ktx2'));
    const eyes = new Mesh(new BoxGeometry(), material('textures/mvr_peteyes.dds.ktx2'));
    scene.add(body, eyes);
    const said: string[] = [];
    const store = { url: (key: string) => (key === 'textures/mvr_petwhitetiger01-et02.dds.ktx2' ? '/x' : null) };
    useTextureSet([scene], 2, store, (message) => said.push(message));
    expect(body.material.userData.texture).toBe('textures/mvr_petwhitetiger01-et02.dds.ktx2');
    expect(eyes.material.userData.texture).toBe('textures/mvr_peteyes.dds.ktx2');
    expect(said).toEqual(['texture set textures/mvr_peteyes-et02.dds.ktx2 is not in the asset index: the model\'s own texture is drawn']);
  });

  it('draws each kind\'s live particles as one point cloud, once its picture is in', async () => {
    const scene = new Scene();
    const held: string[] = [];
    const textures = {
      acquire: (key: string | null) => { held.push(key!); return Promise.resolve(new Texture()); },
      release: (key: string | null) => { held.splice(held.indexOf(key!), 1); },
    };
    const layer = new ParticleLayer(scene, textures);
    const particles = new PetParticles();
    particles.create(16, [1, 2, 3], [0, 0, 0], 0);
    particles.create(16, [4, 5, 6], [0, 0, 0], 0);
    layer.draw(particles);
    const cloud = scene.getObjectByName('particles 16') as Points;
    expect(cloud.visible).toBe(false); // its picture not in yet
    await Promise.resolve();
    layer.draw(particles);
    expect(cloud.visible).toBe(true);
    expect(cloud.geometry.drawRange.count).toBe(2);
    expect(Array.from(cloud.geometry.getAttribute('position').array.slice(0, 3))).toEqual([4, 5, -6]); // the newest, web z
    expect(held).toEqual(['textures/etc_particle12.bmp.ktx2']);
    layer.dispose();
    expect(held).toEqual([]);
    expect(scene.children).toEqual([]);
  });
});

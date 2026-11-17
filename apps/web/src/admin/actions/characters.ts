// The Characters tab (admin panel spec §5.5): the list, 10 a page (2026-11-17), search and view at any time; rename,
// penya, move to Flarine, delete and undo only while the Database and World servers are stopped (§4.3: the Database
// server's memory would undo them). The lock is checked inside the audited step, right before the change, so the row
// says what the probe saw. The authority letter needs no stop: the Database server reads it from SQL Server each time
// the character enters the game (DbManagerJoin.cpp:237; CMover::Copy, Obj.cpp:726, copies it even onto its memory).

import { gameAuthority, validateCharacterName } from '@flyffweb/protocol';
import type { HttpAnswer } from '../../signUpHandler';
import type { ActionHandler, AdminContext, AdminDeps } from '../adminServer';
import { AUTHORITIES } from '../adminStore';
import type { Authority, CharacterDetail } from '../adminStore';
import type { AuditOutcome } from '../audit';
import { runAudited } from '../audit';
import { PAGE_SIZE, withStale } from '../pageCache';
import type { CharacterFilter, Stale } from '../pageCache';
import { characterEditsOpen } from '../serverState';
import { idPlayerField, intField, invalid, okReply, pageField, reply, textField } from './fields';
import { namedPendingSends } from './pending';

/** The panel's ceiling for a character's penya, under the game's int limit with room to spare. */
export const MAX_PANEL_GOLD = 2_000_000_000;
/** The game's own Flarine spot (WORLDSERVER/DPDatabaseClient.cpp:1013), in WI_WORLD_MADRIGAL. */
export const FLARINE = Object.freeze({ worldId: 1, x: 6971.984, y: 100.0, z: 3336.884 });

const notFound = (): HttpAnswer => reply(404, { error: 'not_found' });
const refused = (message: string, after: unknown): AuditOutcome => ({ answer: reply(409, { error: 'refused', message }), result: 'refused', after });
const done = (after: unknown): AuditOutcome => ({ answer: okReply(), result: 'ok', after });

const search: ActionHandler = async (body, _ctx, deps) => {
  const name = textField(body, 'name', 32);
  const account = textField(body, 'account', 32);
  if (name === undefined && account === undefined) return invalid('query', 'Enter a character name or an account.');
  return reply(200, { rows: await deps.store.searchCharacters({ name, account }) });
};

/** One page of the character list: every character, or those of a name prefix or an exact account. Kept a short time. */
const page: ActionHandler = async (body, _ctx, deps) => {
  const number = pageField(body);
  if (number === undefined) return invalid('page');
  const filter: CharacterFilter = { name: textField(body, 'name', 32), account: textField(body, 'account', 32) };
  if (body.fresh === true) deps.pages.clear('characters');
  const kept = deps.pages.get('characters', filter, number);
  if (kept !== undefined) return reply(200, { ...kept, page: number, pageSize: PAGE_SIZE, kept: true });
  const result = await deps.store.characterPage(filter, (number - 1) * PAGE_SIZE, PAGE_SIZE);
  return reply(200, { ...deps.pages.set('characters', filter, number, result), page: number, pageSize: PAGE_SIZE, kept: false });
};

/**
 * A character, its sends not yet delivered, its account's letter and the letter it plays with (`gameAuthority`: the
 * account's, unless the account is a player or a VIP).
 */
const get: ActionHandler = async (body, _ctx, deps) => {
  const idPlayer = idPlayerField(body);
  if (idPlayer === undefined) return invalid('idPlayer');
  const character = await deps.store.getCharacter(idPlayer);
  if (character === undefined) return notFound();
  const account = await deps.store.getAccount(character.account);
  const accountAuthority = account?.authority ?? null;
  return reply(200, {
    character, pending: await namedPendingSends(deps, idPlayer), accountAuthority,
    gameAuthority: accountAuthority === null ? character.authority : gameAuthority(accountAuthority, character.authority),
  });
};

interface CharacterEdit {
  action: string;
  before: (c: CharacterDetail) => unknown;
  edit: (c: CharacterDetail) => Promise<AuditOutcome>;
  /** The list pages the edit makes old; by default the pages that show the character. */
  stale?: (c: CharacterDetail) => Stale;
}

/** The pages that show this character. */
const shown = (c: CharacterDetail): Stale => ({ characters: { ids: [c.idPlayer] } });

/** An edit on one existing character, made only while the edit lock is open. */
async function onCharacter(body: Record<string, unknown>, ctx: AdminContext, deps: AdminDeps, e: CharacterEdit): Promise<HttpAnswer> {
  const idPlayer = idPlayerField(body);
  if (idPlayer === undefined) return invalid('idPlayer');
  const character = await deps.store.getCharacter(idPlayer);
  if (character === undefined) return notFound();
  const answer = await runAudited(deps, ctx, { action: e.action, account: character.account, characterName: character.name, before: e.before(character) }, async () => {
    const lock = await characterEditsOpen(deps);
    if (!lock.open) {
      return {
        answer: reply(423, { error: 'locked', message: lock.seen }),
        result: 'refused',
        after: { locked: lock.seen },
      };
    }
    return e.edit(character);
  });
  return withStale(deps, answer, (e.stale ?? shown)(character));
}

const rename: ActionHandler = async (body, ctx, deps) => {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const problem = validateCharacterName(name);
  if (problem !== undefined) return invalid('name', problem);
  return onCharacter(body, ctx, deps, {
    action: 'characters.rename',
    before: (c) => ({ name: c.name }),
    edit: async (c) => {
      const result = await deps.store.renameCharacter(c.idPlayer, name);
      if (result === 'taken') return { answer: reply(409, { error: 'taken' }), result: 'refused', after: { taken: name } };
      if (result === 'missing') return { answer: notFound(), result: 'refused', after: { missing: true } };
      return done({ name });
    },
    // a new name moves the character in the name order, and changes which accounts a character-name search finds
    stale: () => ({ characters: { all: true }, accounts: { byCharacterName: true } }),
  });
};

const gold: ActionHandler = async (body, ctx, deps) => {
  const amount = intField(body, 'gold', 0, MAX_PANEL_GOLD);
  if (amount === undefined) return invalid('gold', `Penya must be a whole number from 0 to ${MAX_PANEL_GOLD.toLocaleString('en-US')}.`);
  return onCharacter(body, ctx, deps, {
    action: 'characters.gold',
    before: (c) => ({ gold: c.gold }),
    edit: async (c) => ((await deps.store.setGold(c.idPlayer, amount)) ? done({ gold: amount }) : refused('The database did not change it.', {})),
  });
};

const move: ActionHandler = async (body, ctx, deps) => onCharacter(body, ctx, deps, {
  action: 'characters.move',
  before: (c) => ({ worldId: c.worldId, x: c.x, y: c.y, z: c.z }),
  edit: async (c) => ((await deps.store.moveCharacter(c.idPlayer, FLARINE.worldId, FLARINE.x, FLARINE.y, FLARINE.z))
    ? done({ ...FLARINE }) : refused('The database did not change it.', {})),
});

const remove: ActionHandler = async (body, ctx, deps) => onCharacter(body, ctx, deps, {
  action: 'characters.delete',
  before: (c) => ({ deleted: c.deleted, slot: c.slot }),
  edit: async (c) => {
    const result = await deps.store.deleteCharacter(c.idPlayer);
    if (result === 'guild') return refused('Remove the character from its guild in the game first.', { inGuild: true });
    if (result === 'missing') return refused('The character is already deleted.', { missing: true });
    return done({ deleted: true });
  },
});

const undelete: ActionHandler = async (body, ctx, deps) => onCharacter(body, ctx, deps, {
  action: 'characters.undelete',
  before: (c) => ({ deleted: c.deleted, deletedAt: c.deletedAt, slot: c.slot }),
  edit: async (c) => {
    const result = await deps.store.undeleteCharacter(c.idPlayer);
    if (result === 'slot_taken') return refused('Another character of the account now holds that slot.', { slotTaken: c.slot });
    if (result === 'name_taken') return refused(`Another character now uses the name ${c.name}. Rename this one first, then undo the delete.`, { nameTaken: c.name });
    if (result === 'too_old') return refused('It was deleted more than 7 days ago: the game has cleared it.', { tooOld: c.deletedAt });
    if (result === 'missing') return refused('The character is not deleted.', { missing: true });
    return done({ deleted: false });
  },
});

/**
 * One character's own authority letter. No stop needed (read fresh at each entry into the game); it counts in the game
 * only while the account's letter is a player's or a VIP's (`gameAuthority`).
 */
const authority: ActionHandler = async (body, ctx, deps) => {
  const idPlayer = idPlayerField(body);
  if (idPlayer === undefined) return invalid('idPlayer');
  const letter = body.authority;
  if (typeof letter !== 'string' || !(AUTHORITIES as readonly string[]).includes(letter)) return invalid('authority');
  const c = await deps.store.getCharacter(idPlayer);
  if (c === undefined) return notFound();
  const answer = await runAudited(deps, ctx, { action: 'characters.authority', account: c.account, characterName: c.name, before: { authority: c.authority } },
    async () => ((await deps.store.setOneCharacterAuthority(c.idPlayer, letter as Authority))
      ? done({ authority: letter }) : refused('The database did not change it.', {})));
  return withStale(deps, answer, shown(c));
};

export const CHARACTER_ACTIONS = {
  'characters.search': search,
  'characters.page': page,
  'characters.get': get,
  'characters.authority': authority,
  'characters.rename': rename,
  'characters.gold': gold,
  'characters.move': move,
  'characters.delete': remove,
  'characters.undelete': undelete,
} satisfies Record<string, ActionHandler>;

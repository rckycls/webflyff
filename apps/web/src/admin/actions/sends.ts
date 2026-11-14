// The Send tab (admin panel spec §5.5): items and penya go into ITEM_SEND_TBL, the game's own delivery table, and
// arrive when the character next enters the game. Sends work while the servers run. The panel's rows carry
// ItemBillingNo 'ADMIN<audit id>'; only those can be cancelled, and not while the character is in the game.

import type { HttpAnswer } from '../../signUpHandler';
import type { ActionHandler } from '../adminServer';
import { runAudited } from '../audit';
import { searchItems } from '../itemCatalog';
import { characterEditsOpen } from '../serverState';
import { MAX_PANEL_GOLD } from './characters';
import { idPlayerField, intField, invalid, okReply, reply } from './fields';

const MAX_UPGRADE = 10;
const notFound = (): HttpAnswer => reply(404, { error: 'not_found' });

const itemsSearch: ActionHandler = async (body, _ctx, deps) => {
  const query = typeof body.query === 'string' ? body.query.slice(0, 64) : '';
  return reply(200, { rows: searchItems(deps.catalog, query) });
};

const list: ActionHandler = async (body, _ctx, deps) => {
  const idPlayer = idPlayerField(body);
  if (idPlayer === undefined) return invalid('idPlayer');
  return reply(200, { rows: await deps.store.pendingSends(idPlayer) });
};

const item: ActionHandler = async (body, ctx, deps) => {
  const idPlayer = idPlayerField(body);
  if (idPlayer === undefined) return invalid('idPlayer');
  const itemId = intField(body, 'itemId', 1, 2_147_483_647);
  const found = itemId === undefined ? undefined : deps.catalog.find((i) => i.id === itemId);
  if (found === undefined) return invalid('itemId', 'Pick an item from the list.');
  const count = intField(body, 'count', 1, found.packMax);
  if (count === undefined) return invalid('count', `The count must be 1 to ${found.packMax} for ${found.name}.`);
  const upgrade = intField(body, 'upgrade', 0, found.upgradable ? MAX_UPGRADE : 0);
  if (upgrade === undefined) return invalid('upgrade', found.upgradable ? `The upgrade must be +0 to +${MAX_UPGRADE}.` : `${found.name} cannot be upgraded.`);
  const character = await deps.store.getCharacter(idPlayer);
  if (character === undefined) return notFound();
  return runAudited(deps, ctx, {
    action: 'sends.item', account: character.account, characterName: character.name,
    before: { itemId: found.id, item: found.name, count, upgrade },
  }, async (auditId) => {
    const no = await deps.store.sendItem(idPlayer, String(found.id), count, upgrade, `ADMIN${auditId}`);
    return { answer: okReply({ no }), result: 'ok', after: { no } };
  });
};

const penya: ActionHandler = async (body, ctx, deps) => {
  const idPlayer = idPlayerField(body);
  if (idPlayer === undefined) return invalid('idPlayer');
  const amount = intField(body, 'amount', 1, MAX_PANEL_GOLD);
  if (amount === undefined) return invalid('amount', `Send 1 to ${MAX_PANEL_GOLD.toLocaleString('en-US')} penya.`);
  const character = await deps.store.getCharacter(idPlayer);
  if (character === undefined) return notFound();
  const pending = (await deps.store.pendingSends(idPlayer)).filter((s) => s.item.toLowerCase() === 'penya').reduce((sum, s) => sum + s.count, 0);
  const room = MAX_PANEL_GOLD - character.gold - pending;
  if (amount > room) {
    return invalid('amount', `That would pass ${MAX_PANEL_GOLD.toLocaleString('en-US')} penya: at most ${Math.max(0, room).toLocaleString('en-US')} more fits.`);
  }
  return runAudited(deps, ctx, {
    action: 'sends.penya', account: character.account, characterName: character.name,
    before: { gold: character.gold, pending, amount },
  }, async (auditId) => {
    const no = await deps.store.sendItem(idPlayer, 'penya', amount, 0, `ADMIN${auditId}`);
    return { answer: okReply({ no }), result: 'ok', after: { no } };
  });
};

const cancel: ActionHandler = async (body, ctx, deps) => {
  const idPlayer = idPlayerField(body);
  if (idPlayer === undefined) return invalid('idPlayer');
  const no = intField(body, 'no', 1, 2_147_483_647);
  if (no === undefined) return invalid('no');
  const character = await deps.store.getCharacter(idPlayer);
  if (character === undefined) return notFound();
  const send = (await deps.store.pendingSends(idPlayer)).find((s) => s.no === no);
  if (send === undefined) return notFound();
  if (!send.byPanel) return reply(409, { error: 'refused', message: 'The game made this send (a guild or event gift): it cannot be cancelled here.' });
  return runAudited(deps, ctx, {
    action: 'sends.cancel', account: character.account, characterName: character.name, before: { ...send },
  }, async () => {
    if (character.online && !(await characterEditsOpen(deps)).open) {
      return { answer: reply(409, { error: 'refused', message: 'The character is in the game: the send may be delivered right now.' }), result: 'refused', after: { online: true } };
    }
    return (await deps.store.cancelSend(idPlayer, no))
      ? { answer: okReply(), result: 'ok', after: { cancelled: no } }
      : { answer: reply(409, { error: 'refused', message: 'It was delivered or cancelled already.' }), result: 'refused', after: { gone: no } };
  });
};

export const SEND_ACTIONS = {
  'items.search': itemsSearch,
  'sends.list': list,
  'sends.item': item,
  'sends.penya': penya,
  'sends.cancel': cancel,
} satisfies Record<string, ActionHandler>;

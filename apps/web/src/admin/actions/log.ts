// The Log tab and the front page's recent logins (admin panel spec §5.5).

import type { ActionHandler } from '../adminServer';
import type { LogFilter } from '../adminStore';
import { intField, invalid, reply, textField } from './fields';

const read: ActionHandler = async (body, _ctx, deps) => {
  const filter: LogFilter = {};
  if (body.beforeId !== undefined) {
    const beforeId = intField(body, 'beforeId', 1, 2_147_483_647);
    if (beforeId === undefined) return invalid('beforeId');
    filter.beforeId = beforeId;
  }
  for (const key of ['account', 'characterName', 'action'] as const) {
    if (body[key] === undefined || body[key] === '') continue;
    const value = textField(body, key, 32);
    if (value === undefined) return invalid(key);
    filter[key] = value;
  }
  return reply(200, { rows: await deps.store.logRead(filter) });
};

const logins: ActionHandler = async (_body, _ctx, deps) => reply(200, { rows: await deps.store.recentLogins() });

export const LOG_ACTIONS: Record<'log.read' | 'log.logins', ActionHandler> = { 'log.read': read, 'log.logins': logins };

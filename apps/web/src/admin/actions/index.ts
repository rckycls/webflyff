// Every panel action by the name the page posts to (`POST /api/<name>`).

import type { ActionHandler } from '../adminServer';
import { LOG_ACTIONS } from './log';

export const ADMIN_ACTIONS: Record<string, ActionHandler> = {
  ...LOG_ACTIONS,
};

// Every panel action by the name the page posts to (`POST /api/<name>`).

import type { ActionHandler } from '../adminServer';
import { ACCOUNT_ACTIONS } from './accounts';
import { CHARACTER_ACTIONS } from './characters';
import { CODE_ACTIONS } from './codes';
import { LOG_ACTIONS } from './log';
import { SEND_ACTIONS } from './sends';
import { STATUS_ACTIONS } from './status';
import { VIP_ACTIONS } from './vip';

export const ADMIN_ACTIONS: Record<string, ActionHandler> = {
  ...ACCOUNT_ACTIONS,
  ...CHARACTER_ACTIONS,
  ...CODE_ACTIONS,
  ...LOG_ACTIONS,
  ...SEND_ACTIONS,
  ...STATUS_ACTIONS,
  ...VIP_ACTIONS,
};

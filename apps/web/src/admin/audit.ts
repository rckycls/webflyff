// Every panel change is logged first, then done, then its result written (admin panel spec §5.4): the row is begun
// with the values before, the action runs, the row is ended ok / failed / refused with the values after. If the row
// cannot be begun, nothing is done. A row left 'started' means the service stopped halfway.

import type { HttpAnswer } from '../signUpHandler';
import type { AdminContext, AdminDeps } from './adminServer';
import type { LogResult } from './adminStore';

export interface AuditPlan { action: string; account?: string; characterName?: string; before: unknown }
export interface AuditOutcome { answer: HttpAnswer; result: LogResult; after: unknown }

const MAX_DETAILS = 2000;
const oneLine = (error: unknown) => String((error as Error)?.message ?? error).replace(/[\r\n]+/g, ' ');

/** JSON of `value` (a string as it is), cut to the column's 2000 characters. */
export function details(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? '';
  return text.slice(0, MAX_DETAILS);
}

export async function runAudited(deps: AdminDeps, ctx: AdminContext, plan: AuditPlan, act: (auditId: number) => Promise<AuditOutcome>): Promise<HttpAnswer> {
  let id: number;
  try {
    id = await deps.store.logBegin({
      admin: ctx.session.user, address: ctx.address, action: plan.action, account: plan.account,
      characterName: plan.characterName, before: details(plan.before),
    });
  } catch (error) {
    deps.log.warn(`admin: audit row for ${plan.action} not begun, nothing done: ${oneLine(error)}`);
    return { status: 500, body: { error: 'server' } };
  }

  let outcome: AuditOutcome;
  try {
    outcome = await act(id);
  } catch (error) {
    outcome = { answer: { status: 500, body: { error: 'server' } }, result: 'failed', after: { error: oneLine(error) } };
    deps.log.warn(`admin: ${plan.action} failed: ${oneLine(error)}`);
  }

  try {
    await deps.store.logEnd(id, outcome.result, details(outcome.after));
  } catch (error) {
    deps.log.warn(`admin: audit row ${id} (${plan.action}) not ended: ${oneLine(error)}`);
  }
  return outcome.answer;
}

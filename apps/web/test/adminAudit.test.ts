import { expect, it } from 'vitest';
import { runAudited } from '../src/admin/audit';
import { LOG_ACTIONS } from '../src/admin/actions/log';
import { MemoryAdminStore } from './support/memoryAdminStore';
import { testContext, testDeps } from './support/adminDeps';

it('writes the row first, then the result, with before and after', async () => {
  const deps = testDeps();
  const ctx = testContext(deps);
  let seenRow: string | undefined;
  const answer = await runAudited(deps, ctx, { action: 'accounts.email', account: 'Poreotix', before: { email: 'a@b.c' } }, async (id) => {
    seenRow = deps.store.log.find((r) => r.id === id)?.result;
    return { answer: { status: 200, body: { ok: true } }, result: 'ok', after: { email: 'd@e.f' } };
  });
  expect(answer).toEqual({ status: 200, body: { ok: true } });
  expect(seenRow).toBe('started');
  expect(deps.store.log).toHaveLength(1);
  expect(deps.store.log[0]).toMatchObject({
    action: 'accounts.email', account: 'Poreotix', admin: 'Poreotix', address: '198.51.100.7', result: 'ok',
    before: '{"email":"a@b.c"}', after: '{"email":"d@e.f"}',
  });
});

it('marks a thrown action failed and answers 500', async () => {
  const deps = testDeps();
  const answer = await runAudited(deps, testContext(deps), { action: 'characters.gold', before: {} }, async () => {
    throw new Error('the database went away');
  });
  expect(answer).toMatchObject({ status: 500, body: { error: 'server' } });
  expect(deps.store.log[0]!.result).toBe('failed');
  expect(deps.store.log[0]!.after).toContain('the database went away');
});

it('never acts when the row cannot be written', async () => {
  const deps = testDeps();
  deps.store.failing.add('logBegin');
  let ran = false;
  const answer = await runAudited(deps, testContext(deps), { action: 'accounts.ban', before: {} }, async () => {
    ran = true;
    return { answer: { status: 200, body: { ok: true } }, result: 'ok', after: {} };
  });
  expect(answer).toMatchObject({ status: 500, body: { error: 'server' } });
  expect(ran).toBe(false);
});

it('still answers when the result cannot be written, and warns', async () => {
  const deps = testDeps();
  deps.store.failing.add('logEnd');
  const answer = await runAudited(deps, testContext(deps), { action: 'accounts.ban', before: {} }, async () => (
    { answer: { status: 200, body: { ok: true } }, result: 'ok', after: {} }));
  expect(answer.status).toBe(200);
  expect(deps.lines.some((l) => l.startsWith('admin: audit'))).toBe(true);
});

it('cuts before and after to 2000 characters', async () => {
  const deps = testDeps();
  await runAudited(deps, testContext(deps), { action: 'x', before: { long: 'y'.repeat(5000) } }, async () => (
    { answer: { status: 200, body: {} }, result: 'ok', after: 'z'.repeat(5000) }));
  expect(deps.store.log[0]!.before).toHaveLength(2000);
  expect(deps.store.log[0]!.after).toHaveLength(2000);
});

it('reads the log with filters, and the recent logins', async () => {
  const store = new MemoryAdminStore();
  const deps = testDeps({ store });
  const ctx = testContext(deps);
  for (const account of ['Poreotix', 'tester1', 'Poreotix']) {
    await runAudited(deps, ctx, { action: 'accounts.email', account, before: {} }, async () => ({ answer: { status: 200, body: {} }, result: 'ok', after: {} }));
  }
  await store.logBegin({ admin: 'Poreotix', address: '1.2.3.4', action: 'login', before: '' });
  const all = await LOG_ACTIONS['log.read']({}, ctx, deps);
  expect((all.body.rows as unknown[]).length).toBe(4);
  const mine = await LOG_ACTIONS['log.read']({ account: 'poreotix' }, ctx, deps);
  expect((mine.body.rows as { account: string }[]).map((r) => r.account)).toEqual(['Poreotix', 'Poreotix']);
  const older = await LOG_ACTIONS['log.read']({ beforeId: 3 }, ctx, deps);
  expect((older.body.rows as { id: number }[]).map((r) => r.id)).toEqual([2, 1]);
  expect((await LOG_ACTIONS['log.read']({ beforeId: 'x' }, ctx, deps)).status).toBe(400);
  const logins = await LOG_ACTIONS['log.logins']({}, ctx, deps);
  expect((logins.body.rows as { action: string }[]).map((r) => r.action)).toEqual(['login']);
});

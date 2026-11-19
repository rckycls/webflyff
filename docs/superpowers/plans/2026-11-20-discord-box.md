# Discord button on the home page — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a "Join our Discord" button with live "online · members" numbers on the home page's first screen.

**Architecture:** the web service (apps/web) reads Discord's public invite endpoint every 10 minutes and serves the
answer as `GET /api/discord`; the home page (apps/client/src/site) asks it once and shows the button, or nothing.

**Tech Stack:** TypeScript, Node's global `fetch`, vitest, Playwright (Chromium desktop + landscape phone).

**Spec:** `docs/superpowers/specs/2026-11-20-discord-box-design.md`

## Global Constraints

- No token, no bot, no invite link in the repo: the link is only in the VPS's `web.config.json` (`discord.invite`).
- The visitor's browser never calls Discord: only `/api/discord` on the site (CSP `connect-src 'self'` stays).
- Discord's logo is an inline SVG; no outside picture (CSP `img-src 'self' data: blob:` stays).
- Invite code: `^[A-Za-z0-9-]{2,32}$`, from `https://discord.gg/<code>`, `https://discord.com/invite/<code>` or a bare code.
- Cache: a good answer 10 min (`600_000`), an answer without numbers 1 min (`60_000`); Discord timeout 3 s (`3000`).
- Copy: button "Join our Discord"; numbers line "42 online · 310 members" (singular "1 member"; "1 online" stays).
- A missing `discord` section: off and silent. A bad one: off, log `discord: off: <reason>`; the site still starts.

## Review Focus

- Discord answers 200 with odd JSON (no counts, strings): numbers are `null`, the button still shows.
- Discord answers 429 or 5xx: numbers `null`, kept 1 minute, no log flood.
- Invite deleted after start (Discord 404): `/api/discord` → 404 off, warned once, not on every request.
- Many visitors at once on a cold cache: one call to Discord, shared (same as `StatusCache`).
- `/api/discord` unreachable or HTML (Vite dev server): the home page shows no button and no error.

---

### Task 1: `/api/discord` in the web service

**Files:**
- Create: `apps/web/src/discord.ts`, `apps/web/test/discord.test.ts`
- Modify: `apps/web/src/config.ts` (section like `vipSection`), `apps/web/src/server.ts` (route + `WebServerDeps.discord?`),
  `apps/web/src/main.ts` (cache + `discord: off:` log), `apps/web/test/config.test.ts`, `apps/web/test/server.test.ts`,
  `apps/web/web.config.example.json`, `apps/web/README.md`

**Interfaces (produces):**
- `interface DiscordConfig { code: string; url: string }` — `url` is always `https://discord.gg/<code>`.
- `parseDiscordConfig(value: unknown): DiscordConfig` — throws `Error('discord.invite must be ...')`.
- `WebConfig.discord: DiscordConfig | undefined; WebConfig.discordProblem: string | undefined`.
- `interface DiscordAnswer { url: string; name: string | null; online: number | null; members: number | null }`.
- `loadDiscord(config: DiscordConfig, fetchFn: typeof fetch, timeoutMs = 3000): Promise<DiscordAnswer | 'invalid'>`.
- `class DiscordCache { constructor(load: () => Promise<DiscordAnswer | 'invalid'>, now: () => number, log: Logger); get(): Promise<DiscordAnswer | 'off'> }`.
- `GET /api/discord`: `200 DiscordAnswer`, or `404 { error: 'off' }` (no cache, or `'off'`).

- [ ] **Step 1: tests** — `discord.test.ts`: parse accepts the 3 forms and rejects `https://evil.com/x`, `a`, `bad code!`;
  `loadDiscord` with a fake fetch: 200 `{guild:{name:'OSFlyff'},approximate_presence_count:42,approximate_member_count:310}`
  → `{url:'https://discord.gg/abc',name:'OSFlyff',online:42,members:310}`; 404 → `'invalid'`; 500, throw, timeout and
  `{approximate_member_count:'x'}` → numbers `null`; the URL asked is
  `https://discord.com/api/v10/invites/abc?with_counts=true`. Cache: fresh answer reused under 10 min, reloaded after;
  null-number answer reloaded after 1 min; two callers share one load; `'invalid'` → `'off'` and one warning over 3 gets.
  `config.test.ts`: no section → `discord` undefined, no problem; bad invite → `discordProblem` set, parse does not throw.
  `server.test.ts`: `/api/discord` 200 with the answer; without `deps.discord` 404 `{error:'off'}`.
- [ ] **Step 2:** `npx vitest run apps/web/test/discord.test.ts apps/web/test/config.test.ts apps/web/test/server.test.ts` — FAIL.
- [ ] **Step 3:** implement; `main.ts` builds `new DiscordCache(() => loadDiscord(config.discord!, fetch), clock, consoleLogger)`
  only when `config.discord` is set, and logs `discord: off: <discordProblem>` when that is set.
- [ ] **Step 4:** same command — PASS; `npx tsc --noEmit -p apps/web` clean.
- [ ] **Step 5:** commit `feat(web): /api/discord with the invite's live numbers`.

### Task 2: the home page button

**Files:**
- Create: `apps/client/src/site/discordBox.ts`, `apps/client/test/discordBox.test.ts`
- Modify: `apps/client/src/site/home.ts` (slot after `.home-new`), `apps/client/src/site/site.css`,
  `apps/client/e2e/home.spec.ts`

**Interfaces:**
- Consumes: `GET /api/discord` → `DiscordAnswer` (same type copied, as `statusBox.ts` does; no shared package).
- Produces: `discordCountsText(a: { online: number | null; members: number | null }): string | null`;
  `showDiscord(slot: HTMLElement, fetchFn: typeof fetch): Promise<void>`.

- [ ] **Step 1: tests** — unit: `{42,310}` → `'42 online · 310 members'`; `{1,1}` → `'1 online · 1 member'`;
  `{null,310}` → `'310 members'`; `{42,null}` → `'42 online'`; both null → `null`.
  e2e (`home.spec.ts`, both projects): mocked `{url:'https://discord.gg/abc',name:'OSFlyff',online:42,members:310}` →
  link "Join our Discord" with that href, `target=_blank`, `rel` has `noopener`, text "42 online · 310 members" visible,
  on the first screen; mocked 404 `{error:'off'}` → no such link.
- [ ] **Step 2:** `npx vitest run apps/client/test/discordBox.test.ts` — FAIL.
- [ ] **Step 3:** implement. The slot stays `hidden` until a valid answer; the link holds the SVG (`aria-hidden`), the label
  and a `.discord-counts` line (left out when `discordCountsText` is `null`). Style: ghost-button shape, blurple `#5865F2`
  fill at low alpha with a blurple border, the counts line in `--muted` 13px with a green dot like `.site-status`.
- [ ] **Step 4:** unit PASS; `npx tsc --noEmit -p apps/client`; `npx playwright test -c apps/client/playwright.config.ts
  --project=chromium --project=phone apps/client/e2e/home.spec.ts` — PASS.
- [ ] **Step 5:** commit `feat(site): Join our Discord button on the home page`.

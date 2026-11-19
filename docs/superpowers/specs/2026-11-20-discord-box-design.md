# Discord on the home page — design

Owner, 2026-11-20: "integrate my discord server in the front page" (plus channel setup in Discord itself, which is
not code and is not in this document). Linking the website to Discord (bots, posts, logins) was dropped by the owner.

## Why

Closed-beta players should find the community from the first screen of osflyff.online, and the live numbers show the
server is active.

## Goals / non-goals

- Goal: a Discord button on the home page's first screen with the server's live "online · members" numbers.
- Non-goals: no bot, no Discord login, no posts into Discord, no Discord on /play or in the game, no VIP roles.
- Anti-goal: nothing on the page may call Discord from the visitor's browser, and nothing secret goes in the public repo.

## Approaches

1. **Chosen: a button with live numbers.** The web service asks Discord's public invite endpoint
   (`GET https://discord.com/api/v10/invites/<code>?with_counts=true`: `approximate_presence_count`,
   `approximate_member_count`, `guild.name`; no token) and the page reads `/api/discord` from our own site.
2. Join button only: rejected by the owner's pick; no live numbers.
3. Discord's own widget (iframe): rejected. It has Discord's look, lists member names, and the site's CSP
   (`default-src 'self'`, no `frame-src`) blocks it today.

## The design

- **Setting** (VPS `C:\flyff-web\web.config.json`, not the repo): `"discord": { "invite": "https://discord.gg/<code>" }`.
  `discord.gg/<code>`, `discord.com/invite/<code>` or a bare code are taken; the code must match `^[A-Za-z0-9-]{2,32}$`.
  No section: the feature is off. A bad one: off, and the log says `discord: off: <reason>` (like `vip`).
- **`GET /api/discord`** (apps/web): `200 { url, name, online, members }`, with `online`/`members` numbers or `null`;
  `404 { error: 'off' }` when off. One answer is kept **10 minutes** and shared by every visitor (like the status cache).
  Discord down or slow (3 s timeout): the answer keeps the link with `null` numbers, kept 1 minute. Discord says the
  invite is unknown or expired (HTTP 404): answer `off` and log `discord: invite <code> is invalid or expired` once.
- **Home page** (apps/client/src/site/home.ts): in the first screen, under "New here? Sign up", a Discord button:
  Discord's logo (inline SVG, no outside picture), "Join our Discord", and under it a small line
  "● 42 online · 310 members". Discord blurple (#5865F2) as the accent, otherwise the site's ghost-button look. Opens
  in a new tab (`rel="noopener noreferrer"`). Asked once on page load. Hidden when the answer is `off` or the call fails;
  the line of numbers is left out when they are `null`.
- **Phone:** the same button in the same column; it wraps cleanly down to 320 px wide.
- **Docs:** `apps/web/web.config.example.json` and `apps/web/README.md` get the `discord` section.

## Tests (quick only)

- Unit: invite parsing, Discord answer parsing, the cache (fresh, shared load, failure kept 1 min, invalid → off).
- Client unit: the numbers line text.
- e2e home spec: `/api/discord` mocked: button with numbers; `off` → no button.

## VPS steps (after merge)

1. Add the `discord` section to `C:\flyff-web\web.config.json` with the never-expiring invite link.
2. Deploy the new FlyffWeb package as usual (`Update-FlyffWeb.ps1`); the web service restarts with it.
3. Open osflyff.online: the button shows the numbers.

## Left to the builder

The exact spacing and size of the button next to the existing hero items; logging wording.

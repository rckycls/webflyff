# Support / VIP: manual QR payments (2026-11-16)

Owner's request: a donate page with manual QR payments. Players pick VIP 1-4 ($2, $4, $6, $10 a month), pay by a QR the
admin uploaded, send the receipt picture and the reference number; the request is Processing until an admin approves or
rejects it. No payment company: they all ban unlicensed private servers. Labelled **Support / VIP**, not "Donate": VIP
with perks is a purchase, not a donation.

## What was built

- **Player page `/vip/`** (`apps/client/vip/`, `src/site/vip.ts`): the tiers and the QRs that are on (for everyone),
  the game-account login, the receipt form (the picture is made smaller in the browser first), the player's live VIP and
  their last 20 requests (Processing / Approved with the end date / Rejected with the reason). Home links to it.
- **Player API** (`apps/web/src/vip/siteVip.ts`): `/api/account/session|login|logout`, `/api/vip`, `/api/vip/qr/<id>`,
  `/api/vip/requests`, `/api/vip/receipt/<id>`.
- **Panel VIP tab** (`apps/web/admin/js/vip.js`, `src/admin/actions/vip.ts`): Requests (Processing / Approved / Rejected,
  receipt picture, Approve and Reject that ask again in place, Reject needs a reason), Payment QRs (add with picture,
  label, account name, note, order, on/off; save; delete), Tiers (name, price, on/off). Every change is in the Log tab.
- **Database** (`apps/web/sql/vip.sql`, `Install-Vip.ps1`): four tables in ACCOUNT_DBF and procedures for each login.
- **Caddy** (docs/hosting.md step 8, 8b, new step 8c): 8 MB only for `/api/vip/requests` (buffered by Caddy) and for the
  panel's `vip.qrAdd`; every other limit as before.

## Rulings

- **Login:** the site had none for players. It now checks the game account and password as LOGIN_STR does
  (`usp_WebPlayerLogin`, the same hash the game sends; banned accounts refused), with an in-memory session
  (`__Host-flyff`, HttpOnly, Secure, SameSite=Strict, 60 min idle, 12 h max) and a CSRF token. Any game account can log in:
  the pre-registration list (`.env`) is the gateway's and is not read here.
- **Another tier while VIP runs:** the new tier starts at approval, for one calendar month; the old tier's days left end.
  The same tier adds a month to its end. The page says this before sending.
- **Used reference:** one key per payment (letters and digits, capitals): refused while on a Processing or Approved
  request; a rejected one frees it (a player can resend with a clearer picture).
- **Prices** are US cents in `WEB_VIP_TIER`; a request keeps the price of when it was sent.
- **Off by default:** without web.config.json's `vip` section the API answers `503 off`; a bad section only logs
  `vip: off: <reason>` (as the admin section).
- **No re-encoding on the server** (no image library): pictures are checked by their first bytes, served with their own
  type, `nosniff` and `Content-Security-Policy: default-src 'none'`.
- **Existing test changed:** admin.spec's "email that looks like HTML" now checks for no `<img>` in the Accounts section
  only (the VIP tab has real receipt and QR pictures).

## On the VPS

The server repo's branch `vip-donate` (9fa9675, deploy/ only) runs `Install-Vip.ps1` from `2-Setup-Database` and
`Update-FlyffWeb`, and writes the `vip` section from `4-Setup-FlyffWeb`, when deploy.json has `"adminPanel": true`.

1. Copy the new `deploy\` to `C:\FlyFF\deploy` first, then `run.bat Update-FlyffWeb -From <new FlyffWeb folder>`
   (builds /vip/, makes the tables).
2. `run.bat 4-Setup-FlyffWeb -SkipBuild` (the `vip` section in web.config.json, the new Caddyfile, Caddy restarted).
3. `nssm restart flyffweb-site`; web.log says `vip: on, pictures in C:\flyff-web\vip-uploads`.
4. Panel, VIP tab, Payment QRs: add your QRs.

Without the scripts: hosting.md step 8c.

## Checks run

Typecheck apps/web, apps/client, apps/client/tsconfig.node.json; vitest apps/web (all) and the touched client tests;
`npm run check:public-build`; Playwright Chromium (desktop + phone) on the new specs only: `apps/client/e2e/vip.spec.ts`
10/10, `apps/web/e2e/vip.spec.ts` 8/8 (+ setup), admin.spec's changed test; home.spec and site.spec pass except the
art test, which needs `dist/assets` (not in the worktree). SQL never run on a real SQL Server.

## Owner's e2e

```
npm run test:e2e:admin
npm run test:e2e:client -- apps/client/e2e/vip.spec.ts apps/client/e2e/home.spec.ts apps/client/e2e/site.spec.ts
```

Pass: every test `ok`; the admin run has the 4 VIP tests on chromium and phone; the client run has the 5 VIP tests on
chromium and phone.

## Open questions for the owner

- What VIP 1-4 give in the game (none yet: only the level and end date are kept, `ACCOUNT_DBF.dbo.WEB_VIP`).
- Prices in pesos too (only US$ now)?
- Should only pre-registered (beta) accounts be able to send requests?
- Should rejected receipts be deleted after some time (they stay now)?

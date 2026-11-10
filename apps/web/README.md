# The web service (`apps/web`)

For the owner. The site's sign-up page makes accounts through this small service, and the home page asks it whether the
game is online. It listens on `127.0.0.1:8091` only; on the hosted site Caddy passes `/api/*` to it
([docs/hosting.md](../../docs/hosting.md) steps 6b and 8). It is the only FlyffWeb part that talks to SQL Server.

| Address | What |
| --- | --- |
| `GET /api/sign-up/ticket` | A form ticket. The sign-up page fetches one when it opens. |
| `POST /api/sign-up` | Makes an account: `{ account, password, email, website, ticket }`. |
| `GET /api/status` | `{ online, players, checkedAt }` for the home page. |

## Running it

On your PC, to try sign-up with the dev server (`npm run dev:client` passes `/api` to it):

```
Copy-Item apps\web\web.config.example.json apps\web\web.config.json
notepad apps\web\web.config.json
npm run web
```

Success: a line ending in `listening 127.0.0.1:8091`. On a hosted machine it runs as the Windows service "FlyffWeb Site",
with its settings in `C:\flyff-web\web.config.json` (hosting guide, step 6b).

## Settings (`web.config.json`)

A bad or missing value stops the service at start with a line `web: cannot use <file>: <the setting> must be ...`.

| Setting | What |
| --- | --- |
| `listen` | Where it listens: `127.0.0.1`, port `8091`. |
| `siteOrigin` | The site's own address, as the browser's address bar shows it: `https://play.example.com`, no slash at the end. A sign-up from any other page is refused. |
| `trustedProxies` | `["127.0.0.1"]`: Caddy. From these, the player's address is read from `X-Forwarded-For`, as the gateway does. |
| `sql` | SQL Server: `host`, `port` (TCP, usually 1433), `user` (`flyffweb_site`), `password`, `accountDatabase` (`ACCOUNT_DBF`), `characterDatabase` (`CHARACTER_01_DBF`), `trustServerCertificate` (`true` for SQL Server's own certificate). |
| `ticketSecret` | 32 or more random characters. The form tickets are signed with it. Keep it secret; changing it only makes open sign-up pages fetch a new ticket. |
| `servers` | The certifier's and the login server's ports on this machine. The status says online when both take a connection within 1 second. |
| `limits` | Optional. See below. |
| `reservedNames` | Optional: `{ "exact": [...], "prefixes": [...] }`, names nobody may take. Default: exact `admin`, `administrator`, `gamemaster`, `staff`, `support`, `moderator`, `system`, `owner`, `root`, `server`; any name starting with `gm` or `admin`. Setting it replaces the whole list. |

**The database login.** `sql/Install-WebLogin.ps1` (run in PowerShell where SQL Server runs) makes the login
`flyffweb_site`, which may run `usp_CreateNewAccount` and the new `usp_WebOnlineCount` and nothing else, and checks that
it can log in. Run it again to change the password.

## Limits

Kept in memory: a restart (`nssm restart flyffweb-site`) clears them.

| Limit | Setting (`limits`) | Default | What the player sees |
| --- | --- | --- | --- |
| Sign-up tries from one address in an hour | `attemptsPerHour` | 20 | "Too many sign-ups from your network. Try again later." |
| Accounts made from one address in an hour | `createdPerHourPerAddress` | 3 | "Too many sign-ups from your network. Try again later." |
| Accounts made in all in an hour | `createdPerHour` | 60 | "Sign-ups are paused for a few minutes. Try again soon." |
| Form tickets for one address in an hour | `ticketsPerHourPerAddress` | 60 | "Something went wrong. Please try again later." |

A form ticket is good from 3 seconds to 30 minutes after the page opened, once: a page left open longer, or sent twice,
gets a new one and the player is asked to press **Sign up** again. The form also has a field people never see; a program
that fills it is told "created", and nothing is made.

The rules for a new account (the page checks them first, the service again): the name 4 to 32 characters of `a-z`, `0-9`,
`_` and `-` (capitals become small letters, as the game's login reads them), not a reserved name; the password 8 to 31
plain characters with a letter and a number, not the name; the email empty or like `name@example.com`. The account gets
no cash and a player's rights, whatever the form sends.

## Logs

One line per sign-up, behind the time: `signup <address> <account or -> <result>`. Never the password, the email or the
ticket.

| Result | Meaning |
| --- | --- |
| `created` | The account was made. |
| `taken` | The name exists already. |
| `invalid:<field>` | A rule was broken (`account`, `password` or `email`), or `invalid` alone for a form that is not one. |
| `too_many` | An address limit. |
| `paused` | The limit for all. |
| `ticket` | The ticket was missing, too old, too new or used. |
| `bot` | The hidden field was filled: nothing was made. |
| `error` | The database refused or failed; a `signup database error: ...` line before it says why. |
| `type`, `size`, `forbidden` | Not a JSON form, a body over 1 KB, or a page other than `siteOrigin`. |

`ticket <address> too_many` lines are an address past its tickets for the hour.

So that a flood cannot fill the disk, the refusals a program can repeat without end (`type`, `size`, `forbidden`, `invalid`
alone, `too_many` past the 20 tries, and `ticket ... too_many`) are written once a minute per address and kind; the
minute's end adds `signup <address> <result> x<n> more in the last minute`, and past 50 addresses in a minute only
`<n> more refused requests from other addresses in the last minute`.

## News and screenshots

The home page shows the 5 newest news posts and up to 6 screenshots. Both are read when the site is built, so a new post
shows after the next `npm run build:client` (hosting guide, step 3b; on your PC, the dev server shows it at once).

- **A news post** is a file `apps/client/content/news/YYYY-MM-DD-slug.md`, for example `2026-11-20-new-dungeon.md`. The
  date comes from the file name. The first line is the title, after `# `; then the text. Blank lines separate
  paragraphs; lines starting with `- ` are a list; `**bold**`, `*italic*` and `[a link](https://example.com)` work. HTML
  in the file shows as plain text, and only `http://` and `https://` links are kept.
- **The about text** is `apps/client/content/about.md`, in the same way (no title line).
- **Screenshots** are `.webp`, `.png` or `.jpg` files in `apps/client/content/screenshots/`, shown in name order (name them
  `1-town.webp`, `2-fight.webp`, ...). Up to 6; without any, the page says "Screenshots coming soon". Keep each under
  about 300 KB (WebP at 1280 px wide is plenty).

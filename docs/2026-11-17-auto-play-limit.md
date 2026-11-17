# Auto Play weekly limit (2026-11-17)

Branch `auto-play-limit` (FlyffWeb worktree `FlyffWeb-worktrees/auto-play`), from local main bb191ae. Custom feature
(owner). Not merged, not pushed. No convert, no game-server change, no SQL to run.

## Owner's ask and answers
"A weekly limit to how much you can use autoplay. Normal 14 hrs, VIP1 24, VIP2 36, VIP3 48, VIP4 no limit."
Answers: counted **on the server**; the week starts again **Monday 00:00 server time**; it counts **farm bot + Support
time, per account** (all characters share it; auto pots alone stay free).

## How it works
- **Web service** (apps/web): `GET /api/autoplay` and `POST /api/autoplay/tick`, behind the site's account session (the
  same login the Support / VIP page uses). Each answer: minutes used this week, the limit by the account's live VIP level
  (the VIP store's), and the next Monday 00:00. A tick adds the time since the account's last tick, at most 70 s (two
  tabs count the time once). Kept in `autoplay-usage.json` in the VIP uploads folder
  (`C:\flyff-web\vip-uploads\autoplay-usage.json` on the VPS), made by itself. Off (404) where the VIP section is off.
- **Game:**
  - once the game login is accepted, it opens the site session with the same account and password (then forgets the
    password);
  - while the farm bot or Support mode runs, it ticks once a minute;
  - with no hours left it refuses to start, or stops: "Auto Play stopped: weekly limit reached.";
  - the Farm and Support tabs show "This week: 13h10m left of 14h" (VIP4: "This week: no limit"), and Start is greyed
    at 0.
- If the count cannot be had (no site session, the service off or unreachable, a web-service restart dropping the
  session), Auto Play is **not** held back. The next game login opens a session again.
- Like every client rule, someone running an edited copy of the public game code could skip the ticks. Clearing the
  browser's data, another browser or a phone does not reset the week.

## Builder's checks (done)
- Unit tests: the usage book (week start, ticks, two tabs, the file), the routes (session, CSRF, VIP4 no limit, off),
  the game's count, the lobby hand-over, the controller (refuse, a tick a minute, stop at 0), the window line. All pass;
  the web suite alone 230/230.
- In loaded full runs `pageAssets.test.ts` and `vipImages.test.ts` can time out at 5 s; both pass alone.
- Typechecks clean; `npm run check:public-build` ok; Auto Play e2e 4/4 on chromium and phone.

## Deploy
The normal FlyffWeb update (it carries apps/web and the client). Nothing else. The VIP section must be on (it is on the
VPS) for the limit to work.

## Owner's test (on the VPS or the VM with the web service)
1. Log in to the game with a normal account; open Auto Play. **Pass:** "This week: 14h left of 14h".
2. Run the farm bot 3 minutes. **Pass:** the line shows about 13h57m left; `autoplay-usage.json` exists in the VIP uploads
   folder.
3. Log in from another browser with the same account. **Pass:** the same time left.
4. A VIP4 account. **Pass:** "This week: no limit".
5. To try the stop without waiting 14 h: in `autoplay-usage.json`, set the account's `usedMs` to 50340000 (13h59m), stop
   the web service first and start it again after. **Pass:** about a minute later Auto Play stops with "weekly limit
   reached" and Start is greyed.

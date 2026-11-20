# Town bots

Bot characters for livelier towns. One Node program logs a list of bot accounts in through the normal login flow and
plays them with the client's own world code (no browser, no graphics): they farm with Auto Play, walk around, upgrade,
keep a shop or stand idle (now and then in combat stance), and switch between those now and then. They never sit, and
never stand on a town place another bot holds. Each lives in one region (a town and its fields), and every 5-7 hours
renames itself with a Scroll of Name Change. They say no to every request.

Nothing here names any bot. Everything specific (the accounts, names, word lists, lines, places and items) is in the
settings file the server's install script writes.

```
npm run townbots -- --config <settings.json>            run the bots until stopped
npm run townbots -- --config <settings.json> --setup    first-time setup of each bot's character
```

The settings file is checked by `src/settings.ts`, which says what each field holds. A region's places file is checked
against the converted map with `scripts/checkPlaces.ts` (`--write-links` writes its clear town walks).

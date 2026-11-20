# Town bots

Bot characters for a livelier town. One Node program logs a list of bot accounts in through the normal login flow and
plays them with the client's own world code (no browser, no graphics): they farm with Auto Play, walk around, sit,
upgrade, keep a shop or stand idle, and switch between those now and then. They say no to every request.

Nothing here names any bot. Everything specific (the accounts, names, lines, places and items) is in the settings file
the server's install script writes.

```
npm run townbots -- --config <settings.json>            run the bots until stopped
npm run townbots -- --config <settings.json> --setup    first-time setup of each bot's character
npm run townbots -- --config <settings.json> --relog    log every bot out and in again, one at a time
```

The settings file is checked by `src/settings.ts`, which says what each field holds.

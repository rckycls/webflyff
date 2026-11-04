# Flyff v15 World Indicators

## Intent

Bring two recognizable v15 world cues into FlyffWeb: per-player quest status markers above NPCs and the short angry attack emote when an aggressive monster enters combat.

## Goals

- Derive NPC quest marker state from the local quest catalog, the current player's quest lists, and the same supported conditions used by the v15 client.
- Render marker sprites above NPC heads and make their state refresh when player quest data changes.
- Show the attack emote briefly when the v15 server sends its monster `!0` chat payload.
- Reuse existing world positions, mover updates, and sprite rendering conventions.

## Non-goals

- No server or protocol change.
- No navigator-map markers in this slice.
- No permanent anger icon on idle aggressive monsters.
- No full recreation of unsupported quest predicates.

## Approaches

- **Client-derived indicators (chosen):** use existing quest/mover state and the overhead sprite layer. This keeps the change within the client and uses data FlyffWeb already loads.
- **Server-authoritative indicators:** add marker and aggro events to server/protocol messages. This is more authoritative but requires a wider server change while the client already has the needed state.

## Behavior

- Quest states: available, future-level, in-progress, and ready-to-turn-in. A turn-in marker takes precedence over in-progress; available takes precedence over future-level/in-progress, matching v15's marker selection.
- Quest marker state is evaluated for the current character and refreshed after own quest/stat changes.
- The angry emote is triggered by the server's `!0` payload and expires after five seconds. Idle aggressive monsters continue to use the existing red name color only.

## Constraints and calls

- Implement in the existing FlyffWeb client at `Blouflash VS22 V15/FlyffWeb`.
- Use the current Three.js world scene and billboarded, depth-independent sprites.
- Use the actual client DDS pixels and .inc frame indices. No drawn replacements. Preserve 32-pixel frames, magenta transparency, and the native quest pulse.
- Verify conversion preserves source pixels, frame selection, image-loading lifecycle, type checking, and client build.

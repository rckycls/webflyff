# Piece 5 chat window update

**Date:** 2026-10-31
**Status:** Approved by owner: “Go ahead”

## Intent

Update the existing piece-5 chat window to match the classic FlyFF chat layout and message separation shown in the reference, while keeping NPC dialogue in its separate dialogue window.

## Goals

- Add Chat, Whisper, Shout, Party, Guild, System, and Announcement tabs.
- Chat shows all chat and system/announcement messages except NPC dialogue.
- Whisper shows whisper messages routed through the native whisper function; Shout, Party, and Guild show their respective messages.
- System shows GM messages. Announcement shows event and server notices such as DGSW starts and Lord voting; NPC dialogue stays excluded.
- Lock prevents moving the chat window. Filter remains visible but inactive until its behavior is specified.
- Preserve existing safe text rendering, bounded transcript, input isolation, and server-authoritative send/receive behavior.

## Non-goals

- Putting NPC dialogue into any chat feed.
- Defining an unrequested player mute, word filter, or profanity-filter feature.
- Implementing chat features beyond the listed tabs and message categories.

## Approaches

1. **Update the current chat window (selected):** extend its transcript and composer with category tabs, keep existing chat ownership and input behavior, and route the new message categories through existing world message handling. This matches the reference and avoids duplicating chat controls.
2. **Add a separate chat panel:** preserve the current composer and create an additional categorized panel. This offers more space but duplicates UI and chat interaction.

The owner chose the existing-window update. Filter is left inactive as proposed pending a clear behavior.

## Builder decisions

Inspect the native packet handlers and current piece-5 protocol before implementation. Add Party/Guild send and receive only where the existing server protocol supports it. Route GM messages to System and recognized event/server notices to Announcement; keep ordinary system feedback in Chat as well as its existing feedback path when appropriate. Unknown event notice sources must not be mislabeled as NPC dialogue or guessed from message text.

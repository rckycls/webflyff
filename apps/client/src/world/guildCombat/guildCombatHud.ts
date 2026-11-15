// The Guild Siege's glue to the screen and the session (2026-11-15). This first piece only routes: the book's events to the
// screen's listeners, and the siege's packets out through `host.send` (`WorldSession.sendGuildCombat`). The windows, the
// NPC menus and the arena HUD come on top of it in later tasks.

import type { GuildCombatBook, GuildCombatEvent } from './guildCombatBook';

/** What the siege HUD needs of the screen. */
export interface GuildCombatHost {
  send(bytes: Uint8Array): void;
}

export class GuildCombatHud {
  /** Listeners for the book's events (the windows of the later tasks). */
  private readonly listeners = new Set<(events: readonly GuildCombatEvent[]) => void>();

  constructor(private readonly host: GuildCombatHost, readonly book: GuildCombatBook) {}

  /** A siege packet the client sends (the `encodeGc*` bytes). */
  send(bytes: Uint8Array): void {
    this.host.send(bytes);
  }

  /** Hears the events of every message the book applies. Returns what stops it. */
  onEvents(listener: (events: readonly GuildCombatEvent[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The events a message brought, from the screen. */
  handle(events: readonly GuildCombatEvent[]): void {
    for (const listener of [...this.listeners]) listener(events);
  }

  dispose(): void {
    this.listeners.clear();
  }
}

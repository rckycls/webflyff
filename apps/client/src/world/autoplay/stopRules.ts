/**
 * custom (owner 2026-11-15): Auto Play. The game events the controller is told about, and which of them stop the farm
 * bot (docs/superpowers/specs/2026-11-15-auto-play-design.md, 6.8).
 */

export type AutoPlayEvent = { kind: 'died' } | { kind: 'revived' };

// Escape in the world, in the order `CWndMgr::Process` takes it (`_Interface/WndManager.cpp:3295-3427`). The world screen
// asks `escapeStep` what the key does and does it; the window it closes is the windows' own (`frame.ts`, `escapeWindow`).

/** What Escape does (`escapeStep`). */
export type EscapeStep = 'revive' | 'none' | 'target' | 'window' | 'menu';

/**
 * Escape's order in `CWndMgr::Process` (`WndManager.cpp:3295-3427`; the world map's first branch, :3304-3309, is not
 * Piece 4's): the player dead, the revive window opens (:3311-3318); else, with the Start menu open, nothing (:3321); else
 * a target to clear (the next one queued or the focus, `AttackLoop.escape`, :3323-3368); else the window Escape closes
 * (`escapeWindow`, the status window passed over, :3383-3420); else, with no such window, the Start menu opens
 * (`OpenMenu`, :3421-3427).
 */
export function escapeStep(state: { dead: boolean; menuOpen: boolean; target: boolean; window: boolean }): EscapeStep {
  if (state.dead) return 'revive';
  if (state.menuOpen) return 'none';
  if (state.target) return 'target';
  return state.window ? 'window' : 'menu';
}

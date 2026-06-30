// =====================================================================
// Claude Code Traffic Light — central configuration
// Edit these and restart the overlay (it relaunches on next SessionStart,
// or just run `npm start` in this folder) to apply changes.
// =====================================================================

module.exports = {
  // Which screen corner the strip lives in.
  //   'top-right'  (default — just below the system clock)
  //   'top-left' | 'bottom-right' | 'bottom-left'
  corner: 'top-right',

  // Pixels of breathing room from the screen edges.
  margin: 8,

  // How long since a session's last heartbeat before we treat it as dead
  // and stop showing it. This is the watchdog for hard kills (Ctrl-C /
  // closing a terminal, which skip the SessionEnd hook). When the last
  // live session is pruned, the overlay quits itself.
  // NOTE: no hook fires *during* a single long-running tool or a long
  // model turn, so a quiet stretch longer than this can briefly prune a
  // session that is actually still alive. Raise it if that bothers you.
  heartbeatTimeoutMs: 60 * 1000,

  // How often the overlay polls the session directory (5x/sec).
  pollMs: 200,

  // Global hotkey to hide/show the overlay (Electron accelerator syntax).
  // Set to '' to disable the hotkey (you can still use the CLI: `light toggle`).
  toggleHotkey: 'CommandOrControl+L',
};

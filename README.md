# Claude Code Traffic Light 🚦🐦

An always-on-top, click-through desktop overlay that shows the live state of all your
Claude Code sessions as cute, slightly-pixelated traffic lights — one per session, with a
little bird perched on top. Lives in the corner of your screen all day so you know, at a
glance, which session needs you.

| State | Meaning |
|-------|---------|
| 🔴 **RED** | Waiting for your approval / blocked on a permission prompt |
| 🟡 **YELLOW** | Actively working (prompt submitted or a tool is running) |
| 🟢 **GREEN** | Idle / finished responding |

Every session shows as a labeled traffic light with the matching lamp lit (a finished/idle
session is a full light with the **green** lamp on). Lights are ordered **most-urgent-first**
(red → yellow → green), so the thing needing you is always at the front of the row.

---

## How it works

```
Claude Code hooks ──▶ bin/claude-light.js ──▶ ~/.claude-light/sessions/<id>.json
   (per session)        (writes color +              │
                         heartbeat, launches          │ polled 5×/sec
                         overlay on start)            ▼
                                            Electron overlay (main.js + renderer/)
```

1. **Hooks drive the state.** Global hooks in `~/.claude/settings.json` fire on session
   lifecycle events. Each one runs `bin/claude-light.js <action>`, passing Claude Code's
   hook JSON (which includes `session_id` and `cwd`) on stdin:

   | Hook | Action | Effect |
   |------|--------|--------|
   | `SessionStart` | `start` | Register session (green) + launch overlay if not running |
   | `UserPromptSubmit` | `yellow` | Working |
   | `PreToolUse` | `yellow` | Working (a tool is about to run) |
   | `PostToolUse` | `yellow` | Working again — clears red after you approve a tool and work resumes |
   | `Notification` | `red` | Red **only** for a real permission/approval request; the idle "waiting for your input" notice is ignored so a finished session stays green |
   | `Stop` | `green` | Done responding |
   | `SessionEnd` | `end` | Remove session (clean-exit fast path) |

   **Every** action also stamps a fresh heartbeat on the session file.

2. **State store:** `~/.claude-light/sessions/` holds one JSON file per live session, named
   by `session_id`, containing its `color`, short `project` name (basename of `cwd`), and
   `updated` heartbeat timestamp.

3. **The overlay** polls that directory 5×/sec and:
   - **Reference-counts** the window — it stays open while ≥1 live session exists. Ending
     one session while others are alive does *not* close it.
   - **Self-prunes by process liveness** — each session file records the PID of its owning
     `claude` process. A session is dropped the moment that process is gone, which catches
     hard kills (Ctrl-C / closing a terminal, which skip `SessionEnd`) within one poll *and*
     keeps an idle-but-alive session visible even though it fires no hooks while idle. If the
     PID couldn't be determined, it falls back to the heartbeat-age watchdog (default 60s).
     When the last session is pruned, the overlay quits itself. (`SessionEnd` is just a fast
     path; liveness pruning is the real shutdown.)
   - **Launch-once guard** — `SessionStart` only ever spawns one window. The helper checks a
     PID file before launching detached, and Electron's single-instance lock backs it up.

4. **Window behavior:** frameless, transparent, always-on-top (floats over full-screen apps
   too), non-activating (never steals focus from what you're typing in), click-through (it's
   a passive indicator), no Dock/taskbar entry, and joins all Spaces so it follows you across
   desktops.

---

## Interaction

The overlay is click-through everywhere **except** the traffic lights themselves:

- **Click a bird** → it chirps a random cute affirmation in a little pixel speech bubble and
  does a happy hop. Edit the `AFFIRMATIONS` array near the top of `renderer/renderer.js` to
  change them.
- **Drag a light** → moves the whole overlay anywhere on screen. The position is remembered
  across restarts (saved to `~/.claude-light/position.json`). To snap back to the configured
  corner, delete that file (`rm ~/.claude-light/position.json`) and relaunch.

A quick click is a chirp; moving past a few pixels while held is a drag — so the two never
get confused. Hovering a light briefly disables click-through so the click lands; moving away
restores it. It never takes keyboard focus.

### Hide / show it

When a session is just sitting idle in an open terminal the light stays put (the process is
alive). To get it off your screen on demand:

- **Hotkey:** `Cmd+L` (macOS) toggles it hidden/visible from anywhere. Change or disable
  this via `toggleHotkey` in `config.js`.
- **Command:** `bin/light hide`, `bin/light show`, or `bin/light toggle`. Handy alias
  (point it at wherever you cloned the repo):
  ```sh
  alias light='node "$HOME/claude-code-traffic-light/bin/claude-light.js"'
  # then: light hide   |   light show   |   light toggle
  ```
- **Auto:** starting a **new** Claude Code session always brings it back (the `start` hook
  clears the hidden flag), so you don't get stranded with it off.

Hiding does **not** shut the overlay down — it keeps running (and still quits on its own once
every session ends), so showing it again is instant. The state lives in
`~/.claude-light/hidden`.

The **active lamp glows** (halo + bright core) while the other two go dark, so the lit colour
is the obvious focal point at a glance.

## Install

Requires [Node.js](https://nodejs.org) and [Claude Code](https://claude.com/claude-code).

```bash
git clone https://github.com/nainasachdev10/claude-code-traffic-light
cd claude-code-traffic-light
npm install            # fetches Electron
npm run install-hooks  # wires it into your Claude Code hooks
```

That's it. `install-hooks` adds the seven hooks to your global
`~/.claude/settings.json`, pointing them at *this* folder (wherever you cloned it). It's
safe and re-runnable: it backs up your existing settings first (timestamped
`settings.json.bak.*`) and **merges** — any hooks you already have are left untouched.
Re-run it any time (e.g. after moving the folder) and it cleanly updates the paths.

Start — or restart — any Claude Code session and the overlay launches itself (via the
`SessionStart` hook) in the corner of your screen.

> **Moving the folder?** Just re-run `npm run install-hooks` from the new location.

To run the overlay by hand for testing:

```bash
npm start
```

It will immediately quit if there are no live sessions in `~/.claude-light/sessions/`.

---

## Configuration

### Corner position & heartbeat timeout — `config.js`

```js
module.exports = {
  corner: 'top-right',          // 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
  margin: 8,                    // px from the screen edges
  heartbeatTimeoutMs: 60 * 1000,// fallback watchdog, only used when a session's PID is unknown
  pollMs: 200,                  // poll interval (5×/sec)
};
```

Changes apply the next time the overlay launches (end all sessions, or `pkill -f
'electron .'`, then start a session — or just `npm start`).

> **Note:** pruning is normally driven by whether the owning `claude` process is alive, so
> idle sessions stay put and hard-killed ones disappear fast. `heartbeatTimeoutMs` only kicks
> in for the rare case where the PID couldn't be resolved.

### Colors — `renderer/renderer.js`

Edit the `PAL` object near the top. The warm defaults:

```js
red:    { on: '#e0533a', hi: '#f1856f', off: '#5c2a22' }, // warm tomato
yellow: { on: '#e8a13c', hi: '#f5c074', off: '#5c4422' }, // warm honey
green:  { on: '#6fae54', hi: '#9bd07f', off: '#314a26' }, // warm leaf
```

`on` = lit lamp, `hi` = its specular highlight, `off` = the two unlit lamps. The housing and
bird colors are in the same object. The label font/size is in `styles.css` under `.label`.

The pixel-art size is `SCALE` (display pixels per art pixel) in `renderer.js`; crisp edges
come from `image-rendering: pixelated` in `styles.css`.

---

## Files

```
traffic-light/
├── bin/claude-light.js   # the helper the hooks call
├── install.js            # adds the hooks to ~/.claude/settings.json (npm run install-hooks)
├── uninstall.js          # removes them again (npm run uninstall-hooks)
├── main.js               # Electron main: window + polling + watchdog + ref-count
├── preload.js            # safe IPC bridge to the renderer
├── renderer/
│   ├── index.html
│   ├── styles.css        # layout, label & idle-dot styling
│   └── renderer.js       # pixel-art drawing + bird animation + reconciliation
├── config.js             # corner / margin / heartbeat / poll
└── package.json
```

State (created at runtime): `~/.claude-light/sessions/*.json`, `~/.claude-light/overlay.pid`.

---

## Uninstall

```bash
npm run uninstall-hooks
```

This removes **only** this tool's hooks from `~/.claude/settings.json` (anything else you
have is left untouched), backs the file up first, and clears runtime state in
`~/.claude-light`. Then delete the cloned folder to remove the tool entirely.

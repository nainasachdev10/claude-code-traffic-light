#!/usr/bin/env node
// =====================================================================
// claude-light helper — called by Claude Code hooks.
//
//   node bin/claude-light.js <action>
//
// <action> is one of: start | yellow | red | green | end
// Hook JSON (with session_id + cwd) arrives on stdin.
//
// Every action updates the session's heartbeat. `start` also launches the
// overlay if it isn't already running (launch-once guarded + detached).
// =====================================================================

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const STATE_DIR = path.join(os.homedir(), '.claude-light');
const SESS_DIR = path.join(STATE_DIR, 'sessions');
const PID_FILE = path.join(STATE_DIR, 'overlay.pid');
const HIDE_FILE = path.join(STATE_DIR, 'hidden'); // present => overlay is hidden
const APP_DIR = path.resolve(__dirname, '..');

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch (_) {
    return '';
  }
}

function sanitize(id) {
  return String(id).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'unknown';
}

function alive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

function procInfo(pid) {
  try {
    const out = require('child_process')
      .execSync(`ps -o ppid=,command= -p ${pid}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    const m = out.match(/^\s*(\d+)\s+(.*)$/);
    if (!m) return null;
    return { ppid: parseInt(m[1], 10), cmd: m[2] };
  } catch (_) {
    return null;
  }
}

// The PID of the `claude` CLI process that owns this session. We walk UP the
// process tree from the hook's shell until we hit the claude binary (matched by
// command path). Storing it lets the overlay prune a session the instant its
// process dies (hard kill) and, crucially, KEEP an idle-but-alive session that
// simply isn't firing hooks. Returns 0 if not found (overlay then falls back to
// the heartbeat-age watchdog for that session).
function claudePid() {
  let pid = process.ppid;
  for (let i = 0; i < 12 && pid > 1; i++) {
    const info = procInfo(pid);
    if (!info) break;
    if (/claude/i.test(info.cmd) && !/claude-light/.test(info.cmd)) return pid;
    pid = info.ppid;
  }
  return 0;
}

// Cheap path: reuse the PID we already found if it's still alive, so only the
// first hook of a session pays for the process-tree walk.
function ownerPid(prev) {
  if (prev && prev.pid && alive(prev.pid)) return prev.pid;
  return claudePid();
}

function ensureOverlay() {
  // Launch-once guard: if a live overlay PID is recorded, do nothing.
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'), 10);
    if (alive(pid)) return;
  } catch (_) {}

  const localElectron = path.join(
    APP_DIR,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'electron.cmd' : 'electron'
  );

  let cmd, args;
  if (fs.existsSync(localElectron)) {
    cmd = localElectron;
    args = [APP_DIR];
  } else {
    cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    args = ['electron', APP_DIR];
  }

  // Detached so it outlives the hook and never blocks the session.
  const child = spawn(cmd, args, {
    cwd: APP_DIR,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

function main() {
  const action = (process.argv[2] || 'green').toLowerCase();

  fs.mkdirSync(SESS_DIR, { recursive: true });

  // Manual visibility control (no session data needed).
  if (action === 'hide') { try { fs.writeFileSync(HIDE_FILE, '1'); } catch (_) {} return; }
  if (action === 'show') { try { fs.unlinkSync(HIDE_FILE); } catch (_) {} return; }
  if (action === 'toggle') {
    try {
      if (fs.existsSync(HIDE_FILE)) fs.unlinkSync(HIDE_FILE);
      else fs.writeFileSync(HIDE_FILE, '1');
    } catch (_) {}
    return;
  }

  let data = {};
  const raw = readStdin();
  if (raw) {
    try { data = JSON.parse(raw); } catch (_) {}
  }

  const sid =
    data.session_id || data.sessionId || process.env.CLAUDE_SESSION_ID || 'unknown';
  const cwd =
    data.cwd || (data.workspace && data.workspace.current_dir) || process.cwd();
  const project = path.basename(cwd || '') || 'session';
  const file = path.join(SESS_DIR, sanitize(sid) + '.json');

  if (action === 'end') {
    // Clean-exit fast path. Hard kills are handled by the overlay watchdog.
    try { fs.unlinkSync(file); } catch (_) {}
    return;
  }

  // Previous record, so a non-actionable notification can preserve the color.
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) {}

  let color;
  if (action === 'red') {
    // The Notification hook fires for BOTH a permission/approval request AND the
    // idle "Claude is waiting for your input" notice. Only a real approval
    // request should turn the light red; the idle notice means the task is done,
    // so we leave the color as-is (it will already be green from the Stop hook).
    const msg = String(data.message || '').toLowerCase();
    const needsApproval =
      /permission|approval|approve|needs your|wants to|waiting for your approval|confirm/.test(msg);
    color = needsApproval ? 'red' : (prev.color || 'green');
  } else {
    const COLOR = { start: 'green', green: 'green', yellow: 'yellow' };
    color = COLOR[action] || 'green';
  }

  const rec = {
    session_id: sid,
    project,
    color,
    pid: ownerPid(prev), // owning claude process, for liveness-based pruning
    updated: Date.now(), // heartbeat (fallback when pid is unknown)
  };

  // Atomic-ish write so the polling overlay never reads a half file.
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(rec));
  fs.renameSync(tmp, file);

  if (action === 'start') {
    // A new session means you want to see it again: clear any hide flag.
    try { fs.unlinkSync(HIDE_FILE); } catch (_) {}
    ensureOverlay();
  }
}

try {
  main();
} catch (_) {
  // Hooks must never fail loudly; a broken light shouldn't break a session.
  process.exit(0);
}

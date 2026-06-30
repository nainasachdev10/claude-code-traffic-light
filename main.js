const { app, BrowserWindow, screen, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const config = require('./config');

const STATE_DIR = path.join(os.homedir(), '.claude-light');
const SESS_DIR = path.join(STATE_DIR, 'sessions');
const PID_FILE = path.join(STATE_DIR, 'overlay.pid');
const POS_FILE = path.join(STATE_DIR, 'position.json'); // remembered drag position
const HIDE_FILE = path.join(STATE_DIR, 'hidden'); // present => overlay is hidden

const WIN_W = 520;
const WIN_H = 170;

let win = null;
let pollTimer = null;

// ---- Launch-once guard ---------------------------------------------------
// requestSingleInstanceLock() ensures a second `electron .` (e.g. two
// SessionStart hooks racing) exits immediately instead of opening a 2nd window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

function writePid() {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(PID_FILE, String(process.pid));
  } catch (_) {}
}

function clearPid() {
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, 'utf8'), 10);
    if (pid === process.pid) fs.unlinkSync(PID_FILE);
  } catch (_) {}
}

function processAlive(pid) {
  if (!pid || pid <= 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM'; // exists but not ours to signal
  }
}

function cornerPosition(W, H) {
  const display = screen.getPrimaryDisplay();
  const wa = display.workArea; // excludes the macOS menu bar
  const m = config.margin;
  const left = wa.x + m;
  const right = wa.x + wa.width - W - m;
  const top = wa.y + m;
  const bottom = wa.y + wa.height - H - m;
  switch (config.corner) {
    case 'top-left': return { x: left, y: top };
    case 'bottom-left': return { x: left, y: bottom };
    case 'bottom-right': return { x: right, y: bottom };
    case 'top-right':
    default: return { x: right, y: top };
  }
}

function loadPosition() {
  try {
    const p = JSON.parse(fs.readFileSync(POS_FILE, 'utf8'));
    if (Number.isFinite(p.x) && Number.isFinite(p.y)) return p;
  } catch (_) {}
  return null;
}

function savePosition() {
  if (!win || win.isDestroyed()) return;
  try {
    const [x, y] = win.getPosition();
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(POS_FILE, JSON.stringify({ x, y }));
  } catch (_) {}
}

function createWindow() {
  const { x, y } = loadPosition() || cornerPosition(WIN_W, WIN_H);
  win = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
    x,
    y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false, // never take keyboard focus
    acceptFirstMouse: true, // register the click that lands on the bird
    show: false,
    // 'panel' on macOS = non-activating floating window that won't steal focus
    type: process.platform === 'darwin' ? 'panel' : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Float above normal windows, including full-screen apps.
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnAllScreens: true });

  // Passive indicator: clicks pass straight through to whatever is underneath.
  win.setIgnoreMouseEvents(true, { forward: true });

  // Hand which corner we're in to the renderer so it can anchor its layout.
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('config', { corner: config.corner });
    startPolling();
    win.showInactive(); // show without focusing
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

// ---- State polling -------------------------------------------------------
function readSessions() {
  let files = [];
  try {
    files = fs.readdirSync(SESS_DIR);
  } catch (_) {
    return [];
  }
  const now = Date.now();
  const out = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const p = path.join(SESS_DIR, f);
    try {
      const s = JSON.parse(fs.readFileSync(p, 'utf8'));
      // SELF-PRUNE. Only prune if the owning claude process is actually gone.
      // This keeps idle-but-alive sessions visible (they fire no hooks while
      // idle) and removes hard-killed sessions within one poll.
      const processIsGone = s.pid && !processAlive(s.pid);
      const dead = processIsGone;
      if (dead) {
        try { fs.unlinkSync(p); } catch (_) {}
        continue;
      }
      out.push({
        id: s.session_id || path.basename(f, '.json'),
        project: s.project || 'session',
        color: s.color || 'green',
        updated: s.updated || 0,
      });
    } catch (_) {
      // Half-written file mid-poll; skip this tick, try again next time.
    }
  }
  return out;
}

let hiddenApplied = false;
function applyVisibility() {
  if (!win || win.isDestroyed()) return;
  const hidden = fs.existsSync(HIDE_FILE);
  if (hidden && !hiddenApplied) { win.hide(); hiddenApplied = true; }
  else if (!hidden && hiddenApplied) { win.showInactive(); hiddenApplied = false; }
}

function toggleHidden() {
  try {
    if (fs.existsSync(HIDE_FILE)) fs.unlinkSync(HIDE_FILE);
    else { fs.mkdirSync(STATE_DIR, { recursive: true }); fs.writeFileSync(HIDE_FILE, '1'); }
  } catch (_) {}
  applyVisibility();
}

function tick() {
  const sessions = readSessions();
  // REFERENCE COUNT: window lives as long as >=1 live session exists.
  // (Being hidden does NOT keep it alive — it still quits when sessions end.)
  if (sessions.length === 0) {
    app.quit();
    return;
  }
  applyVisibility(); // honor the hide/show flag without quitting
  if (win && !win.isDestroyed()) {
    win.webContents.send('sessions', sessions);
  }
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(tick, config.pollMs);
  tick();
}

// ---- Interaction: click-through toggle + dragging ------------------------
let dragOffset = null;

function registerIpc() {
  ipcMain.on('overlay:setIgnore', (_e, ignore) => {
    if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(!!ignore, { forward: true });
  });
  ipcMain.on('overlay:dragStart', () => {
    if (!win || win.isDestroyed()) return;
    const p = screen.getCursorScreenPoint();
    const [wx, wy] = win.getPosition();
    dragOffset = { dx: p.x - wx, dy: p.y - wy };
  });
  ipcMain.on('overlay:dragMove', () => {
    if (!win || win.isDestroyed() || !dragOffset) return;
    const p = screen.getCursorScreenPoint();
    win.setPosition(Math.round(p.x - dragOffset.dx), Math.round(p.y - dragOffset.dy));
  });
  ipcMain.on('overlay:dragEnd', () => {
    dragOffset = null;
    savePosition();
  });
}

// ---- App lifecycle -------------------------------------------------------
app.on('second-instance', () => {
  // Another launch attempt arrived; we're already up, so just stay visible.
  if (win && !win.isDestroyed()) win.showInactive();
});

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) app.dock.hide();
  writePid();
  registerIpc();
  if (config.toggleHotkey) {
    try { globalShortcut.register(config.toggleHotkey, toggleHidden); } catch (_) {}
  }
  createWindow();
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { clearPid(); globalShortcut.unregisterAll(); });
process.on('exit', clearPid);

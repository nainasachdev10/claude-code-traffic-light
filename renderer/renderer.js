// =====================================================================
// Renderer: pixel-art traffic lights + a perched bird that chirps cute
// affirmations on click. The whole strip is draggable.
// =====================================================================

// ---- Pixel-art geometry --------------------------------------------------
const ART_W = 20;
const ART_H = 40;
const SCALE = 3; // displayed size = ART * SCALE, kept crisp via image-rendering

const CX = 9;              // housing centre column
const LAMP_R = 3;
const LAMPS = { red: 18, yellow: 25, green: 32 };
const HX0 = 4, HX1 = 15, HY0 = 12, HY1 = 37; // housing box (inclusive)

// ---- Warm, slightly-muted palette ---------------------------------------
// `on` = lit, `core` = bright centre, `hi` = highlight, `dark` = unlit (dim).
const PAL = {
  housing: '#39322d',
  housingHi: '#4a423b',
  housingEdge: '#1f1915',
  red:    { on: '#e0533a', core: '#ff7a5e', hi: '#ffd9cf', dark: '#3a1d18', glow: '#8a3a2a' }, // tomato
  yellow: { on: '#e8a13c', core: '#ffc163', hi: '#fff0d0', dark: '#3a2c16', glow: '#8a5f24' }, // honey
  green:  { on: '#6fae54', core: '#92d36e', hi: '#e3f5d6', dark: '#22331b', glow: '#456b39' }, // leaf
};

// Bird sprite (14 wide). Outlined so it reads clearly as a little songbird:
// head, eye+highlight, beak (right), wing, tail (left), belly, legs.
// O outline  B body  W wing  L belly  E eye  H highlight  K beak  T tail  F legs
const BIRD = [
  '....OOOO......',
  '...OBBBBO.....',
  '..OBBBBBBO....',
  '..OBBBBBBO....',
  '.OBBBEHBBBOKK.',
  'OTTBBBBBBBO...',
  '.OBWWWBBBBO...',
  '.OBWWWBBBLO...',
  '.OBBWWBLLLO...',
  '..OBBLLLLO....',
  '...OOLLOO.....',
  '....OF..FO....',
];
const BIRD_X = 3, BIRD_Y = 0;
const BC = {
  O: '#23303a', // outline
  B: '#7ec0dd', // body (soft blue, pops against warm lamps)
  W: '#4f96b8', // wing
  L: '#fbf3e0', // belly cream
  E: '#1b2730', // eye
  H: '#ffffff', // eye highlight
  K: '#f0a93c', // beak
  T: '#6aa9c6', // tail
  F: '#caa15a', // legs
};

function px(ctx, x, y, color) { ctx.fillStyle = color; ctx.fillRect(x, y, 1, 1); }

function disc(ctx, cx, cy, r, color) {
  const t = r * r + 1;
  for (let y = -r; y <= r; y++)
    for (let x = -r; x <= r; x++)
      if (x * x + y * y <= t) px(ctx, cx + x, cy + y, color);
}

function drawHousing(ctx) {
  for (let y = HY0; y <= HY1; y++) {
    for (let x = HX0; x <= HX1; x++) {
      if ((x === HX0 || x === HX1) && (y === HY0 || y === HY1)) continue; // round corners
      const border = x === HX0 || x === HX1 || y === HY0 || y === HY1;
      let c = border ? PAL.housingEdge : PAL.housing;
      if (!border && x === HX0 + 1) c = PAL.housingHi; // soft left edge light
      px(ctx, x, y, c);
    }
  }
}

// Small horizontal base strip the traffic light stands on.
function drawBase(ctx) {
  const top = HY1 + 1, bot = HY1 + 2; // rows 38, 39
  const x0 = CX - 7, x1 = CX + 7;     // a touch wider than the housing
  for (let x = x0; x <= x1; x++) {
    if (x === x0 || x === x1) { px(ctx, x, bot, PAL.housingEdge); continue; } // rounded ends
    px(ctx, x, top, PAL.housingHi);   // lit top edge
    px(ctx, x, bot, PAL.housingEdge); // dark body
  }
}

function drawLamp(ctx, color, lit) {
  const cy = LAMPS[color];
  const p = PAL[color];
  if (lit) {
    // crisp tinted halo ring -> draws the eye without any blur
    disc(ctx, CX, cy, LAMP_R + 1, p.glow);
    disc(ctx, CX, cy, LAMP_R, p.on);
    disc(ctx, CX, cy, 1, p.core); // bright core
    px(ctx, CX - 1, cy - 1, p.hi);
    px(ctx, CX, cy - 2, p.hi);
  } else {
    disc(ctx, CX, cy, LAMP_R, p.dark); // recede
  }
}

function drawBird(ctx, color, frame) {
  let oy = -frame.hop;
  if (frame.perk) oy -= 1; // perks up when a light is red
  for (let r = 0; r < BIRD.length; r++) {
    const row = BIRD[r];
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === '.') continue;
      let color2;
      if ((ch === 'E' || ch === 'H') && frame.blink) color2 = BC.B; // closed eye
      else color2 = BC[ch];
      if (color2) px(ctx, BIRD_X + c, BIRD_Y + r + oy, color2);
    }
  }
}

function redraw(ctx, color, frame) {
  ctx.clearRect(0, 0, ART_W, ART_H);
  drawHousing(ctx);
  drawBase(ctx);
  drawLamp(ctx, 'red', color === 'red');
  drawLamp(ctx, 'yellow', color === 'yellow');
  drawLamp(ctx, 'green', color === 'green');
  drawBird(ctx, color, frame);
}

// ---- Affirmations --------------------------------------------------------
const AFFIRMATIONS = [
  'you got this, fr',
  'shipping it ✨',
  'clean code, clear mind',
  'one commit at a time',
  'main character energy',
  'green tests incoming 🟢',
  'trust the process 🌱',
  'future you says thanks',
  "you're so smart fr",
  'small steps still count',
  'bug = future feature 🐛',
  'breathe. you’re doing great',
  'big brain moves only',
  'almost there, keep going',
  'proud of you 💛',
  'refactor like a poet',
  'you make hard look easy',
  'logged in & locked in 🔒',
];
let lastAff = -1;
function pickAffirmation() {
  let i;
  do { i = Math.floor(Math.random() * AFFIRMATIONS.length); }
  while (i === lastAff && AFFIRMATIONS.length > 1);
  lastAff = i;
  return AFFIRMATIONS[i];
}

// ---- Strip reconciliation ------------------------------------------------
const strip = document.getElementById('strip');
const entries = new Map(); // id -> entry

function now() { return Date.now(); }
function rand(a, b) { return a + Math.random() * (b - a); }

function makeEntry() {
  const wrap = document.createElement('div');
  wrap.className = 'light';
  const canvas = document.createElement('canvas');
  canvas.width = ART_W;
  canvas.height = ART_H;
  canvas.style.width = ART_W * SCALE + 'px';
  canvas.style.height = ART_H * SCALE + 'px';
  const label = document.createElement('div');
  label.className = 'label';
  wrap.appendChild(canvas);
  wrap.appendChild(label);
  return {
    wrap,
    canvas,
    ctx: canvas.getContext('2d'),
    label,
    bubble: null,
    bubbleTimer: 0,
    color: null,
    frameKey: null,
    blinkUntil: 0,
    hopUntil: 0,
    nextBlink: now() + rand(800, 4000),
    nextHop: now() + rand(4000, 10000),
  };
}

const RANK = { red: 0, yellow: 1, green: 2 };

function reconcile(sessions) {
  sessions.sort((a, b) => {
    const r = (RANK[a.color] ?? 3) - (RANK[b.color] ?? 3);
    if (r !== 0) return r;
    return (a.project || '').localeCompare(b.project || '') || a.id.localeCompare(b.id);
  });

  const seen = new Set();
  sessions.forEach((s, i) => {
    seen.add(s.id);
    let e = entries.get(s.id);
    if (!e) {
      e = makeEntry();
      entries.set(s.id, e);
      strip.appendChild(e.wrap);
    }
    e.wrap.style.order = String(i);
    if (e.label.textContent !== s.project) e.label.textContent = s.project;
    e.color = s.color;
    drawEntry(e, true);
  });

  for (const [id, e] of entries) {
    if (!seen.has(id)) { e.wrap.remove(); entries.delete(id); }
  }
}

function drawEntry(e, force) {
  const t = now();
  const frame = {
    blink: t < e.blinkUntil,
    hop: t < e.hopUntil ? 2 : 0,
    perk: e.color === 'red',
  };
  const key = `${e.color}|${frame.blink ? 1 : 0}|${frame.hop}|${frame.perk ? 1 : 0}`;
  if (!force && key === e.frameKey) return;
  e.frameKey = key;
  redraw(e.ctx, e.color, frame);
}

function chirp(e) {
  if (!e) return;
  if (!e.bubble) {
    e.bubble = document.createElement('div');
    e.bubble.className = 'bubble';
    e.wrap.appendChild(e.bubble);
  }
  e.bubble.textContent = pickAffirmation();
  e.bubble.classList.remove('show');
  void e.bubble.offsetWidth; // restart pop animation
  e.bubble.classList.add('show');
  clearTimeout(e.bubbleTimer);
  e.bubbleTimer = setTimeout(() => e.bubble.classList.remove('show'), 2800);
  e.hopUntil = now() + 480; // happy hop
  drawEntry(e, true);
}

// ---- Subtle, low-CPU idle animation -------------------------------------
function animTick() {
  const t = now();
  for (const e of entries.values()) {
    if (t >= e.nextBlink) { e.blinkUntil = t + 140; e.nextBlink = t + rand(2500, 6500); }
    if (t >= e.nextHop) { e.hopUntil = t + 240; e.nextHop = t + rand(6000, 13000); }
    drawEntry(e, false);
  }
}
setInterval(animTick, 120);

// ---- Interaction: hover toggles click-through, click = chirp, drag = move
let overInteractive = false;
let down = null;       // pending mousedown
let dragging = false;

function hitTest(x, y) {
  for (const e of entries.values()) {
    const r = e.wrap.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return e;
  }
  return null;
}

function setOver(hit) {
  if (hit && !overInteractive) { overInteractive = true; window.overlay.setIgnore(false); }
  else if (!hit && overInteractive) { overInteractive = false; window.overlay.setIgnore(true); }
}

document.addEventListener('mousedown', (e) => {
  const el = e.target.closest && e.target.closest('.light');
  if (!el) return;
  let entry = null;
  for (const ent of entries.values()) if (ent.wrap === el) { entry = ent; break; }
  down = { sx: e.screenX, sy: e.screenY, entry };
});

window.addEventListener('mousemove', (e) => {
  if (down) {
    if (!dragging) {
      const dx = e.screenX - down.sx, dy = e.screenY - down.sy;
      if (dx * dx + dy * dy > 16) { dragging = true; window.overlay.dragStart(); }
    }
    if (dragging) window.overlay.dragMove();
    return;
  }
  setOver(!!hitTest(e.clientX, e.clientY));
});

window.addEventListener('mouseup', () => {
  if (dragging) { dragging = false; window.overlay.dragEnd(); }
  else if (down) { chirp(down.entry); } // a click with no drag = chirp
  down = null;
});

// ---- Wiring --------------------------------------------------------------
window.overlay.onConfig((cfg) => { document.body.dataset.corner = cfg.corner || 'top-right'; });
window.overlay.onSessions((sessions) => reconcile(sessions));
window.__reconcile = reconcile; // screenshot test harness

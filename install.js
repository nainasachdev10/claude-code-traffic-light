#!/usr/bin/env node
// =====================================================================
// Installer for Claude Code Traffic Light.
//
//   npm run install-hooks   (or: node install.js)
//
// Wires this clone into your global Claude Code hooks so the overlay
// launches and updates itself as your sessions run. Safe + re-runnable:
//   - backs up ~/.claude/settings.json before editing
//   - merges; never clobbers hooks you already have
//   - points the hooks at THIS folder (wherever you cloned it)
//   - re-running (or running after moving the folder) cleanly updates
// =====================================================================

const fs = require('fs');
const path = require('path');
const os = require('os');

const APP_DIR = __dirname;
const HELPER = path.join(APP_DIR, 'bin', 'claude-light.js');
const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const SETTINGS = path.join(CLAUDE_DIR, 'settings.json');

// One quoted command per action so paths with spaces are safe.
const cmd = (action) => `node "${HELPER}" ${action}`;

// The hook groups this tool owns. matcher:'*' where Claude Code expects one.
const DESIRED = {
  SessionStart:     [{ hooks: [{ type: 'command', command: cmd('start') }] }],
  UserPromptSubmit: [{ hooks: [{ type: 'command', command: cmd('yellow') }] }],
  PreToolUse:       [{ matcher: '*', hooks: [{ type: 'command', command: cmd('yellow') }] }],
  PostToolUse:      [{ matcher: '*', hooks: [{ type: 'command', command: cmd('yellow') }] }],
  Notification:     [{ hooks: [{ type: 'command', command: cmd('red') }] }],
  Stop:             [{ hooks: [{ type: 'command', command: cmd('green') }] }],
  SessionEnd:       [{ hooks: [{ type: 'command', command: cmd('end') }] }],
};

// True if a hook group belongs to this tool (so we can replace, not duplicate).
function isOurs(group) {
  return (group.hooks || []).some(
    (h) => typeof h.command === 'string' && h.command.includes('claude-light.js')
  );
}

function main() {
  fs.mkdirSync(CLAUDE_DIR, { recursive: true });

  let settings = {};
  if (fs.existsSync(SETTINGS)) {
    const raw = fs.readFileSync(SETTINGS, 'utf8');
    try {
      settings = JSON.parse(raw);
    } catch (e) {
      console.error(`\n✗ ${SETTINGS} is not valid JSON — fix or remove it, then re-run.\n`);
      process.exit(1);
    }
    // Timestamped backup before we touch anything.
    const backup = `${SETTINGS}.bak.${Date.now()}`;
    fs.writeFileSync(backup, raw);
    console.log(`• Backed up existing settings → ${backup}`);
  }

  settings.hooks = settings.hooks || {};

  for (const [event, groups] of Object.entries(DESIRED)) {
    const existing = Array.isArray(settings.hooks[event]) ? settings.hooks[event] : [];
    // Drop any prior entries from this tool (handles re-install / moved folder),
    // keep everything else the user has.
    const kept = existing.filter((g) => !isOurs(g));
    settings.hooks[event] = [...kept, ...groups];
  }

  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');

  console.log('\n🚦 Traffic Light installed into your Claude Code hooks.');
  console.log(`   Helper: ${HELPER}`);
  console.log('   Start (or restart) any Claude Code session to see your lights.');
  console.log('   Hide/show anytime with Cmd+L, or: node bin/claude-light.js toggle');
  console.log('   To remove: npm run uninstall-hooks\n');
}

try {
  main();
} catch (e) {
  console.error('\n✗ Install failed:', e.message, '\n');
  process.exit(1);
}

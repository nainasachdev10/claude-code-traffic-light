#!/usr/bin/env node
// =====================================================================
// Uninstaller for Claude Code Traffic Light.
//
//   npm run uninstall-hooks   (or: node uninstall.js)
//
// Removes only this tool's hooks from ~/.claude/settings.json (anything
// else you have is left untouched), backs up first, and clears runtime
// state in ~/.claude-light.
// =====================================================================

const fs = require('fs');
const path = require('path');
const os = require('os');

const SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const STATE_DIR = path.join(os.homedir(), '.claude-light');

function isOurs(group) {
  return (group.hooks || []).some(
    (h) => typeof h.command === 'string' && h.command.includes('claude-light.js')
  );
}

function main() {
  if (fs.existsSync(SETTINGS)) {
    const raw = fs.readFileSync(SETTINGS, 'utf8');
    let settings;
    try {
      settings = JSON.parse(raw);
    } catch (e) {
      console.error(`\n✗ ${SETTINGS} is not valid JSON — nothing changed.\n`);
      process.exit(1);
    }

    const backup = `${SETTINGS}.bak.${Date.now()}`;
    fs.writeFileSync(backup, raw);
    console.log(`• Backed up existing settings → ${backup}`);

    if (settings.hooks) {
      for (const event of Object.keys(settings.hooks)) {
        const arr = settings.hooks[event];
        if (!Array.isArray(arr)) continue;
        const kept = arr.filter((g) => !isOurs(g));
        if (kept.length) settings.hooks[event] = kept;
        else delete settings.hooks[event]; // no empty leftover events
      }
      if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
    }

    fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
    console.log('• Removed Traffic Light hooks from settings.json');
  } else {
    console.log('• No settings.json found — nothing to remove.');
  }

  // Best-effort cleanup of runtime state (sessions, pid, position, hidden flag).
  try {
    fs.rmSync(STATE_DIR, { recursive: true, force: true });
    console.log(`• Cleared runtime state (${STATE_DIR})`);
  } catch (_) {}

  console.log('\n🚦 Uninstalled. (Delete this folder to remove the tool entirely.)\n');
}

try {
  main();
} catch (e) {
  console.error('\n✗ Uninstall failed:', e.message, '\n');
  process.exit(1);
}

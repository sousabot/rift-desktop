const { spawn } = require('child_process');
const path = require('path');

const SCRIPT = path.join(__dirname, 'edit-hotkey.ps1');

let child = null;
let onEdit = null;
let onScout = null;
let stopping = false;
let restartTimer = null;

function start(editCb, scoutCb) {
  onEdit = editCb;
  onScout = scoutCb;
  if (process.platform !== 'win32') return;
  stopping = false;
  if (child) return;

  child = spawn('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy', 'Bypass',
    '-File', SCRIPT,
  ], { windowsHide: true });

  let buf = '';
  child.stdout.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() || '';
    for (const line of lines) {
      const tag = String(line).trim();
      if (tag === 'EDIT_HOTKEY' || tag === 'HOTKEY') {
        try { onEdit?.(); } catch { /* ignore */ }
      } else if (tag === 'SCOUT_HOTKEY') {
        try { onScout?.(); } catch { /* ignore */ }
      }
    }
  });
  child.stderr.on('data', () => { /* compile noise */ });
  child.on('exit', () => {
    child = null;
    if (stopping) return;
    restartTimer = setTimeout(() => {
      restartTimer = null;
      start(onEdit, onScout);
    }, 800);
  });
}

function stop() {
  stopping = true;
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  if (child) {
    try { child.kill(); } catch { /* ignore */ }
    child = null;
  }
}

module.exports = { start, stop };

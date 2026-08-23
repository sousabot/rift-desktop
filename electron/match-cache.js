// Runs in the Electron MAIN process. Match and timeline data for a completed
// game never changes, so this cache has no TTL — once fetched, a matchId is
// cached forever (capped at MAX_ENTRIES to keep the file from growing
// unbounded across many different players tested over time).

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const MAX_ENTRIES = 1200;
const FLUSH_MS = 500;

let memory = null;
let flushTimer = null;
let dirty = false;

function cachePath() {
  return path.join(app.getPath('userData'), 'match-cache.json');
}

function readCache() {
  if (memory) return memory;
  try {
    memory = JSON.parse(fs.readFileSync(cachePath(), 'utf-8'));
  } catch {
    memory = {};
  }
  return memory;
}

function flushNow() {
  flushTimer = null;
  if (!dirty || !memory) return;
  dirty = false;
  const data = memory;
  const keys = Object.keys(data);
  if (keys.length > MAX_ENTRIES) {
    for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete data[k];
  }
  try {
    fs.writeFileSync(cachePath(), JSON.stringify(data));
  } catch (err) {
    console.warn('[match-cache] flush failed:', err?.message || err);
  }
}

function writeCache(data) {
  memory = data;
  dirty = true;
  if (flushTimer) return;
  // Defer disk I/O so leaderboard/search IPC stays responsive.
  flushTimer = setTimeout(flushNow, FLUSH_MS);
}

function flushSync() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flushNow();
}

try {
  app?.whenReady?.().then(() => {
    app.on('before-quit', flushSync);
  });
} catch { /* app may not be ready in tests */ }

module.exports = { readCache, writeCache, flushSync };

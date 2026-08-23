// Runs in the Electron MAIN process. Caches puuid -> {gameName, tagLine} and
// puuid -> {profileIconId} lookups on disk so repeat page loads (the
// leaderboard especially) don't re-resolve the same 20-50 players every
// single time and burn through Riot's rate limit for no reason.

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const TTL_MS = 24 * 60 * 60 * 1000; // Riot IDs and profile icons rarely change day to day
const FLUSH_MS = 400;

let memory = null;
let flushTimer = null;
let dirty = false;

function cachePath() {
  return path.join(app.getPath('userData'), 'puuid-cache.json');
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
  try {
    // Compact JSON — pretty-print was freezing the UI on large leaderboard fills.
    fs.writeFileSync(cachePath(), JSON.stringify(memory));
  } catch (err) {
    console.warn('[id-cache] flush failed:', err?.message || err);
  }
}

function writeCache(data) {
  memory = data;
  dirty = true;
  if (flushTimer) return;
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
} catch { /* ignore */ }

module.exports = { readCache, writeCache, flushSync, TTL_MS };

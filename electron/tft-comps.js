/** Desktop IPC — TFT comps feed + pinned overlay comp. */

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');
const { handle } = require('./ipc-handle');

function cacheDir() {
  if (!process.env.RIFT_CACHE_DIR) {
    try {
      process.env.RIFT_CACHE_DIR = path.join(app.getPath('userData'), 'rift-cache');
    } catch { /* ignore */ }
  }
}

function pinPath() {
  return path.join(app.getPath('userData'), 'tft-pinned.json');
}

function loadPinned() {
  try {
    const raw = JSON.parse(fs.readFileSync(pinPath(), 'utf8'));
    if (raw && typeof raw === 'object' && raw.id) return raw;
  } catch { /* first run */ }
  return null;
}

function savePinned(comp) {
  if (!comp || !comp.id) {
    try { fs.unlinkSync(pinPath()); } catch { /* ignore */ }
    return null;
  }
  const payload = {
    id: String(comp.id),
    name: String(comp.name || ''),
    tier: String(comp.tier || ''),
    avgPlacement: comp.avgPlacement ?? null,
    pickRate: comp.pickRate ?? null,
    playCount: comp.playCount ?? 0,
    traits: Array.isArray(comp.traits) ? comp.traits : [],
    units: Array.isArray(comp.units) ? comp.units : [],
    stages: Array.isArray(comp.stages) ? comp.stages : [],
    itemGuide: Array.isArray(comp.itemGuide) ? comp.itemGuide : [],
    pinnedAt: Date.now(),
  };
  try { fs.writeFileSync(pinPath(), JSON.stringify(payload)); } catch { /* ignore */ }
  return payload;
}

function broadcastPinned(comp) {
  for (const win of BrowserWindow.getAllWindows()) {
    try { win.webContents.send('tft:pinned', comp); } catch { /* ignore */ }
  }
}

function emptyPayload(error) {
  return {
    builtAt: Date.now(),
    clusterId: null,
    tftSet: '',
    source: 'metatft',
    comps: [],
    units: [],
    error,
  };
}

module.exports = function registerTftComps(ipcMain) {
  try { cacheDir(); } catch { /* ignore */ }
  let getTftComps = null;
  try {
    getTftComps = require('../server/tft-comps').getTftComps;
  } catch (err) {
    console.error('[tft] server/tft-comps.js is not in this build:', err?.message || err);
  }

  try {
    handle(ipcMain, 'tft:comps', async (_e, args = {}) => {
      try {
        if (typeof getTftComps !== 'function') {
          return emptyPayload('TFT comps are missing from this install. Update to the latest Setup build.');
        }
        return await getTftComps(args || {});
      } catch (err) {
        return emptyPayload(err?.message || 'Could not load TFT comps');
      }
    });
  } catch (err) {
    console.error('[tft] tft:comps handle failed:', err);
  }

  try {
    handle(ipcMain, 'tft:getPinned', () => {
      try { return loadPinned(); } catch { return null; }
    });
  } catch (err) {
    console.error('[tft] tft:getPinned handle failed:', err);
  }

  try {
    handle(ipcMain, 'tft:setPinned', (_e, comp) => {
      try {
        const next = savePinned(comp || null);
        broadcastPinned(next);
        return next;
      } catch {
        return null;
      }
    });
  } catch (err) {
    console.error('[tft] tft:setPinned handle failed:', err);
  }
};

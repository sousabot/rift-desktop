/** Desktop IPC — shared DPM tier list (same WR as dpm.lol / server). */

const path = require('path');
const { app } = require('electron');
const { handle } = require('./ipc-handle');

module.exports = function registerTierList(ipcMain) {
  // Prefer app userData for cache when running in Electron.
  if (!process.env.RIFT_CACHE_DIR) {
    try {
      process.env.RIFT_CACHE_DIR = path.join(app.getPath('userData'), 'rift-cache');
    } catch { /* ignore */ }
  }

  const { getTierList } = require('../server/tierlist');

  handle(ipcMain, 'riot:getTierList', async (_e, args) => {
    try {
      return await getTierList(args || {});
    } catch (err) {
      return {
        platform: args?.platform || 'euw1',
        rank: args?.rank || 'master',
        patch: 'live',
        matches: 0,
        analysed: 0,
        builtAt: Date.now(),
        rows: [],
        source: 'dpm',
        error: err?.message || 'Could not load the tier list. Try again in a moment.',
      };
    }
  });
};

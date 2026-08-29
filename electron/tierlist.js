/** Desktop IPC — shared DPM tier list (same WR as dpm.lol / server). */

const path = require('path');
const { app } = require('electron');
const { handle } = require('./ipc-handle');
const { DEFAULT_PROXY, apiUrl } = require('./rift-env');

function loadGetTierList() {
  try {
    return require('../server/tierlist').getTierList;
  } catch (err) {
    console.error('[tierlist] server/tierlist.js is not in this build:', err?.message || err);
    return null;
  }
}

async function fetchTierListFromProxy(args = {}) {
  const base = (apiUrl() || DEFAULT_PROXY).replace(/\/$/, '');
  const qs = new URLSearchParams({
    platform: String(args.platform || 'euw1').toLowerCase(),
    rank: String(args.rank || 'master').toLowerCase(),
  });
  if (args.force) qs.set('force', '1');
  const res = await fetch(`${base}/v1/web/tierlist?${qs}`, {
    headers: { Accept: 'application/json', 'User-Agent': 'Rift.lol-Desktop' },
    signal: AbortSignal.timeout(25000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Tier list ${res.status}`);
  return body;
}

module.exports = function registerTierList(ipcMain) {
  if (!process.env.RIFT_CACHE_DIR) {
    try {
      process.env.RIFT_CACHE_DIR = path.join(app.getPath('userData'), 'rift-cache');
    } catch { /* ignore */ }
  }

  const getTierList = loadGetTierList();

  handle(ipcMain, 'riot:getTierList', async (_e, args) => {
    try {
      if (typeof getTierList === 'function') return await getTierList(args || {});
      return await fetchTierListFromProxy(args || {});
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

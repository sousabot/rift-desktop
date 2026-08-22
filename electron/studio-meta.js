const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const BASE = 'https://dpm.lol/v1/studio';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_SCHEMA = 5;

const VIEW_PATH = {
  'rank-dist': 'ranks/distribution',
  icons: 'profileicons',
  level: 'level/champion',
  banned: 'bans',
  time: 'hours',
  duration: 'duration/champion',
  early: 'early/champion',
  late: 'late/champion',
  'win-surrender': 'wsurrender/champion',
  'lose-surrender': 'lsurrender/champion',
  kda: 'kda/champion',
  kills: 'kills/champion',
  deaths: 'deaths/champion',
  'first-blood': 'fb/champion',
  pentas: 'pentaKills/champion',
  csm: 'csm/champion',
  gold15: 'gold/champion',
  cs15: 'cs/champion',
  xp15: 'xp/champion',
  plates: 'plates/champion',
  pings: 'pings/champion',
  drakes: 'drakes/champion',
  barons: 'barons/champion',
  grubs: 'grubs/champion',
  rifts: 'rifts/champion',
  steals: 'steals/champion',
  souls: 'souls',
};

/** Views that only expose /champion (no /rank or /platform). */
const CHAMPION_ONLY = new Set(['early', 'late', 'souls', 'banned', 'time', 'icons', 'rank-dist']);

function resolveEndpoint(view, dimension = 'champion') {
  const base = VIEW_PATH[view];
  if (!base) return null;
  if (!base.endsWith('/champion')) return base;
  if (dimension === 'champion' || CHAMPION_ONLY.has(view)) return base;
  if (dimension === 'rank' || dimension === 'platform') {
    return base.replace(/\/champion$/, `/${dimension}`);
  }
  return base;
}

const QUEUE_MAP = {
  420: 'soloq',
  440: 'flex',
  soloq: 'soloq',
  flex: 'flex',
  Solo: 'soloq',
  Flex: 'flex',
};

function cachePath() {
  return path.join(app.getPath('userData'), 'studio-meta.json');
}

function readCache() {
  try {
    return JSON.parse(fs.readFileSync(cachePath(), 'utf-8'));
  } catch {
    return {};
  }
}

function writeCache(data) {
  try {
    fs.writeFileSync(cachePath(), JSON.stringify(data));
  } catch { /* ignore */ }
}

function cacheKey(parts) {
  return parts.filter(Boolean).join(':');
}

function normalizeRows(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.rows)) return raw.rows;
  if (Array.isArray(raw?.buckets)) return raw.buckets;
  if (Array.isArray(raw?.groups)) {
    return raw.groups.flatMap((group) => (
      (group.rows || []).map((row) => ({
        key: row.championName || row.key,
        value: row.winrate ?? row.value,
        blueside: row.blueside,
        redside: row.redside,
        total: row.games ?? row.total,
        soul: group.soul || null,
      }))
    ));
  }
  if (raw && typeof raw === 'object') {
    const vals = Object.values(raw).filter((v) => v && typeof v === 'object' && !Array.isArray(v));
    if (vals.length && vals.every((v) => 'key' in v || 'championId' in v || 'tier' in v)) return vals;
  }
  return [];
}

function queueSlug(queue) {
  return QUEUE_MAP[queue] || QUEUE_MAP[Number(queue)] || 'soloq';
}

function laneSlug(role) {
  if (!role) return 'all';
  const map = {
    Top: 'top',
    Jungle: 'jungle',
    Mid: 'mid',
    ADC: 'adc',
    Support: 'support',
  };
  return map[role] || 'all';
}

async function fetchJson(url) {
  const headers = {
    Accept: 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Origin: 'https://dpm.lol',
    Referer: 'https://dpm.lol/studio',
  };
  let res;
  try {
    const { net, session } = require('electron');
    res = await net.fetch(url, { headers });
    if (res.status === 403 && session?.defaultSession?.fetch) {
      res = await session.defaultSession.fetch(url, { headers });
    }
  } catch {
    res = await fetch(url, { headers });
  }
  const text = await res.text();
  if (!res.ok || text.trimStart().startsWith('<')) {
    const err = new Error(`studio ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return JSON.parse(text);
}

module.exports = function registerStudioMeta(ipcMain) {
  const inflight = new Map();

  async function loadView(args = {}) {
    const view = args.view || 'home';
    const platform = (args.platform || 'euw1').toLowerCase();
    const queue = queueSlug(args.queue);
    const tier = args.tier || 'emerald_plus';
    const timeframe = args.timeframe || '30days';
    const lane = laneSlug(args.role);
    let dimension = args.dimension || 'champion';
    if (CHAMPION_ONLY.has(view) || !['champion', 'rank', 'platform'].includes(dimension)) {
      dimension = 'champion';
    }
    const endpoint = resolveEndpoint(view, dimension);

    if (!endpoint) {
      return {
        view,
        platform,
        queue,
        dimension,
        rows: [],
        totalPlayers: null,
        totalMatches: null,
        updatedAt: null,
        source: 'dpm',
      };
    }

    const key = cacheKey([CACHE_SCHEMA, view, dimension, platform, queue, tier, timeframe, lane]);
    const store = readCache();
    const hit = store[key];
    if (hit?.at && Date.now() - hit.at < CACHE_TTL_MS && hit.data) {
      return { ...hit.data, cached: true };
    }

    if (inflight.has(key)) return inflight.get(key);

    const job = (async () => {
      let url;
      if (view === 'rank-dist') {
        url = `${BASE}/${endpoint}?platform=${encodeURIComponent(platform)}&queue=${encodeURIComponent(queue)}`;
      } else if (view === 'icons' || view === 'souls') {
        url = `${BASE}/${endpoint}`;
      } else if (view === 'banned' || view === 'time') {
        url = `${BASE}/${endpoint}?tier=${encodeURIComponent(tier)}&timeframe=${encodeURIComponent(timeframe)}`;
      } else if (dimension === 'rank' || dimension === 'platform') {
        url = `${BASE}/${endpoint}?timeframe=${encodeURIComponent(timeframe)}`;
      } else {
        const params = new URLSearchParams({ tier, timeframe });
        url = `${BASE}/${endpoint}?${params.toString()}`;
      }

      const raw = await fetchJson(url);
      const rows = normalizeRows(raw);
      const payload = {
        view,
        dimension,
        platform: (!Array.isArray(raw) && raw.platform) || platform.toUpperCase(),
        queue,
        tier,
        timeframe,
        lane,
        rows,
        groups: (!Array.isArray(raw) && raw.groups) || null,
        max: (!Array.isArray(raw) && raw.max) ?? null,
        totalPlayers: (!Array.isArray(raw) && raw.totalPlayers) ?? null,
        totalMatches: (!Array.isArray(raw) && raw.totalMatches) ?? null,
        updatedAt: (!Array.isArray(raw) && raw.updatedAt) || null,
        source: 'dpm',
        refreshing: false,
      };
      store[key] = { at: Date.now(), data: payload };
      writeCache(store);
      return payload;
    })().finally(() => inflight.delete(key));

    inflight.set(key, job);
    return job;
  }

  ipcMain.handle('studio:getMeta', async (_e, args = {}) => {
    try {
      // Back-compat: no view → rank distribution summary for header counts
      if (!args.view || args.view === 'home') {
        const dist = await loadView({ ...args, view: 'rank-dist' });
        return {
          key: cacheKey([args.platform || 'euw1', queueSlug(args.queue), 'home']),
          games: [],
          rankDist: null,
          distribution: dist,
          matches: dist.totalMatches || 0,
          players: dist.totalPlayers || 0,
          refreshing: false,
          source: 'dpm',
          platform: dist.platform,
          updatedAt: dist.updatedAt,
        };
      }
      return await loadView(args);
    } catch (err) {
      return {
        view: args.view || 'home',
        error: err.message || 'Failed to load studio data',
        rows: [],
        refreshing: false,
        source: 'dpm',
      };
    }
  });
};

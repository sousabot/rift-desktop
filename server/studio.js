/** Public Data Studio proxy — same DPM.lol studio feed as the desktop app. */

const fs = require('fs');
const path = require('path');
const cloudscraper = require('cloudscraper');
const { publicError, blockedError } = require('./safe-error');

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

const CHAMPION_ONLY = new Set(['early', 'late', 'souls', 'banned', 'time', 'icons', 'rank-dist']);

const QUEUE_MAP = {
  420: 'soloq',
  440: 'flex',
  soloq: 'soloq',
  flex: 'flex',
  Solo: 'soloq',
  Flex: 'flex',
};

const cache = new Map();
const inflight = new Map();
let bundledFallback = null;

function loadBundledFallback() {
  if (bundledFallback) return bundledFallback;
  try {
    bundledFallback = JSON.parse(fs.readFileSync(path.join(__dirname, 'studio-fallback.json'), 'utf8'));
  } catch {
    bundledFallback = { icons: [], rankDist: {}, at: null };
  }
  return bundledFallback;
}

function snapshotFor(view, platform, queue) {
  const data = loadBundledFallback();
  if (view === 'icons' && data.icons?.length) {
    return {
      view: 'icons',
      rows: data.icons,
      groups: null,
      max: null,
      totalPlayers: null,
      totalMatches: null,
      updatedAt: data.at || null,
      source: 'snapshot',
    };
  }
  if (view === 'rank-dist') {
    const raw = data.rankDist?.[platform]?.[queue]
      || data.rankDist?.[platform]?.soloq
      || data.rankDist?.euw1?.soloq;
    if (!raw) return null;
    return {
      view: 'rank-dist',
      platform: raw.platform || String(platform || 'euw1').toUpperCase(),
      queue,
      rows: normalizeRows(raw),
      groups: null,
      max: null,
      totalPlayers: raw.totalPlayers ?? null,
      totalMatches: raw.totalMatches ?? null,
      updatedAt: raw.updatedAt || data.at || null,
      source: 'snapshot',
    };
  }
  return null;
}

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
  let body;
  try {
    body = await cloudscraper.get({
      uri: url,
      headers: {
        Accept: 'application/json',
        Origin: 'https://dpm.lol',
        Referer: 'https://dpm.lol/studio',
      },
    });
  } catch {
    throw blockedError('Data Studio');
  }
  const text = String(body || '');
  if (text.trimStart().startsWith('<')) throw blockedError('Data Studio');
  return JSON.parse(text);
}

async function loadView(args = {}) {
  const view = args.view || 'home';
  const platform = String(args.platform || 'euw1').toLowerCase();
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
  const hit = cache.get(key);
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

    let raw;
    try {
      raw = await fetchJson(url);
    } catch (err) {
      const snap = snapshotFor(view, platform, queue);
      if (snap) {
        const payload = {
          ...snap,
          dimension,
          platform: snap.platform || platform.toUpperCase(),
          queue,
          tier,
          timeframe,
          lane,
          refreshing: false,
        };
        cache.set(key, { at: Date.now(), data: payload });
        return payload;
      }
      throw err;
    }
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
    cache.set(key, { at: Date.now(), data: payload });
    return payload;
  })().finally(() => inflight.delete(key));

  inflight.set(key, job);
  return job;
}

async function getStudioMeta(args = {}) {
  try {
    if (!args.view || args.view === 'home') {
      const dist = await loadView({ ...args, view: 'rank-dist' });
      return {
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
      error: publicError(err, 'Could not load Data Studio.'),
      rows: [],
      refreshing: false,
      source: 'dpm',
    };
  }
}

module.exports = { getStudioMeta };

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const TTL_MS = 6 * 60 * 60 * 1000;
const LANES = ['top', 'jungle', 'middle', 'bottom', 'support'];

const ROLE_LABEL = {
  top: 'Top',
  jungle: 'Jungle',
  middle: 'Mid',
  bottom: 'ADC',
  support: 'Support',
};

const TIER_LABEL = [
  '?', 'S+', 'S', 'S-', 'A+', 'A', 'A-',
  'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-',
];

const PLATFORM_REGION = {
  euw1: 'euw',
  eun1: 'eune',
  na1: 'na',
  br1: 'br',
  la1: 'lan',
  la2: 'las',
  kr: 'kr',
  jp1: 'jp',
  oc1: 'oce',
  tr1: 'tr',
  ru: 'ru',
  me1: 'me',
  sg2: 'sg',
  ph2: 'ph',
  tw2: 'tw',
  th2: 'th',
  vn2: 'vn',
};

const inflight = new Map();
let champNameCache = null;

function cachePath() {
  return path.join(app.getPath('userData'), 'tierlist-cache.json');
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data));
}

function readAll() {
  return readJson(cachePath(), {});
}

function writeAll(data) {
  writeJson(cachePath(), data);
}

function cacheKey(platform, rank) {
  return `${platform}:${rank}`;
}

function patchOf(version) {
  const parts = String(version || '').split('.');
  if (parts.length < 2) return '';
  return `${parts[0]}.${parts[1]}`;
}

async function httpGet(url) {
  const headers = {
    accept: 'application/json',
    origin: 'https://lolalytics.com',
    referer: 'https://lolalytics.com/lol/tierlist/',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  };
  let res;
  try {
    const { net } = require('electron');
    res = await net.fetch(url, { headers });
  } catch {
    res = await fetch(url, { headers });
  }
  if (!res.ok) throw new Error(`lolalytics ${res.status}`);
  return res.json();
}

async function currentPatch() {
  try {
    const versions = await httpGet('https://ddragon.leagueoflegends.com/api/versions.json');
    return patchOf(Array.isArray(versions) ? versions[0] : '');
  } catch {
    return '';
  }
}

async function loadChampionNames() {
  if (champNameCache) return champNameCache;
  try {
    const versions = await httpGet('https://ddragon.leagueoflegends.com/api/versions.json');
    const ver = Array.isArray(versions) ? versions[0] : null;
    if (!ver) return {};
    const data = await httpGet(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/en_US/champion.json`);
    const map = {};
    Object.values(data.data || {}).forEach((ch) => {
      map[String(ch.key)] = ch.name;
    });
    champNameCache = map;
    return map;
  } catch {
    return {};
  }
}

function tierLabel(n) {
  const idx = Number(n) || 0;
  return TIER_LABEL[idx] || '?';
}

function metaScoreOf(row) {
  const tier = Number(row.tierNum) || 99;
  const rank = Number(row.roleRank) || 999;
  return (16 - tier) * 1000 - rank + (row.winrate || 0) * 0.01;
}

function listUrl({ lane, rank, region, patch }) {
  const q = new URLSearchParams({
    ep: 'list',
    queue: '420',
    lane,
    tier: rank,
  });
  if (region) q.set('region', region);
  if (patch) q.set('patch', patch);
  return `https://a1.lolalytics.com/mega/?${q.toString()}`;
}

function rowsFromPayload(payload, lane, names) {
  const rows = [];
  for (const [id, entry] of Object.entries(payload?.cid || {})) {
    if (!entry || !entry.tier || !entry.games) continue;
    const champion = names[id];
    if (!champion) continue;
    const role = ROLE_LABEL[lane] || ROLE_LABEL[entry.lane] || 'Top';
    rows.push({
      champion,
      role,
      games: Number(entry.games) || 0,
      winrate: Number(entry.wr) || 0,
      pickrate: Number(entry.pr) || 0,
      banrate: Number(entry.br) || 0,
      lanePct: Number(entry.pctLane) || 0,
      tier: tierLabel(entry.tier),
      tierNum: Number(entry.tier) || 0,
      delta: Number(entry.avgWrDelta) || 0,
      pbi: Number(entry.pbi) || 0,
      roleRank: Number(entry.rank) || 9999,
      score: Number(entry.wr) || 0,
      lowSample: false,
    });
  }
  for (const row of rows) {
    row.metaScore = Number(metaScoreOf(row).toFixed(2));
  }
  return rows;
}

function assignGlobalRank(rows) {
  const ranked = [...rows].sort((a, b) => {
    if (a.tierNum !== b.tierNum) return a.tierNum - b.tierNum;
    return a.roleRank - b.roleRank;
  });
  ranked.forEach((row, i) => { row.rank = i + 1; });
}

async function fetchTierList({ platform = 'euw1', rank = 'master', patch = '' } = {}) {
  const region = PLATFORM_REGION[String(platform || '').toLowerCase()] || 'euw';
  const names = await loadChampionNames();
  const payloads = await Promise.all(
    LANES.map(async (lane) => {
      const data = await httpGet(listUrl({ lane, rank, region, patch }));
      return { lane, data };
    }),
  );

  const analysed = Math.max(...payloads.map(({ data }) => Number(data.analysed) || 0));
  const avgWr = payloads.find(({ data }) => data.avgWr != null)?.data.avgWr ?? null;
  const rows = payloads.flatMap(({ lane, data }) => rowsFromPayload(data, lane, names));
  assignGlobalRank(rows);

  return {
    platform,
    rank,
    region,
    patch: patch || 'live',
    matches: analysed,
    analysed,
    avgWr,
    reliable: rows.length,
    builtAt: Date.now(),
    source: 'aggregate',
    refreshing: false,
    rows,
  };
}

module.exports = function registerTierList(ipcMain) {
  async function getTierList({ platform = 'euw1', rank = 'master', force = false } = {}) {
    const key = cacheKey(platform, rank);
    const all = readAll();
    const cached = all[key];
    const fresh = cached?.data?.rows?.length && Date.now() - cached.at < TTL_MS;
    if (fresh && !force) return cached.data;

    if (inflight.has(key)) return inflight.get(key);

    const job = (async () => {
      const patch = await currentPatch();
      const data = await fetchTierList({ platform, rank, patch });
      const next = readAll();
      next[key] = { at: Date.now(), data };
      writeAll(next);
      return data;
    })().finally(() => inflight.delete(key));

    inflight.set(key, job);
    return job;
  }

  ipcMain.handle('riot:getTierList', async (_e, args) => {
    try {
      return await getTierList(args || {});
    } catch (err) {
      const all = readAll();
      const key = cacheKey(args?.platform || 'euw1', args?.rank || 'master');
      const cached = all[key]?.data;
      if (cached?.rows?.length) {
        return { ...cached, error: 'Showing cached tier list — live refresh failed.', stale: true };
      }
      return {
        platform: args?.platform || 'euw1',
        rank: args?.rank || 'master',
        patch: 'live',
        matches: 0,
        analysed: 0,
        builtAt: Date.now(),
        rows: [],
        error: err?.message || 'Could not load the tier list. Try again in a moment.',
      };
    }
  });
};
